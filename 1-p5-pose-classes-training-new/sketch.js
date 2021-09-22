// test commit

let video;
// Create a KNN classifier
let classifier;

let moveNet;
let netReady = false;

let poses = [];


// bounding box
let pose;
let minX, minY, maxX, maxY, bboxW, bboxH;
// normalization
let nx, ny;
let displayClass;


let calibrationState = true;

function setup() {
  video = createCapture(VIDEO, () => {
    const canvas = createCanvas(video.width, video.height);
    canvas.parent('videoContainer');
    loadMoveNet();
    loadKNN();
  });
  console.log(video);
  // video.size(width, height);
  video.hide();

  // Create the UI buttons
  createButtons();
}

//-------------------------------------------
function draw() {

  if (netReady) estimatePose();
  image(video, 0, 0, video.width, video.height);

  // We can call both functions to draw all keypoints and the skeletons
  if (calibrationState) { // if calibrating
    if (poses) {
      textSize(40);
      text("Make a t-pose and press 'c' to capture", 0, height / 2);
      text("Nose must be at 0.5", 0, height / 2 + 50);
      textSize(10);
      drawKeypoints();
    }
  } else {
    if (poses) {
      drawKeypoints(); // if done calibrating
      if (displayClass) {
        textSize(400);
        text(displayClass, 0, height / 2);
        textSize(10);
      }
    }
  }
}

function keyPressed() {
  if (key == 'c') {
    calibrationState = !calibrationState;
    console.log('c');
  }
}

function normalizePoints(x, y) {
  minX = pose.keypoints[0].x-(0.5*bboxW);
  minY = pose.keypoints[0].y;
  nx = nf((x - minX) / bboxW, 1, 2);
  ny = nf((y - minY) / bboxH, 1, 2);
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
  bboxW = maxX - minX;
  bboxH = maxY - minY;
}



// A util function to create UI buttons
function createButtons() {

  function createClassifiers(classNumber) {
    let button = select('#addClass' + classNumber);
    button.on = false;
    button.mousePressed(function () {
      this.on = !this.on;
      this.html(this.on ? 'Adding to Class ' + classNumber : "Class" + classNumber);
      if (this.on) {
        this.interval = setInterval(() => {
          addExample(classNumber);
        }, 250)
      }
      else {
        clearInterval(this.interval);
      }
    });

    let resetButton = select('#reset' + classNumber);
    resetButton.mousePressed(function () {
      clearLabel(classNumber);
    });
  }

  for (let i = 1; i <= 6; i++) {
    createClassifiers(i);
  }


  // Predict save
  buttonPredict = select('#buttonSave');
  buttonPredict.mousePressed(saveLabels);

  // Predict load
  buttonPredict = select('#buttonLoad');
  buttonPredict.mousePressed(loadLabels);

  // Predict button
  buttonPredict = select('#buttonPredict');
  buttonPredict.mousePressed(classify);

  // Clear all classes button
  buttonClearAll = select('#clearAll');
  buttonClearAll.mousePressed(clearAllLabels);
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
  if (poseEstimation.length > 0) poses = poseEstimation;
}

//---------KNN stuff------------
async function loadKNN() {

  classifier = knnClassifier.create();

  select('#status').html('KNN Loaded. ', true);
}

// Add the current frame from the video to the classifier
function addExample(label) {
  // Convert poses results to a 2d array [[score0, x0, y0],...,[score16, x16, y16]]
  // const poseArray = poses[0].pose.keypoints.map(p => [p.score, p.position.x, p.position.y]);
  const poseArray = poses[0].keypoints.map(p => [p.score, nx, ny]);

  // Add an example with a label to the classifier
  const example = tf.tensor(poseArray);
  // console.log(example)
  classifier.addExample(example, label);
  updateCounts();
}

// Predict the current frame.
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



// Show the results
function gotResults(err, result) {
  // Display any error
  if (err) {
    console.error(err);
  }

  if (result) {
    // console.log(result);

    const confidences = result.confidences;
    // result.label is the label that has the highest confidence
    if (result.label) {
      displayClass = result.label;
      select('#result').html(result.label);
      select('#confidence').html(`${confidences[result.label] * 100} %`);
    }

    select('#confidence1').html(`${confidences['1'] ? (confidences['1'] * 100): 0} %`);
    select('#confidence2').html(`${confidences['2'] ? (confidences['2'] * 100) : 0} %`);
    select('#confidence3').html(`${confidences['3'] ? (confidences['3'] * 100) : 0} %`);
    select('#confidence4').html(`${confidences['4'] ? (confidences['4'] * 100) : 0} %`);
    select('#confidence5').html(`${confidences['5'] ? (confidences['5'] * 100) : 0} %`);
    select('#confidence6').html(`${confidences['6'] ? (confidences['6'] * 100) : 0} %`);
  }

  classify();
}

// Update the example count for each label
function updateCounts() {
  const counts = classifier.getClassExampleCount();

  select('#example1').html(counts['1'] || 0);
  select('#example2').html(counts['2'] || 0);
  select('#example3').html(counts['3'] || 0);
  select('#example4').html(counts['4'] || 0);
  select('#example5').html(counts['5'] || 0);
  select('#example6').html(counts['6'] || 0);
}

// Save & Load label JSON
function saveLabels() {
  const dataset = classifier.getClassifierDataset();

  let tensors = {};
  Object.keys(dataset).forEach((key) => {
    const t = dataset[key];
    if (t) {
      console.log("Saving new data for class: ", key, t);
      tensors[key] = t.dataSync();
    }
  })
  saveJSON({ dataset, tensors }, 'classes.json', true);

}

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

function loadLabels() {
  loadJSON("classes.json", loadClassesJSON);
  updateCounts();
}


// Clear the examples in one label
function clearLabel(classLabel) {
  classifier.clearClass(classLabel);
  updateCounts();
}

// Clear all the examples in all labels
function clearAllLabels() {
  classifier.clearAllClasses()
  updateCounts();
}

// A function to draw ellipses over the detected keypoints
function drawKeypoints() {
  // Loop through all the poses detected
  for (let i = 0; i < poses.length; i++) {
    // For each pose detected, loop through all the keypoints
    pose = poses[i];
    // console.log(pose.keypoints);

    if (calibrationState) {
      findKeypoints();
      textSize(40);
      let noseX = nf((pose.keypoints[0].x - minX) / bboxW, 1, 2);
      text("Nose: " + noseX , 0, height / 2 + 100);
      textSize(10);
    }
    
    noFill();
    stroke(255, 0, 0);
    console.log()
    // pose.keypoints[0] is the nose
    rect(pose.keypoints[0].x-(0.5*bboxW), pose.keypoints[0].y, bboxW, bboxH);
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
        text(" x: " + nx + " y:" + ny, keypoint.x, keypoint.y);
      }
    }
  }
}

// A function to draw the skeletons
function drawSkeleton() {
  // Loop through all the skeletons detected
  for (let i = 0; i < poses.length; i++) {
    let skeleton = poses[i].skeleton;
    // For every skeleton, loop through all body connections
    for (let j = 0; j < skeleton.length; j++) {
      let partA = skeleton[j][0];
      let partB = skeleton[j][1];
      stroke(255, 0, 0);
      line(partA.position.x, partA.position.y, partB.position.x, partB.position.y);
    }
  }
}
