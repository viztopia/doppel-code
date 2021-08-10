// Copyright (c) 2019 ml5
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/* ===
ml5 Example
KNN Classification on Webcam Images with poseNet. Built with p5.js
=== */
let video;
// Create a KNN classifier
const knnClassifier = ml5.KNNClassifier();
let poseNet;
let poses = [];

function setup() {
  const canvas = createCanvas(640, 480);
  canvas.parent('videoContainer');
  video = createCapture(VIDEO);
  video.size(width, height);

  // Create the UI buttons
  createButtons();

  // Create a new poseNet method with a single detection
  poseNet = ml5.poseNet(video, {
    flipHorizontal: false,
    detectionType: 'single'
  }, modelReady);
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function(results) {
    poses = results;
  });
  // Hide the video element, and just show the canvas
  video.hide();
}

function draw() {
  image(video, 0, 0, width, height);

  // We can call both functions to draw all keypoints and the skeletons
  drawKeypoints();
  drawSkeleton();
}

function modelReady(){
  select('#status').html('model Loaded')
}

// Add the current frame from the video to the classifier
function addExample(label) {
  // Convert poses results to a 2d array [[score0, x0, y0],...,[score16, x16, y16]]
  const poseArray = poses[0].pose.keypoints.map(p => [p.score, p.position.x, p.position.y]);

  // Add an example with a label to the classifier
  knnClassifier.addExample(poseArray, label);
  updateCounts();
}

// Predict the current frame.
function classify() {
  // Get the total number of labels from knnClassifier
  const numLabels = knnClassifier.getNumLabels();
  if (numLabels <= 0) {
    console.error('There is no examples in any label');
    return;
  }
  // Convert poses results to a 2d array [[score0, x0, y0],...,[score16, x16, y16]]
  const poseArray = poses[0].pose.keypoints.map(p => [p.score, p.position.x, p.position.y]);

  // Use knnClassifier to classify which label do these features belong to
  // You can pass in a callback function `gotResults` to knnClassifier.classify function
  knnClassifier.classify(poseArray, gotResults);
}

// A util function to create UI buttons
function createButtons() {
  buttonA = select('#addClassA');
  buttonA.mousePressed(function() {
    addExample('1');
  });

  buttonB = select('#addClassB');
  buttonB.mousePressed(function() {
    addExample('2');
  });
  
  buttonC = select('#addClassC');
  buttonC.mousePressed(function() {
    addExample('3');
  });
  
  buttonD = select('#addClassD');
  buttonD.mousePressed(function() {
    addExample('4');
  });
  
  buttonE = select('#addClassE');
  buttonE.mousePressed(function() {
    addExample('5');
  });
  
  buttonF = select('#addClassF');
  buttonF.mousePressed(function() {
    addExample('6');
  });

  // Reset buttons
  resetBtnA = select('#resetA');
  resetBtnA.mousePressed(function() {
    clearLabel('1');
  });
	
  resetBtnB = select('#resetB');
  resetBtnB.mousePressed(function() {
    clearLabel('2');
  });
  
  resetBtnC = select('#resetC');
  resetBtnC.mousePressed(function() {
    clearLabel('3');
  });
	
  resetBtnD = select('#resetD');
  resetBtnD.mousePressed(function() {
    clearLabel('4');
  });
  
  resetBtnE = select('#resetE');
  resetBtnE.mousePressed(function() {
    clearLabel('5');
  });
	
  resetBtnF = select('#resetF');
  resetBtnF.mousePressed(function() {
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

// Show the results
function gotResults(err, result) {
  // Display any error
  if (err) {
    console.error(err);
  }

  if (result.confidencesByLabel) {
    console.log(result)
;    const confidences = result.confidencesByLabel;
    // result.label is the label that has the highest confidence
    if (result.label) {
      select('#result').html(result.label);
      select('#confidence').html(`${confidences[result.label] * 100} %`);
    }

    select('#confidenceA').html(`${confidences['1'] ? confidences['L1'] * 100 : 0} %`);
    select('#confidenceB').html(`${confidences['2'] ? confidences['R1'] * 100 : 0} %`);
    select('#confidenceC').html(`${confidences['3'] ? confidences['L2'] * 100 : 0} %`);
    select('#confidenceD').html(`${confidences['4'] ? confidences['R2'] * 100 : 0} %`);
    select('#confidenceE').html(`${confidences['5'] ? confidences['L3'] * 100 : 0} %`);
    select('#confidenceF').html(`${confidences['6'] ? confidences['R3'] * 100 : 0} %`);
  }

  classify();
}

// Update the example count for each label	
function updateCounts() {
  const counts = knnClassifier.getCountByLabel();

  select('#exampleA').html(counts['1'] || 0);
  select('#exampleB').html(counts['2'] || 0);
  select('#exampleC').html(counts['3'] || 0);
  select('#exampleD').html(counts['4'] || 0);
  select('#exampleE').html(counts['5'] || 0);
  select('#exampleF').html(counts['6'] || 0);
}

// Save & Load label JSON
function saveLabels(){
  knnClassifier.save("classes.json");
}

function loadLabels(){
  knnClassifier.load("classes.json");
}


// Clear the examples in one label
function clearLabel(classLabel) {
  knnClassifier.clearLabel(classLabel);
  updateCounts();
}

// Clear all the examples in all labels
function clearAllLabels() {
  knnClassifier.clearAllLabels();
  updateCounts();
}

// A function to draw ellipses over the detected keypoints
function drawKeypoints()  {
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
