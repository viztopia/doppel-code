// plateau logic, updated 08/24:
// 0. load posenet and constantly send over joint distance (in pixels)
// 1. once KNN is loaded and classification started, constantly send over the current classification;
// 2. send a plateau (its class, start time and end time) once it's detected, converted from MiMi's plateau code;
// 3. plateau observation window length: 120 frames, adjustable via slider;
// 4. what counts as the starting / ending of a plateau: given the current window, more than / less than <threshold> of frames is one class;
// To-do: complete video mode (accept socket messages to start to play video and scrub video)

//------------------socket--------------------
let socket;
// let ip = "192.168.1.160"; //the IP of the machine that runs bridge.js

let ip = "10.23.11.152"; //the IP of the machine that runs bridge.js
// let ip = "127.0.0.1"; //or local host
let port = 8081; //the port of the machine that runs bridge.js
//--------simple UI--------------------
let cnv;
let waiting = 180;

//--------Classifier Stuff--------------------
let classResult = 0;
let classCache = [];
let cacheLength = 20; //classification window size

let stableClass
let pStableClass;
let confidenceTH = 90;
let windowTH = 0.8;
let bestCountTH; //calculate the baseline for deciding how much % within the window we count as a new class

//--------Plateau Stuff--------------------
let plateau = {
  start: null,
  end: null,
  reset: function() {
    this.start = null;
    this.end = null
  }
};
let plateaus = [];
const PLATEAU_TH = 1000;

//--------Sending Data--------------------
const CLASSES = 0;
const PLATEAUS = 1;
let sending = PLATEAUS;

//------------------movenet & KNN----------------------
let video;
let msk;
const MSK_MARGIN = 100;
const SCL = 1; //0.5;

// let poseNet;
let moveNet;
let poses = [];
let classifier;
let kvalue = 20;
let isClassifying = false;
let classIndexOffset = 0;
let timeOfLastPose = 0;
const NOBODY_TH = 500;

//-----------------speed-based delay----------------------
let jointPrev;
const NOSE = 0;
const NOSE_TH = 0.6;

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
const TRASHCLASS = "trash";

function preload() {
  //used for video mode
  // video = createVideo('https://player.vimeo.com/external/591790914.hd.mp4?s=5423196882ed55a554896959f602c265d48c0af4&profile_id=175');
  // video = createVideo('dp.mp4');
  // video.loop();
}

function setup() {
  select("#window").input(function() {
    setWindow(this.value());
  });

  select("#clear").mousePressed(() => {
    plateaus = [];
  });

  select("#download").mousePressed(() => {
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

  // Dynamic K value
  select("#kvalue").value(kvalue);
  select("#kvalue").input(function() {
    kvalue = this.value();
  });

  // Dynamic Confidence Threshold
  setConfidence(confidenceTH);
  select("#th").input(function() {
    setConfidence(this.value());
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

    // Scale the video down
    // video.width *= SCL;
    // video.height *= SCL;

    cnv = createCanvas(video.width * SCL, video.height * SCL);
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

  select("#load").mousePressed(() => {
    loadJSON("classes.json", loadClassesJSON);
  });

  select("#classify").mousePressed(setClassifier);

  //----------speed-based delay setup----------------
  jointPrev = {
    x: width / 2,
    y: height / 2,
  };

  //----------setup socket communication---------------------
  setupSocket();

  // Set calibration
  loadCalibration();

  // Set Status
  setSender(sending);
  setWindow(cacheLength);

}

//---------draw-----------------
function draw() {
  // background(200);
  scale(SCL, SCL);


  // If the mask is loaded, mask out the camera image
  if (msk) video.copy(msk, 0, 0, 100, height, video.width - MSK_MARGIN, 0, 100, video.height);
  image(video, 0, 0, video.width, video.height);


  // Draw skeleton
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

    //--------graph current confidence---------
    let confidenceAvg =
      confidenceCache.reduce((a, b) => a + b) / confidenceCache.length;
    cPanel.update(confidenceAvg, 100);
  }
}

function bestClassIsStable(bestClass, bestCount) {
  return bestClass != TRASHCLASS && bestCount >= bestCountTH;
}
// Helper functions for deciding what data to send.
function stableClassIsNew() {
  return pStableClass != stableClass;
}

function itsBeenAwhile() {
  return millis() - timeOfLastPose > NOBODY_TH;
}

function processPlateau(buffer) {

  // Complete plateau if there is one
  if (!plateau.start) return;

  // Calculate end time
  plateau.end = Date.now() - (buffer ? buffer : 0);

  // If plateau is long enough, send it.
  if (plateau.end - plateau.start > PLATEAU_TH) {
    console.log("Sending completed plateau.");
    let completedPlateau = {
      className: stableClass,
      start: plateau.start,
      end: plateau.end,
    };
    socket.emit("plateauNew", completedPlateau);
    select("#plateau").html(stableClass + ": " + (plateau.end - plateau.start));
    plateaus.push(completedPlateau);
  }

  // Discard plateau either way
  plateau.reset();
}

function resetClassification(buffer) {

  // Empty out cache of classes
  classCache = [];

  // Empty out poses
  nobody = true;
  poses = [];
  pose = undefined;
  poseNorm = {};

  // Clear out classes
  stableClass = null;
  pStableClass = null;

  // Clear out plateaus
  processPlateau(buffer);

  console.log("RESET CLASSIFICATION")
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

function normalizeJointToAnchor(joint) {
  minX = pose.keypoints[NOSE].x - 0.5 * bboxW;
  minY = pose.keypoints[NOSE].y;
  let xNorm = nf((joint.x - minX) / bboxW, 1, 2);
  let yNorm = nf((joint.y - minY) / bboxH, 1, 2);
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

  // Kick off fetching poses
  setInterval(estimatePose, 30);

  select("#status").html("MoveNet Loaded. ", true);
}

async function estimatePose() {

  const poseEstimation = await moveNet.estimatePoses(video.elt);

  // Nobody there...
  if (poseEstimation.length < 1) {
    if (itsBeenAwhile()) {
      //console.log("IT'S BEEN AWHILE!");
      resetClassification(NOBODY_TH);
    }
    return;
  }

  // There are bodies!
  nobody = false;

  poses = poseEstimation;
  timeOfLastPose = millis();

  // Grab 1st body
  pose = poses[0];

  //------------prepare for normalization based on Nose-------------------
  poseNorm = {
    keypoints: [],
    score: pose.score
  };

  for (let j = 0; j < pose.keypoints.length; j++) {
    // A keypoint is an object describing a body part (like rightArm or leftShoulder)
    let joint = pose.keypoints[j];

    let [xNorm, yNorm] = normalizeJointToAnchor(joint);
    poseNorm.keypoints.push({
      x: xNorm,
      y: yNorm,
      score: joint.score,
    });
  }

  // Calculate and send speed data
  let anchor = pose.keypoints[NOSE];
  sendSpeed(anchor, NOSE_TH);

}

//---------Speed stuff------------
function sendSpeed(joint, jointTH) {
  //---------------for speed-based delay, send over joint dist----------------
  if (joint && joint.score > jointTH) {
    let jointDist = dist(joint.x, joint.y, jointPrev.x, jointPrev.y);
    jointPrev = joint;

    if (jointDist > 0) {
      // select('#jointDist').elt.innerText = jointDist;
      socket.emit("jointDist", jointDist / bboxW);
    }
  }
}
//---------KNN stuff------------
async function loadKNN() {
  classifier = knnClassifier.create();
  select("#status").html("KNN Loaded. ", true);
}

async function classify() {

  // Any poses to classify?
  if (nobody) {
    // Try again in a little bit
    setTimeout(classify, 100);
    return;
  }
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

    // Update the RAW result
    select("#raw-class-billboard").html(label);
    select("#raw-class").html(label);
    select("#raw-confidence").html(confidence + "%");

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


    if (confidence > confidenceTH) {
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

  // Still classifying?
  if (isClassifying) {
    // Process classification
    processClasses();
    classify();
  }
}

//------------Process Classification--------------
function processClasses() {
  let bestClass, bestCount;

  //---------------for plateau-based delay, send over classification & plateau data----------------
  [bestClass, bestCount] = getBestClass(classCache);

  if (bestClass) {
    //select("#best-class").html(bestClass);
    //select("#best-count").html(bestCount + " / " + bestCountTH);

    // Is current best class stable and new?
    if (bestClassIsStable(bestClass, bestCount)) {
      stableClass = bestClass;

      // If there's a new stable class
      if (stableClassIsNew()) {
        pStableClass = stableClass;
        // Send it
        if (sending == CLASSES) {
          socket.emit("classNew", stableClass);
          console.log("Sending new class: " + stableClass + " at " + frameCount);

          // Process plateau
        } else if (sending == PLATEAUS) {
          console.log("STABLE PLATEAU");
          processPlateau();
          plateau.start = Date.now();
          console.log(stableClass + " started at frame " + frameCount);
        }
      }
    }
    // If data is too noisy, end plateau
    else {
      processPlateau();
    }
  }

  // Update status
  updateClassStatus(bestClass, bestCount);
}

let bestClassEl = document.getElementById("best-class");
let bestCountEl = document.getElementById("best-count");
let classEl = document.getElementById("class");

function updateClassStatus(bestClass, bestCount) {
  bestClassEl.className = bestClass == stableClass ? "stable" : "";
  bestClassEl.innerText = bestClass ? bestClass : "None";
  bestCountEl.innerText = bestClass ? bestCount + " / " + bestCountTH : "N/A";
  classEl.innerText = stableClass;
}

function getBestClass(array) {
  if (array.length == 0) return [undefined, undefined];
  let modeMap = {};
  let bestClass = array[0],
    bestCount = 1;
  for (let i = 0; i < array.length; i++) {
    let el = array[i];
    if (modeMap[el] == null) modeMap[el] = 1;
    else modeMap[el]++;
    if (modeMap[el] > bestCount) {
      bestClass = el;
      bestCount = modeMap[el];
    }
  }
  return [bestClass, bestCount];
}

//---------------------Classification Helpers----------------------
function setClassifier(state) {
  console.log("PREDICT", state);

  resetClassification();

  isClassifying = state == undefined ? !isClassifying : state;
  console.log("isClassifying", isClassifying);
  select("#classify").html(isClassifying ? "Stop" : "Classify");

  //Kick off classification
  classify();

  //tells the controller sketch if classifying analysis is ready
  if (state == undefined) socket.emit("classifying", isClassifying);
}

function setSender(state) {
  if (state == undefined) {
    socket.emit("sending", sending); // inform controller whether sending class or not
    // Toggle it
    sending == CLASSES ? PLATEAUS : CLASSES;
  } else sending = state;

  // End active plateau if any...
  processPlateau();

  // Update Status
  select("#sending").html(sending == CLASSES ? "Classes" : "Plateaus");
  console.log("Sending: ", sending == CLASSES ? "Classes" : "Plateaus");
}

function setWindow(_cacheLength) {
  cacheLength = _cacheLength;
  bestCountTH = cacheLength * windowTH; //recalculate the baseline for deciding how much we count as a new class
  select("#window").value(cacheLength);
  select("#window-label").html(cacheLength);
}

function setConfidence(_confidenceTH) {
  confidenceTH = _confidenceTH;
  select("#th").value(confidenceTH);
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
    //console.log(pose.keypoints);

    noFill();
    stroke(255, 0, 0);
    textSize(10);
    // pose.keypoints[0] is the nose
    rect(pose.keypoints[0].x - 0.5 * bboxW, pose.keypoints[0].y, bboxW, bboxH);
    stroke(255, 0, 0);

    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];

      // Only draw an ellipse is the pose probability is bigger than 0.2 -------------> Should probably NOT do this so that it won't affect classification confidence trakcing!
      // if (keypoint.score > 0.2) {
      fill(255, 0, 0);
      noStroke();

      ellipse(keypoint.x, keypoint.y, 10, 10);
    }
  }
}

//---------------------socket stuff------------------------------
function setupSocket() {
  socket = io.connect("http://" + ip + ":" + port, {
    port: port,
    rememberTransport: false,
  });
  socket.on("connect", function() {
    socket.emit("classifying", false);
  });


  //-----------plateau classification-----------------
  // Toggle whether to classify
  socket.on("setclassifier", function(msg) {
    console.log("got setclassifier message");
    setClassifier(msg);
  });

  // Toggle whether to send new class
  socket.on("setsender", function(msg) {
    setSender(msg);
  });

  socket.on("updateWindow", function(msg) {
    console.log("updating window to: " + msg);
    setWindow(msg);
  });

  socket.on("updateConfidence", function(msg) {
    console.log("updating confidence to: " + msg);
    setConfidence(msg);
  });

  //-------------In Progress: used for video mode-------------
  socket.on("playVideo", function(msg) {});

  socket.on("scrubVideo", function(msg) {});
}
