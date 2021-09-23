// test commit

let video;
// Create a KNN classifier
let classifier;

let moveNet;
let netReady = false;

let poses = [];
let classes = {};
let predict = false;
let prediction;

// Recording rate
let rate = 250;

const LABELS = ['DFr', 'DRt', 'DLt', 'DFo'];

// bounding box
let pose;
let minX, minY, maxX, maxY, bboxW, bboxH;
// normalization
let nx, ny;

// Have we calibrated?
let calibrated = false;

function setup() {
  video = createCapture(VIDEO, () => {
    const canvas = createCanvas(video.width, video.height);
    canvas.parent('videoContainer');
    loadMoveNet();
    loadKNN();
  });

  video.hide();

  // Create the UI buttons
  buildUI();

}

//-------------------------------------------
function draw() {

  if (netReady) estimatePose();
  image(video, 0, 0, video.width, video.height);

  // If there are bodies detected...
  if (poses.length > 0) {
    drawKeypoints();
    // Find the bounding box anchored on the nose
    if (!calibrated) {
      let firstPose = poses[0];
      findKeypoints(firstPose);
      let firstNose = firstPose.keypoints[0] || null;
      if (firstNose) {
        let noseX = nf((firstNose.x - minX) / bboxW, 1, 2);
        select('#nose').html("noseX: " + noseX)
      }
    }
  }
}

function keyPressed() {
  if (key == 'c') {
    calibrated = !calibrated;
    let calibrateEl = select('#calibrate');
    if (calibrated) calibrateEl.hide();
    else calibrateEl.show();
  }

  switch (keyCode) {
    case RIGHT_ARROW:
      rate += 100;
      break;
    case LEFT_ARROW:
      rate -= 100;
      break;
  }

  // Update rate
  updateRate();

  // Constrain the rate
  rate = constrain(rate, 10, 1000);
}

function normalizePoints(x, y) {
  minX = pose.keypoints[0].x - (0.5 * bboxW);
  minY = pose.keypoints[0].y;
  nx = nf((x - minX) / bboxW, 1, 2);
  ny = nf((y - minY) / bboxH, 1, 2);
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


function updateRate() {
  // Update the rate input
  select('#rate').value(rate);
  // Reset all the timers
  for(let c in classes) {
    classes[c].updateRate();
  }
}
// A util function to create UI buttons
function buildUI() {

  // Clone the template
  let container = document.getElementById('classes');

  // Create UI for new class
  function createClass(l, label) {
    let el = document.getElementById('template').cloneNode(true);
    container.append(el);
    let idx = l || classes.length;
    let name = label || select('#name').value();
    let id = idx + '-' + name;
    classes[id] = new Class(id, el);
  }

  // Auto-generate first 10
  for (let l in LABELS) {
    let label = LABELS[l];
    createClass(l, label);
  }

  // Rate feedback
  select('#rate').input(function() {
    rate = this.value();
  });
  updateRate();
  // Add a class
  select('#add').mousePressed(createClass);

  // Predict save
  select('#save').mousePressed(saveLabels);

  // Predict load
  select('#load').mousePressed(loadLabels);

  // Predict button
  select('#predict').mousePressed(function() {
    // Toggle predict
    predict = !predict;
    this.html(predict ? 'Stop' : 'Predict');
    classify();
  });

  // Clear all classes button
  select('#clear').mousePressed(clearAllLabels);
}

//----------moveNet stuff----------------
async function loadMoveNet() {
  const detectorConfig = {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
  };
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
  updateCount(label);
}

// Predict the current frame.
async function classify() {
  // Don't bother if we're not predicting
  if(!predict) {
    select('#result').html('');
    return;
  }

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
      prediction = result.label;
      select('#result').html(result.label);
      let confidence = nfs(confidences[result.label] * 100, 0, 2);
      select('#confidence').html(confidence + '%');
    }

    for (let c in classes) {
      if (!confidences[c.label]) continue;
      let confidence = nfs(confidences[c.label] * 100, 0, 2);
      c.score(confidence + '%')
    }
  }

  // Keep classifying
  classify();
}

// Update the example count for each label
function updateCount(label) {
  let count = classifier.getClassExampleCount()[label];
  classes[label].count(count);
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
  saveJSON({
    dataset,
    tensors
  }, 'classes.json', true);

}

function loadClassesJSON(data) {
  if (data) {
    const {
      dataset,
      tensors
    } = data;


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
function clearLabel(label) {
  try {
    classifier.clearClass(label);
  } catch (e) {
    console.log("Class ", label, " no longer exists.");
  }
  updateCount(label);
}

// Clear all the examples in all labels
function clearAllLabels() {
  classifier.clearAllClasses()
  updateCounts();
}

function updateCounts() {
  for (let c in classes) {
    updateCount(c);
  }
}

// A function to draw ellipses over the detected keypoints
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
    rect(pose.keypoints[0].x - (0.5 * bboxW), pose.keypoints[0].y, bboxW, bboxH);
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
