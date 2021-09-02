let video;
// Create a KNN classifier
let classifier;

let moveNet;
let netReady = false;

let poses = [];

function setup() {
  const canvas = createCanvas(640, 480);
  canvas.parent('videoContainer');
  video = createCapture(VIDEO, () => { loadMoveNet(); loadKNN(); });
  video.size(width, height);
  video.hide();

  // Create the UI buttons
  createButtons();
}

//-------------------------------------------
function draw() {
  if (netReady) estimatePose();
  image(video, 0, 0, width, height);

  // We can call both functions to draw all keypoints and the skeletons
  if (poses) {
    drawKeypoints();
  }
}


// A util function to create UI buttons
function createButtons() {
  buttonA = select('#addClassA');
  buttonA.mousePressed(function () {
    addExample('1');
  });

  buttonB = select('#addClassB');
  buttonB.mousePressed(function () {
    addExample('2');
  });

  buttonC = select('#addClassC');
  buttonC.mousePressed(function () {
    addExample('3');
  });

  buttonD = select('#addClassD');
  buttonD.mousePressed(function () {
    addExample('4');
  });

  buttonE = select('#addClassE');
  buttonE.mousePressed(function () {
    addExample('5');
  });

  buttonF = select('#addClassF');
  buttonF.mousePressed(function () {
    addExample('6');
  });

  // Reset buttons
  resetBtnA = select('#resetA');
  resetBtnA.mousePressed(function () {
    clearLabel('1');
  });

  resetBtnB = select('#resetB');
  resetBtnB.mousePressed(function () {
    clearLabel('2');
  });

  resetBtnC = select('#resetC');
  resetBtnC.mousePressed(function () {
    clearLabel('3');
  });

  resetBtnD = select('#resetD');
  resetBtnD.mousePressed(function () {
    clearLabel('4');
  });

  resetBtnE = select('#resetE');
  resetBtnE.mousePressed(function () {
    clearLabel('5');
  });

  resetBtnF = select('#resetF');
  resetBtnF.mousePressed(function () {
    clearLabel('6');
  });

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
  const poseArray = poses[0].keypoints.map(p => [p.score, p.x, p.y]);

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
  const poseArray = poses[0].keypoints.map(p => [p.score, p.x, p.y]);

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
      select('#result').html(result.label);
      select('#confidence').html(`${confidences[result.label] * 100} %`);
    }

    select('#confidenceA').html(`${confidences['1'] ? confidences['1'] * 100 : 0} %`);
    select('#confidenceB').html(`${confidences['2'] ? confidences['2'] * 100 : 0} %`);
    select('#confidenceC').html(`${confidences['3'] ? confidences['3'] * 100 : 0} %`);
    select('#confidenceD').html(`${confidences['4'] ? confidences['4'] * 100 : 0} %`);
    select('#confidenceE').html(`${confidences['5'] ? confidences['5'] * 100 : 0} %`);
    select('#confidenceF').html(`${confidences['6'] ? confidences['6'] * 100 : 0} %`);
  }

  classify();
}

// Update the example count for each label	
function updateCounts() {
  const counts = classifier.getClassExampleCount();

  select('#exampleA').html(counts['1'] || 0);
  select('#exampleB').html(counts['2'] || 0);
  select('#exampleC').html(counts['3'] || 0);
  select('#exampleD').html(counts['4'] || 0);
  select('#exampleE').html(counts['5'] || 0);
  select('#exampleF').html(counts['6'] || 0);
}

// Save & Load label JSON
function saveLabels() {
  const dataset = classifier.getClassifierDataset();

  let tensors={};
  Object.keys(dataset).forEach((key)=>{
    const t = dataset[key];
    if (t) {
      tensors[key] = t.dataSync();
    }
  })
  saveJSON({ dataset, tensors }, 'classes.json', true);

}

function loadClassesJSON(data) {
  if (data) {
    const { dataset, tensors } = data;


    let tensorsData = {};
    Object.keys(dataset).forEach((key)=>{
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
    let pose = poses[i];
    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > 0.2) {
        fill(255, 0, 0);
        noStroke();
        ellipse(keypoint.x, keypoint.y, 10, 10);
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
