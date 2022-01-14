// plateau logic, updated 08/24:
// 0. load posenet and constantly send over joint distance (in pixels)
// 1. once KNN is loaded and classification started, constantly send over the current classification;
// 2. send a plateau (its class, start time and end time) once it's detected, converted from MiMi's plateau code;
// 3. plateau observation window length: 120 frames, adjustable via slider;
// 4. what counts as the starting / ending of a plateau: given the current window, more than / less than <threshold> of frames is one class;
// To-do: complete video mode (accept socket messages to start to play video and scrub video)

//------------------socket--------------------
let socket;
//let ip = "10.0.0.2"; //the IP of the machine that runs bridge.js
let ip = "127.0.0.1"; //or local host
let port = 8081; //the port of the machine that runs bridge.js

//--------simple UI--------------------
let cnv;
let waiting = 180;

let classResult = 0;
let classCache = [];
let cacheLength = 20; //classification window size

let maxClass, maxCount;
let pMaxClass;
let classThreshold = 0.8;
let newClassCountBaseline = cacheLength * classThreshold; //calculate the baseline for deciding how much % within the window we count as a new class
let plateauStarted = false;
let plateauStartTime, plateauEndTime;
let plateauMinLength = 1000;
let plateaus = [];
let endPlateau = false;
let sender = -1;
const SENDPLATEAUS = 0;
const SENDCLASS = 1;

let classCacheLengthSlider;
let recordBtn, downloadBtn;
let clearBtn;

//------------------movenet & KNN----------------------
let video;
let msk;
let MSK_MARGIN = 100;

// let poseNet;
let moveNet;
let netReady = false;
let poses = [];
let classifier;
let kvalue = 20;
let isClassifying = false;
let loadKNNBtn, classifyBtn;
let classIndexOffset = 0;
let timeOfLastPose = 0;
let itsBeenAWhile = false;
const NOBODY = 500;

//-----------------speed-based delay----------------------
let joint, jointPrev;
let jointNumber = 0;
let jointThreshold = 0.6;

//------------------normalization & calibration-------------------
// bounding box
let pose;
let poseNorm;
let minX, minY, maxX, maxY, bboxW, bboxH;
// normalization
let nx, ny;
// Have we calibrated?
let calibrated = false;

//-----------------for graphing-------------------------
let currentClassConfidence = 0;
let confidenceCache = [0];
let stats = new Stats();
let cPanel = stats.addPanel(new Stats.Panel("conf", "#ff8", "#221"));
stats.showPanel(3);
document.body.appendChild(stats.dom);

//-----------------for confidence thresholding----------------
let confidenceThres = 90; //this is percentage
const TRASHCLASS = "trash";

function preload() {
  //used for video mode
  // video = createVideo('https://player.vimeo.com/external/591790914.hd.mp4?s=5423196882ed55a554896959f602c265d48c0af4&profile_id=175');
  // video = createVideo('dp.mp4');
  // video.loop();
}

function setup() {
  classCacheLengthSlider = createSlider(10, 180, cacheLength, 10);
  classCacheLengthSlider.parent("controlsDiv");
  classCacheLengthSlider.input(() => {
    console.log("HELLO");
    cacheLength = classCacheLengthSlider.value();
    newClassCountBaseline = cacheLength * classThreshold; //recalculate the baseline for deciding how much we count as a new class
    select("#cacheLengthLabel").html(cacheLength);
  });

  clearBtn = createButton("Clear Plateaus Data");
  clearBtn.mousePressed(() => {
    plateaus = [];
  });
  clearBtn.parent("controlsDiv");

  downloadBtn = createButton("Download Plateau JSON");
  downloadBtn.mousePressed(() => {
    saveJSON(
      plateaus,
      "plateaus-" +
      month() +
      "-" +
      day() +
      "-" +
      hour() +
      "-" +
      minute() +
      "-" +
      second() +
      ".json"
    );
  });
  downloadBtn.parent("controlsDiv");

  // Dynamic K value
  select("#kvalue").value(kvalue);
  select("#kvalue").input(function() {
    kvalue = this.value();
  });

  // Dynamic Confidence Threshold
  select("#confidenceThres").value(confidenceThres);
  select("#confidenceThres").input(function() {
    confidenceThres = this.value();
  });

  //------------MoveNet & KNN----------------------
  // let constraints = {
  //   video: {
  //     mandatory: {
  //       minWidth: 960,
  //       minHeight: 540
  //     }
  //   }
  // };
  video = createCapture(VIDEO, () => {
    cnv = createCanvas(video.width, video.height);
    // cnv = createCanvas(1440, 1080);
    // cnv = createCanvas(960, 540);
    cnv.parent("cnvDiv");
    loadMoveNet();
    loadKNN();
    // Create mask image
    msk = createImage(width, height);
    msk.loadPixels();
    for (let i = 3; i < msk.pixels.length; i += 4) {
      msk.pixels[i] = 255;
    }
    msk.updatePixels();
  });
  video.hide();

  loadKNNBtn = select("#buttonLoad");
  loadKNNBtn.mousePressed(() => {
    loadJSON("classes.json", loadClassesJSON);
  });

  classifyBtn = select("#buttonClassify");
  classifyBtn.mousePressed(setClassifier);

  //----------speed-based delay setup----------------
  jointPrev = {
    x: width / 2,
    y: height / 2,
  };

  //----------setup socket communication---------------------
  setupSocket();

  // Set calibration
  loadCalibration();
}

//---------draw-----------------
function draw() {
  // background(200);

  if (netReady) estimatePose();

  // If the mask is loaded, mask out the camera image
  if (msk) video.copy(msk, 0, 0, 100, height, video.width - MSK_MARGIN, 0, 100, video.height);
  image(video, 0, 0, video.width, video.height);
  if (poses.length > 0) {
    drawKeypoints();
    // Find the bounding box anchored on the nose
    if (!calibrated) {
      let firstPose = poses[0];
      findKeypoints(firstPose);
      let firstNose = firstPose.keypoints[0] || null;
      if (firstNose) {
        let noseX = nf((firstNose.x - minX) / bboxW, 1, 2);
        select("#nose").html("noseX: " + noseX);
      }
    }
  }

  if (frameCount < waiting) {
    text(
      "Pose analysis will begin in " + waiting + " frames",
      width / 2 - 100,
      height / 2
    );
  } else {
    //---------------for speed-based delay, send over joint dist----------------
    if (joint && joint.score > jointThreshold) {
      let jointDist = dist(joint.x, joint.y, jointPrev.x, jointPrev.y);
      jointPrev = joint;

      if (jointDist > 0) {
        // select('#jointDist').elt.innerText = jointDist;
        socket.emit("jointDist", jointDist / bboxW);
      }
    }

    //---------------for plateau-based delay, send over classification & plateau data----------------
    [maxClass, maxCount] = getMaxClass(classCache);

    if (maxClass) {
      select("#resultDisplay").html(maxClass);
      let resultCon = round((maxCount / cacheLength) * 100);
      // resultCon = nf(resultCon,3,3);
      select("#resultCon").html("confidence: " + resultCon + "%");
      // console.log(round(resultCon));
      // text("current class is: " + maxClass, width / 2 - 50, height / 2 - 50);
      // text("class count is: " + maxCount, width / 2 - 50, height / 2 + 50);
    }

    //whenever there's a new plateau start, given the current window length & baseline, mark its start time and send new class over.
    if (isClassifying && !plateauStarted && maxClass && maxCount > newClassCountBaseline) {


      // Only send class when it's asked for
      if (sending == CLASSES) {
        if (maxClass != pMaxClass) {
          if (maxClass != TRASHCLASS) {
            console.log("Sending new class: " + maxClass + " at " + frameCount);
            socket.emit("classNew", maxClass);
            pMaxClass = maxClass;
          }
        }
      }
      // Don't do plateaus if we are sending classes
      else {
        console.log(maxClass + " started at frame " + frameCount);
        plateauStarted = true;
        plateauStartTime = Date.now();
      }
    }
    //whenever the plateau ends, mark its end time and send it over to part 3.
    else if (plateauStarted && (endPlateau || itsBeenAWhile || maxCount < newClassCountBaseline)) {
      console.log(maxClass + " ended at frame " + frameCount);
      console.log(endPlateau, itsBeenAWhile, maxCount < newClassCountBaseline);
      plateauStarted = false;
      plateauEndTime = Date.now() - (itsBeenAWhile ? 0 : NOBODY);

      if (plateauEndTime - plateauStartTime > plateauMinLength) {
        console.log("Sending new plateau.");
        let newPlat = {
          className: maxClass,
          start: plateauStartTime,
          end: plateauEndTime,
        };
        socket.emit("plateauNew", newPlat);
        plateaus.push(newPlat);
      }

      // Reset end plateau
      endPlateau = false;
    }

    // Clear poses if it's been a while
    if (millis() - timeOfLastPose > NOBODY) {
      poses = [];
      itsBeenAWhile = true;
      console.log("Nothing to see here!");
    } else {
      itsBeenAWhile = false;
    }
  }

  //--------graph current confidence---------
  let confidenceAvg =
    confidenceCache.reduce((a, b) => a + b) / confidenceCache.length;
  cPanel.update(confidenceAvg, 100);
}

//---------calibration & normalization----------
function keyPressed() {
  if (key == "c") {
    calibrated = !calibrated;
    let calibrateEl = select("#calibrate");
    if (calibrated) {
      // Store data
      let calObj = {
        width: bboxW,
        height: bboxH
      };
      localStorage.setItem("calibration", JSON.stringify(calObj));
      console.log("STORED", calObj);
      calibrateEl.hide();
    } else calibrateEl.show();
  }
  // Toggle Classification with Spacebar
  else if (keyCode == 32) {
    setClassifier();
  } else if (keyCode == ENTER) {
    setSender();
  }
}

function normalizePoints(x, y) {
  minX = pose.keypoints[0].x - 0.5 * bboxW;
  minY = pose.keypoints[0].y;
  nx = nf((x - minX) / bboxW, 1, 2);
  ny = nf((y - minY) / bboxH, 1, 2);
}

function normalizePointByNose(x, y) {
  minX = pose.keypoints[0].x - 0.5 * bboxW;
  minY = pose.keypoints[0].y;
  let xNorm = nf((x - minX) / bboxW, 1, 2);
  let yNorm = nf((y - minY) / bboxH, 1, 2);
  return [xNorm, yNorm];
}

function findKeypoints(pose) {
  minX = Math.min.apply(
    Math,
    pose.keypoints.map(function(p) {
      return p.x;
    })
  );

  minY = Math.min.apply(
    Math,
    pose.keypoints.map(function(p) {
      return p.y;
    })
  );

  maxX = Math.max.apply(
    Math,
    pose.keypoints.map(function(p) {
      return p.x;
    })
  );

  maxY = Math.max.apply(
    Math,
    pose.keypoints.map(function(p) {
      maxY = p.y;
      return p.y;
    })
  );
  bboxW = maxX - minX;
  bboxH = maxY - minY;
}

function loadCalibration() {
  let calibration = JSON.parse(localStorage.getItem("calibration"));
  if (calibration) {
    bboxW = calibration.width;
    bboxH = calibration.height;
  }

  console.log(bboxW, bboxH);
}

//----------moveNet stuff----------------
async function loadMoveNet() {
  const detectorConfig = {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  };
  moveNet = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    detectorConfig
  );

  netReady = true;
  select("#status").html("MoveNet Loaded. ", true);
}

async function estimatePose() {
  const poseEstimation = await moveNet.estimatePoses(video.elt);
  if (poseEstimation.length > 0) {
    poses = poseEstimation;
    joint = poses[0].keypoints[jointNumber];
    timeOfLastPose = millis();
  }
}

//---------KNN stuff------------
async function loadKNN() {
  classifier = knnClassifier.create();

  select("#status").html("KNN Loaded. ", true);
}

async function classify() {
  // Any poses to classify?
  if (!poseNorm) return;

  // Get the total number of labels from knnClassifier
  const numLabels = classifier.getNumClasses();
  if (numLabels <= 0) {
    console.error("There is no examples in any label");
    return;
  }
  // Convert poses results to a 2d array [[score0, x0, y0],...,[score16, x16, y16]]

  // const poseArray = poses[0].keypoints.map(p => [p.score, nx, ny]);
  const poseArray = poseNorm.keypoints.map((p) => [p.score, p.x, p.y]);

  const example = tf.tensor(poseArray);
  const result = await classifier.predictClass(example, kvalue);
  gotResults(undefined, result);
}

// handler of the classification
function gotResults(err, result) {
  // Display any error
  if (err) {
    console.error(err);
  }

  // console.log(result)
  if (result.label) {
    // console.log(result.label);
    // result.label is the label that has the highest confidence
    const confidences = result.confidences;
    const label = result.label;
    const confidence = round(confidences[label] * 100);

    select("#result").html(label);
    select("#confidence").html(confidence + "%");

    //---------------------------add confidence filter based on current confidenceThres------------------
    //-----there are two ways we can use it:

    //1. only accept classes with confidence greater than threshold------------
    //-----only classes with confidence greater than threshold will be put into the classCache array------------
    //-----this will make a new class "harder to enter" but also "harder to exit"---------

    // if (confidence > confidenceThres) {
    //   console.log("adding a class with conf:" + confidence);
    //   classCache.push(label);
    // }


    //2. if class confidence lower than threshold, mark it as trash
    //-----this will make plateaus more "accurate" compared to traning data, but also make them shorter in length----
    //-----to use this method, comment method 1 above and uncomment codes below.

    if (confidence > confidenceThres) {
      // console.log("adding a class with conf:" + confidence);
      classCache.push(label);
    } else {
      classCache.push(TRASHCLASS);
    }

    while (classCache.length >= cacheLength) {
      classCache.shift();
    }

    //----------track current confidence for ending a plateau and graphing-------------
    currentClassConfidence = confidence;
    confidenceCache.push(currentClassConfidence);
    while (confidenceCache.length >= cacheLength) {
      confidenceCache.shift();
    }
  }

  if (isClassifying) {
    classify();
  }
}

function getMaxClass(array) {
  if (array.length == 0) return [undefined, undefined];
  var modeMap = {};
  var maxEl = array[0],
    maxCount = 1;
  for (var i = 0; i < array.length; i++) {
    var el = array[i];
    if (modeMap[el] == null) modeMap[el] = 1;
    else modeMap[el]++;
    if (modeMap[el] > maxCount) {
      maxEl = el;
      maxCount = modeMap[el];
    }
  }
  return [maxEl, maxCount];
}

//---------------------Classification Helpers----------------------
function setClassifier(state) {
  console.log(msg);
  if (msg == undefined) isClassifying = !isClassifying;

  classifyBtn.html(isClassifying ? "Stop" : "Predict");
  isClassifying = state;
  endPlateau = !state;
  if (isClassifying) classify();

  socket.emit("classifying", isClassifying); //tells the controller sketch if classifying analysis is ready
}

function setSender(msg) {

  if (msg == undefined) {
    sending = sending == CLASSES ? PLATEAUS : CLASSES;
  } else {
    sending = msg;
    endPlateau = sending == CLASSES ? true : false;
  }

  console.log("Sending: ", sending == CLASSES ? "Plateaus" : "Classes");
  socket.emit("sending", sending); // inform controller whether sending class or not
}

//------------load KNN classes---------------
function loadClassesJSON(data) {
  console.log(data);
  if (data) {
    const {
      dataset,
      tensors
    } = data;

    let tensorsData = {};
    Object.keys(dataset).forEach((key) => {
      // const tensor =
      const values = Object.keys(tensors[key]).map((v) => tensors[key][v]);
      tensorsData[key] = tf.tensor(
        values,
        dataset[key].shape,
        dataset[key].dtype
      );
    });
    classifier.setClassifierDataset(tensorsData);
    console.log(tensorsData);
  }
}

//------------draw skeleton keypoints---------------
function drawKeypoints() {
  // Loop through all the poses detected
  for (let i = 0; i < poses.length; i++) {
    // For each pose detected, loop through all the keypoints
    pose = poses[i];
    // console.log(pose.keypoints);

    noFill();
    stroke(255, 0, 0);
    textSize(10);
    // pose.keypoints[0] is the nose
    rect(pose.keypoints[0].x - 0.5 * bboxW, pose.keypoints[0].y, bboxW, bboxH);
    stroke(255, 0, 0);

    //------------prepare for normalization based on Nose-------------------
    poseNorm = {
      keypoints: [],
      score: pose.score
    };

    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];

      // Only draw an ellipse is the pose probability is bigger than 0.2 -------------> Should probably NOT do this so that it won't affect classification confidence trakcing!
      // if (keypoint.score > 0.2) {
      fill(255, 0, 0);
      noStroke();
      // normalizePoints(keypoint.x, keypoint.y);

      let [xNorm, yNorm] = normalizePointByNose(keypoint.x, keypoint.y);
      poseNorm.keypoints.push({
        x: xNorm,
        y: yNorm,
        score: keypoint.score,
      });

      ellipse(keypoint.x, keypoint.y, 10, 10);
      // text(" x: " + nx + " y:" + ny, keypoint.x, keypoint.y);
      text(
        " x: " + poseNorm.keypoints[j].x + " y:" + poseNorm.keypoints[j].y,
        keypoint.x,
        keypoint.y
      );
      // }
    }

    // console.log(poseNorm);
  }
}

//---------------------socket stuff------------------------------
function setupSocket() {
  socket = io.connect("http://" + ip + ":" + port, {
    port: port,
    rememberTransport: false,
  });
  socket.on("connect", function() {
    socket.emit("plateauOn", false);
  });

  socket.on("disconnect", function() {
    socket.emit("plateauOn", false);
  });


  //-----------plateau classification-----------------
  // Toggle whether to classify
  socket.on("setclassifier", function(msg) {
    setClassifier(msg);
  });

  // Toggle whether to send new class
  socket.on("setsender", function(msg) {
    setSender(msg);
  });

  socket.on("updateWindow", function(msg) {
    console.log("updating window to: " + msg);
    cacheLength = msg;
    newClassCountBaseline = cacheLength * classThreshold; //recalculate the baseline for deciding how much we count as a new class
    classCacheLengthSlider.value(int(msg));
    select("#cacheLengthLabel").html(msg);
  });

  socket.on("updateConfidence", function(msg) {
    console.log("updating confidence to: " + msg);
    confidenceThres = msg;
    select("#confidenceThres").value(confidenceThres);
  });

  //-------------In Progress: used for video mode-------------
  socket.on("playVideo", function(msg) {});

  socket.on("scrubVideo", function(msg) {});
}