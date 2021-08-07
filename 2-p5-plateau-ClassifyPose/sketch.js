let cnv;
let waiting = 180;

let classResult = 0;
let classCache = [];
let cacheLength = 120;

let maxClass, maxCount;
let lastClass = 0;

let startedRecording = false;
let startTime = 0;
let classTimestamps = [];

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

//------------------socket----------
let socket;

function setup() {
  cnv = createCanvas(640, 480);
  cnv.parent('cnvDiv');
  classCacheLengthSlider = createSlider(10, 180, cacheLength, 10);
  classCacheLengthSlider.parent('controlsDiv');
  classCacheLengthSlider.input(() => {
    cacheLength = classCacheLengthSlider.value()
    select('#cacheLengthLabel').html(cacheLength);
  })

  recordBtn = createButton('Start Recording');
  recordBtn.mousePressed(startStopRecording);
  recordBtn.parent('controlsDiv');

  clearBtn = createButton('Clear Recording');
  clearBtn.mousePressed(() => { classTimestamps = []; });
  clearBtn.parent('controlsDiv');

  downloadBtn = createButton('Download Plateau JSON');
  downloadBtn.mousePressed(() => { saveJSON(classTimestamps, 'plateau-' + month() + '-' + day() + '-' + hour() + '-' + minute() + '-' + '.json') });
  downloadBtn.parent('controlsDiv');


  //------------PoseNet & KNN----------------------
  video = createCapture(VIDEO);
  video.size(width, height);
  poseNet = ml5.poseNet(video, function () {
    select('#poseNetStatus').html('PoseNet Loaded')
  });
  poseNet.on('pose', function (results) {
    poses = results;
  });
  video.hide();

  loadKNNBtn = select('#buttonLoad');
  loadKNNBtn.mousePressed(loadLabels);

  classifyBtn = select('#buttonClassify');
  classifyBtn.mousePressed(toggleClassification);

  //----------setup socket communication---------------------
  setupSocket();
}

function startStopRecording() {
  if (!startedRecording) {
    startedRecording = true;
    recordBtn.html('Stop Recording');
    startTime = millis();
    classTimestamps.push({ class: maxClass, time: millis() - startTime });
  } else {
    startedRecording = false;
    recordBtn.html('Start Recording');
    startTime = 0;
    console.log(classTimestamps);
  }
}

function draw() {
  // background(200);
  image(video, 0, 0, width, height);
  drawKeypoints();

  if (frameCount < waiting) {
    text("Classification will begin in " + waiting + " frames", width / 2 - 100, height / 2);
  } else {
    // if (mouseX <= width / 4) {
    //   classCache.push(1);
    // } else if (mouseX <= width / 2) {
    //   classCache.push(2);
    // } else if (mouseX <= (width * 3) / 4) {
    //   classCache.push(3);
    // } else {
    //   classCache.push(4);
    // }

    // if (classCache.length >= cacheLength) {
    //   classCache.shift();
    // }

    [maxClass, maxCount] = getMaxClass(classCache);

    text("current class is: " + maxClass, width / 2 - 50, height / 2 - 50);
    text("class count is: " + maxCount, width / 2 - 50, height / 2 + 50);

    //whenever there's a change in class, given the current window length, mark a class timestamp.
    if (maxClass && maxClass != lastClass) {
      console.log(maxClass + " started at frame " + frameCount);
      lastClass = maxClass;
      socket.emit('plateauNew', maxClass);

      if (startedRecording) {
        let tstmp = { className: maxClass, time: millis() - startTime }
        classTimestamps.push(tstmp);
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
      if (classCache.length >= cacheLength) {
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
	socket = io.connect('http://127.0.0.1:8081', { port: 8081, rememberTransport: false });
	socket.on('connect', function () {

		//---Setup OBS OSC---
		socket.emit('plateauOn', false);
	});
}
