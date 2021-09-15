// plateau logic, updated 08/24:
// 0. load posenet and constantly send over joint distance (in pixels)
// 1. once KNN is loaded and classification started, constantly send over the current classification;
// 2. send a plateau (its class, start time and end time) once it's detected, converted from MiMi's plateau code;
// 3. plateau observation window length: 120 frames, adjustable via slider;
// 4. what counts as the starting / ending of a plateau: given the current window, more than / less than <threshold> of frames is one class;
// To-do: complete video mode (accept socket messages to start to play video and scrub video)

//------------------socket--------------------
let socket;
// let ip = "10.23.11.4";
let ip = "127.0.0.1"; //the IP of the machine that runs bridge.js
let port = 8081; //the port of the machine that runs bridge.js

//--------simple UI--------------------
let cnv;
let waiting = 180;

let classResult = 0;
let classCache = [];
let cacheLength = 60; //classification window size

let maxClass, maxCount;
let classThreshold = 0.8;
let newClassCountBaseline = cacheLength * classThreshold; //calculate the baseline for deciding how much % within the window we count as a new class
let plateauStarted = false;
let plateauStartTime, plateauEndTime;
let plateauMinLength = 1000;
let plateaus = [];

let classCacheLengthSlider;
let playVidBtn, recordBtn, downloadBtn;
let clearBtn;

//------------------movenet & KNN----------------------
let video;
// let poseNet;
let moveNet;
let netReady = false;
let poses = [];
let classifier;
let isClassifying = false;
let loadKNNBtn, classifyBtn;
let classIndexOffset = 0;

//-----------------speed-based delay----------------------
let joint, jointPrev;
let jointNumber = 0;
let jointThreshold = 0.6;

// bounding box
let pose;
let minX, minY, maxX, maxY, bboxW, bboxH;
// normalization
let nx, ny;

function preload() { //used for video mode
  // video = createVideo('https://player.vimeo.com/external/591790914.hd.mp4?s=5423196882ed55a554896959f602c265d48c0af4&profile_id=175');
  // video = createVideo('dp.mp4');
  // video.loop();
}

function setup() {
  // cnv = createCanvas(1920, 1080);
  // cnv = createCanvas(1440, 1080);
  cnv = createCanvas(960, 540);
  cnv.parent('cnvDiv');
  classCacheLengthSlider = createSlider(10, 180, cacheLength, 10);
  classCacheLengthSlider.parent('controlsDiv');
  classCacheLengthSlider.input(() => {
    cacheLength = classCacheLengthSlider.value();
    newClassCountBaseline = cacheLength * classThreshold; //recalculate the baseline for deciding how much we count as a new class
    select('#cacheLengthLabel').html(cacheLength);
  })

  playVidBtn = createButton('Play Video'); //In Progress: used only for playing a video instead of capturing real NiNi via camera
  playVidBtn.mousePressed(() => { if (video) { console.log("playyyy"); video.loop(); } });
  playVidBtn.parent('controlsDiv');

  clearBtn = createButton('Clear Plateaus Data');
  clearBtn.mousePressed(() => { plateaus = []; });
  clearBtn.parent('controlsDiv');

  downloadBtn = createButton('Download Plateau JSON');
  downloadBtn.mousePressed(() => { saveJSON(plateaus, 'plateaus-' + month() + '-' + day() + '-' + hour() + '-' + minute() + '-' + second() + '.json') });
  downloadBtn.parent('controlsDiv');


  //------------MoveNet & KNN----------------------
  let constraints = {
    video: {
      mandatory: {
        minWidth: 960,
        minHeight: 540
      }
    }
  };
  video = createCapture(constraints, () => { loadMoveNet(); loadKNN(); });
  video.size(width, height);
  video.hide();


  loadKNNBtn = select('#buttonLoad');
  loadKNNBtn.mousePressed(() => { loadJSON("classes.json", loadClassesJSON); });

  classifyBtn = select('#buttonClassify');
  classifyBtn.mousePressed(toggleClassification);

  //----------speed-based delay setup----------------
  jointPrev = {
    x: width / 2,
    y: height / 2
  };

  //----------setup socket communication---------------------
  setupSocket();
}

//---------draw-----------------
function draw() {
  // background(200);

  if (netReady) estimatePose();
  image(video, 0, 0, width, height);
  drawKeypoints();

  if (frameCount < waiting) {
    text("Pose analysis will begin in " + waiting + " frames", width / 2 - 100, height / 2);
  } else {

    //---------------for speed-based delay, send over joint dist----------------
    if (joint && joint.score > jointThreshold) {
      
      let jointDist = dist(joint.x, joint.y, jointPrev.x, jointPrev.y);
      jointPrev = joint;

      if (jointDist > 0) {
        // select('#jointDist').elt.innerText = jointDist;
        socket.emit('jointDist', jointDist);
        
      }
    }

    //---------------for plateau de-basedlay, send over classification & plateau data----------------
    [maxClass, maxCount] = getMaxClass(classCache);

    text("current class is: " + maxClass, width / 2 - 50, height / 2 - 50);
    text("class count is: " + maxCount, width / 2 - 50, height / 2 + 50);

    //whenever there's a new plateau start, given the current window length & baseline, mark its start time and send new class over.
    if (maxClass && maxCount > newClassCountBaseline && !plateauStarted) {
      console.log(maxClass + " started at frame " + frameCount);
      plateauStarted = true;
      plateauStartTime = Date.now();

      socket.emit('classNew', maxClass);
    }

    //whenever the plateau ends, mark its end time and send it over to part 3.
    if (plateauStarted && maxCount < newClassCountBaseline) {
      console.log(maxClass + " ended at frame " + frameCount);
      plateauStarted = false;
      plateauEndTime = Date.now();

      if ((plateauEndTime - plateauStartTime) > plateauMinLength ){
        let newPlat = { className: maxClass, start: plateauStartTime, end: plateauEndTime };
        socket.emit('plateauNew', newPlat);
        plateaus.push(newPlat);
      }
    }
  }
}

function normalizePoints(x,y) {
  nx = nf((x -minX)/ bboxW, 1, 2);
  ny = nf((y -minY)/ bboxH,1,2);
}

function findKeypoints() {
  minX = Math.min.apply(
    Math,
    pose.keypoints.map(function (p) {
      return p.x;
    })
  );

  minY = Math.min.apply(
    Math,
    pose.keypoints.map(function (p) {
      return p.y;
    })
  );

  maxX = Math.max.apply(
    Math,
    pose.keypoints.map(function (p) {
      return p.x;
    })
  );

  maxY = Math.max.apply(
    Math,
    pose.keypoints.map(function (p) {
      maxY = p.y;
      return p.y;
    })
  );
}

//----------moveNet stuff----------------
async function loadMoveNet() {
  const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
  moveNet = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);

  netReady = true;
  select('#status').html('MoveNet Loaded. ', true);
}

async function estimatePose() {
  const poseEstimation = await moveNet.estimatePoses(video.elt);
  if (poseEstimation.length > 0) {poses = poseEstimation; joint = poses[0].keypoints[jointNumber]};
}

//---------KNN stuff------------
async function loadKNN() {

  classifier = knnClassifier.create();

  select('#status').html('KNN Loaded. ', true);
}



async function classify() {
  // Get the total number of labels from knnClassifier
  const numLabels = classifier.getNumClasses();
  if (numLabels <= 0) {
    console.error('There is no examples in any label');
    return;
  }
  // Convert poses results to a 2d array [[score0, x0, y0],...,[score16, x16, y16]]
  
  
  
  
  const poseArray = poses[0].keypoints.map(p => [p.score, nx, ny]);

  const example = tf.tensor(poseArray);
  const result = await classifier.predictClass(example);
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

    // result.label is the label that has the highest confidence
    const confidences = result.confidences;
    const idx = parseInt(result.label) + classIndexOffset;

    select('#result').html(idx);
    select('#confidence').html(`${confidences[parseInt(result.label)] * 100} %`);

    classCache.push(idx);
    while (classCache.length >= cacheLength) {
      classCache.shift();
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
function toggleClassification() {
  if (!isClassifying) {
    classifyBtn.html('Stop classifying');
    isClassifying = true;
    classify();

    socket.emit('plateauOn', true); //tells the controller sketch that plateau analysis is ready

  } else {
    classifyBtn.html('Start classifying');
    isClassifying = false;

    socket.emit('plateauOn', false); //tells the controller sketch that plateau analysis is off
  }
}

//------------load KNN classes---------------
function loadClassesJSON(data) {
  if (data) {
    const { dataset, tensors } = data;


    let tensorsData = {};
    Object.keys(dataset).forEach((key) => {
      // const tensor = 
      const values = Object.keys(tensors[key]).map(v => tensors[key][v]);
      tensorsData[key] = tf.tensor(values, dataset[key].shape, dataset[key].dtype);
    })
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
        findKeypoints();
    noFill();
    stroke(255, 0, 0);
    bboxW = maxX - minX;
    bboxH = maxY - minY;
    rect(minX, minY, bboxW, bboxH);
    stroke(255, 0, 0);
    
    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > 0.2) {
        fill(255, 0, 0);
        noStroke();
        normalizePoints(keypoint.x, keypoint.y);
        
        
        ellipse(keypoint.x, keypoint.y, 10, 10);
        // text("x: " + nx + " y:" + ny,keypoint.x, keypoint.y);
      }
    }
  }
}

//---------------------socket stuff------------------------------
function setupSocket() {
  socket = io.connect('http://' + ip + ':' + port, { port: port, rememberTransport: false });
  socket.on('connect', function () {
    socket.emit('plateauOn', false);
  });

  socket.on('disconnect', function () {
    socket.emit('plateauOn', false);
  });

  //-------------In Progress: used for video mode-------------
  socket.on('playVideo', function (msg) {

  });

  socket.on('scrubVideo', function (msg) {

  });
}

function keyPressed() {

}