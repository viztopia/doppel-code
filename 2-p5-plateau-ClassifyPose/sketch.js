// plateau logic, updated 08/07:
// 1. constantly sending over the current classification;
// 2. send a plateau (its class, start time and end time) once it's detected, converted from MiMi's plateau code;
// 3. plateau observation window length: 120 frames, adjustable via slider;
// 4. what counts as the starting / ending of a plateau: given the current window, more than / less than <threshold> of frames is one class;

let cnv;
let waiting = 180;

let classResult = 0;
let classCache = [];
let cacheLength = 120; //classification window size

let maxClass, maxCount;
let classThreshold = 0.7;
let newClassCountBaseline = cacheLength * classThreshold;
let plateauStarted = false;
let plateatStartTime, plateauEndTime;


let startedRecording = false;
let plateaus = [];

let classCacheLengthSlider;
let recordBtn;
let downloadBtn;
let clearBtn;

//------------------ml5 posenet & KNN----------------------
let video;
let poseNet;
let poses = [];
const knnClassifier = ml5.KNNClassifier();
let isClassifying = false;
let loadKNNBtn, classifyBtn;
let classIndexOffset = 1;

//-----------------speed-based delay----------------------
let joint, jointPrev;
let jointNumber = 0;
let jointThreshold = 0.95;

//------------------socket----------
let socket;
let ip = "172.20.10.2";
let port = 8081;

function preload(){
  video = createVideo('https://player.vimeo.com/external/584042738.hd.mp4?s=92569f00b28bbe55cd9fefec9e02980ce3cb9594&profile_id=175');
  video.loop();
}

function setup() {
  cnv = createCanvas(1920, 1080);
  cnv.parent('cnvDiv');
  classCacheLengthSlider = createSlider(10, 180, cacheLength, 10);
  classCacheLengthSlider.parent('controlsDiv');
  classCacheLengthSlider.input(() => {
    cacheLength = classCacheLengthSlider.value();
    newClassCountBaseline = cacheLength * classThreshold; //recalculate the baseline for deciding how much we count as a new class
    select('#cacheLengthLabel').html(cacheLength);
  })

  clearBtn = createButton('Clear Plateaus Data');
  clearBtn.mousePressed(() => { plateaus = []; });
  clearBtn.parent('controlsDiv');

  downloadBtn = createButton('Download Plateau JSON');
  downloadBtn.mousePressed(() => { saveJSON(plateaus, 'plateaus-' + month() + '-' + day() + '-' + hour() + '-' + minute() + '-' + second() + '.json') });
  downloadBtn.parent('controlsDiv');


  //------------PoseNet & KNN----------------------
  // video = createCapture(VIDEO);
  video.size(width, height);
  poseNet = ml5.poseNet(video, {
    flipHorizontal: false,
    detectionType: 'single'
  }, function () {
    select('#poseNetStatus').html('PoseNet Loaded')
  });
  poseNet.on('pose', function (results) {
    poses = results;
    joint = poses[0].pose.keypoints[jointNumber];
  });
  video.hide();

  loadKNNBtn = select('#buttonLoad');
  loadKNNBtn.mousePressed(loadLabels);

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

function draw() {
  // background(200);
  image(video, 0, 0, width, height);
  drawKeypoints();

  if (frameCount < waiting) {
    text("Classification will begin in " + waiting + " frames", width / 2 - 100, height / 2);
  } else {

    [maxClass, maxCount] = getMaxClass(classCache);

    text("current class is: " + maxClass, width / 2 - 50, height / 2 - 50);
    text("class count is: " + maxCount, width / 2 - 50, height / 2 + 50);

    //whenever there's a new plateau start, given the current window length & baseline, mark its start time and send new class over.
    if (maxClass && maxCount > newClassCountBaseline && !plateauStarted) {
      console.log(maxClass + " started at frame " + frameCount);
      plateauStarted = true;
      plateatStartTime = Date.now();

      socket.emit('classNew', maxClass);
    }

    //whenever the plateau ends, mark its end time and send it over to part 3.
    if (plateauStarted && maxCount < newClassCountBaseline) {
      console.log(maxClass + " ended at frame " + frameCount);
      plateauStarted = false;
      plateatEndTime = Date.now();

      let newPlat = { className: maxClass, start: plateatStartTime, end: plateatEndTime };
      socket.emit('plateauNew', newPlat);
      plateaus.push(newPlat);
    }



    //---------------speed-based delay----------------
    if (joint && joint.score > jointThreshold) {

      let jointDist = dist(joint.position.x, joint.position.y, jointPrev.x, jointPrev.y);
      jointPrev = joint.position;

      if (jointDist > 0) {
        // select('#jointDist').elt.innerText = jointDist;
        socket.emit('jointDist', jointDist);
      }
    } 
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

//---------------------PoseNet & KNN stuff----------------------
function toggleClassification() {
  if (!isClassifying) {
    classifyBtn.html('Stop classifying');
    isClassifying = true;
    classify();

    socket.emit('plateauOn', true);
  } else {
    classifyBtn.html('Start classifying');
    isClassifying = false;

    socket.emit('plateauOn', false);
  }
}

function classify() {
  const numLabels = knnClassifier.getNumLabels();
  if (numLabels <= 0) {
    console.error('There is no examples in any label');
    return;
  }
  const poseArray = poses[0].pose.keypoints.map(p => [p.score, p.position.x, p.position.y]);

  knnClassifier.classify(poseArray, gotResults);
}

// Show the results
function gotResults(err, result) {
  // Display any error
  if (err) {
    console.error(err);
  }

  // console.log(result)
  if (result.confidencesByLabel) {
    // const confidences = result.confidencesByLabel;
    // result.label is the label that has the highest confidence

    if (result.label) {
      const confidences = result.confidences;
      const idx = parseInt(result.label) + classIndexOffset;

      select('#result').html(idx);
      select('#confidence').html(`${confidences[parseInt(result.label)] * 100} %`);

      classCache.push(idx);
      while (classCache.length >= cacheLength) {
        classCache.shift();
      }
    }
  }

  if (isClassifying) {
    classify();
  }
}

function loadLabels() {
  knnClassifier.load("classes.json", function () {
    const numLabels = knnClassifier.getNumLabels();
    select('#KNNStatus').html(numLabels + " labels loaded.");
  });
}

// Clear all the examples in all labels
function clearAllLabels() {
  knnClassifier.clearAllLabels();
  updateCounts();
}

function drawKeypoints() {
  // Loop through all the poses detected
  for (let i = 0; i < poses.length; i++) {
    // For each pose detected, loop through all the keypoints
    let pose = poses[i].pose;
    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > 0.2) {
        fill(255, 0, 0);
        noStroke();
        ellipse(keypoint.position.x, keypoint.position.y, 10, 10);
      }
    }
  }
}

//---------------------socket stuff
function setupSocket() {
  socket = io.connect('http://'+ ip +':' + port, { port: port, rememberTransport: false });
  socket.on('connect', function () {
    socket.emit('plateauOn', false);
  });

  socket.on('disconnect', function () {
    socket.emit('plateauOn', false);
	});
}
