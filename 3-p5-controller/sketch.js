//---------------modes config---------------------
let mode = 0; // 0: PRESET interval, 1: manual 1, 2: speed-based, 3:plateau-based, 4: bookmark

//--------------sockets config-----------------------
let socket;
let socketPaused = false;

//-------------show settings--------------
let btnStart, btnStop, btnSaveShow, btnRecoverShow, btnRecoverOhCrap, btnRecoverJSON, btnClearLocalStorage;
let started = false;
let startTime = 0;

// Recorder
let recordedSeconds;

//-------------autopilot-------------
let isAutopilot = true;
let autopilotData;
let nextActionIdx = undefined;

//-------------recovery----------
let isAutoSave = true;
let autoSaveIntervalID;

function setup() {
  createCanvas(W, H);
  connect(); //ports for OBS In / Out, TD In / Out

  btnStart = createButton("START"); //master control: start performance
  btnStart.position(0, 0);
  btnStart.mousePressed(startPerformance);
  btnStop = createButton("STOP"); //master control: stop performance
  btnStop.position(80, 0);
  btnStop.mousePressed(stopPerformance);
  btnStop = createButton("CLEAR LOCAL"); //master control: stop performance
  btnStop.position(160, 0);
  btnStop.mousePressed(() => {
    localStorage.clear()
  });

  textAlign(LEFT, CENTER);

  // Set top of show cues and mode settings
  setTopOfShow();

  loadJSON("autopilot.json", (data) => {
    autopilotData = data;
  });

  select('#jump').mouseClicked(() => {
    startPerformance();
    let secs = (int(select('#minute').value()) * 60) + int(select('#second').value());
    jumpToThisAction(secs);
  });
}

function draw() {

  //--------display mode-----------------------
  background(MODEBGS[mode]);
  textSize(40);
  text("mode: " + MODENAMES[mode], INFOX, INFOY);

  //--------display show time------------------
  recordedSeconds = started ? floor((Date.now() - startTime) / 1000) : 0;
  let clockMin = floor(recordedSeconds / 60);
  let clockSec = recordedSeconds % 60;
  textSize(28);
  text(nf(clockMin, 2, 0) + ":" + nf(clockSec, 2, 0), INFOX, INFOY - 150);
  textSize(14);

  //--------autopilot------------------
  if (autopilotData && isAutopilot) {
    if (nextActionIdx == undefined) {
      nextActionIdx = findNextActionIdx(recordedSeconds);
      // console.log(nextActionIdx);
    } else {
      nextActionIdx = executeNextAction(nextActionIdx);
    }
  } else {
    text("Autopilot is Off. Press M to toggle.", INFOX, INFOY - 75);
  }

  // Run the current mode
  modes[mode].run();

  // Run the current cue time
  cue.run();

  // Show stage data
  stage.display();

}

//------start & stop performance----------------
function setTopOfShow() {
  mode = 0;
  nextActionIdx = undefined;
  cue.reset();
  for (let mode of modes) mode.reset();
  stage.reset();
}

function startPerformance() {
  // Set top of show
  setTopOfShow();

  //---record start time---
  startTime = Date.now();

  //start recording
  socket.emit("record", 1);

  //start show
  started = true;
  console.log("Show and recording started at: " + startTime);

  //start auto save plateaus
  if (isAutoSave) {
    setTimeout(() => {
      autoSaveIntervalID = setInterval(savePlateaus, CACHELENGTH * 1000);
    }, 500);
  }
}

function stopPerformance() {
  //stop show
  started = false;

  //stop recording
  socket.emit("record", 0);
  console.log("Show and recording stopped at: " + (Date.now() - startTime));

  //reset cue
  stage.setBlackoutAll(true);
  nextActionIdx = undefined;

  //clear auto save
  if (autoSaveIntervalID) clearInterval(autoSaveIntervalID);

  //we don't reset startTime, recordedSeconds, delayFrameIdx, pleateaus, and bookmarks just so we can save them if needed
}

//----------auto save & recover plateaus----------------------
function savePlateaus() {
  let showData = {
    plateau_plateaus: JSON.stringify([...modes[PLATEAU].plateaus]), //replace with cleaned plateaus now
  };
  console.log("saving the following show data: ");
  console.log(showData);
  localStorage.setItem("showData", JSON.stringify(showData));
}

function recoverPlateaus() {

  //console.log("---------recovering plateaus from local storage.------------");

  let localShowData = JSON.parse(localStorage.getItem("showData"));
  if (localShowData) {
    modes[PLATEAU].plateaus = new Map(JSON.parse(localShowData.plateau_plateaus));

    console.log("recovered plateaus are:");
    console.log(modes[PLATEAU].plateaus);
  } else {
    console.log("local plateaus data not found.");
  }

}

//----------------------autopilot helper-------------------
function findNextActionIdx(currentShowTime) {
  let nextIdx = 0;
  // Is it time for the next cue?
  for (let action of autopilotData.actions) {
    if (currentShowTime > action.time) {
      nextIdx++;
    } else break;
  }
  return nextIdx;
}

// FF/REW to new show time
function jumpToThisAction(newShowTimeInSeconds) {

  // Reset everything
  setTopOfShow();

  // Recover plateaus
  recoverPlateaus();

  // Pause gated socket emissions
  socketPaused = true;

  // FF through all the cues up to new start time
  for (let a in autopilotData.actions) {
    let idx = int(a);
    let action = autopilotData.actions[idx];
    if (action.time <= newShowTimeInSeconds) executeNextAction(idx, true);
  }

  // Update startTime
  startTime = Date.now() - (newShowTimeInSeconds * 1000);


  // Resume gated socket emissions
  socketPaused = false;

  // Send out key emissions
  for (let mode of modes) try {
    mode.emit();
  } catch (e) {
    console.log("Nothing to emit in mode.");
  }
  setTimeout(() => {
    stage.emit()
  }, 20);
}

function executeNextAction(idx, jumping) {
  if (idx <= autopilotData.actions.length - 1) {
    try {
      let nextAction = autopilotData.actions[idx];
      //console.log("IDX:", idx, nextAction, scrubbing);
      //console.log("NEXT!", idx, nextAction);
      let actionMin = floor(nextAction.time / 60);
      let actionSec = nextAction.time % 60;
      text("Next: " + nf(actionMin, 2, 0) + ":" + nf(actionSec, 2, 0) + " press " + nextAction.key + "-" + nextAction.note + (nextAction.sound ? ", " + nextAction.sound : ""), INFOX, INFOY - 100, W - 50);
      if (jumping || recordedSeconds == nextAction.time) {
        console.log("Executing:", idx, nextAction.time, nextAction.key, nextAction.setting, nextAction.note);
        let kc = nextAction.key.charCodeAt(0);
        let evt = new KeyboardEvent("keydown", {
          keyCode: kc,
          which: kc,
        });
        // Attach setting to the event
        evt.data = nextAction.setting;
        window.dispatchEvent(evt);
        return idx + 1;
      }
      return idx;
    } catch (e) {
      console.log("Fatal error with FF.");
      return idx + 1;
    }
  } else {
    text("Autopilot is On. No more actions", INFOX, INFOY - 75);
    return idx;
  }
}

//----------------------Mode Select--------------------------
function keyPressed(e) {
  // console.log(e);
  // console.log(keyCode);

  // Is there a setting?
  let setting = e.data;

  switch (keyCode) {
    case 48: //----0------
      mode = PRESET;
      // Is there a setting for current mode?
      if (setting != null) modes[mode].set(setting);
      break;
    case 49: //----1------
      mode = MANUAL;
      break;
    case 50: //----2------
      mode = SPEED;
      // Is there a setting for current mode?
      if (setting != null) modes[mode].set(setting);
      break;
    case 51: //----3------
      mode = PLATEAU;
      break;
    case 52: //----4------
      mode = BOOKMARK;
      break;
    case 53: //----5------
      mode = OTHER;
      break;
    case UP_ARROW: //arrow up
      if (mode == MANUAL || mode == SPEED) modes[mode].adjust(1);
      break;
    case DOWN_ARROW: //arrow down
      if (mode == MANUAL || mode == SPEED) modes[mode].adjust(-1);
      break;
    case LEFT_ARROW: //arrow left
      if (mode == PRESET || mode == SPEED) modes[mode].update(-1);
      break;
    case RIGHT_ARROW: //arrow right
      if (mode == PRESET || mode == SPEED) modes[mode].update(1);
      break;
    case 81: //-----------Q: save bookmark 1
      modes[BOOKMARK].save(0, Date.now() - startTime);
      break;
    case 87: //-----------W: save bookmark 2
      modes[BOOKMARK].save(1, Date.now() - startTime);
      break;
    case 69: //-----------E: save bookmark 3
      modes[BOOKMARK].save(2, Date.now() - startTime);
      break;
    case 82: //-----------R: jump to bookmark 1
      // bookmark.ts = Date.now() - startTime;
      modes[BOOKMARK].jump(0);
      break;
    case 84: //-----------T: jump to bookmark 2
      modes[BOOKMARK].jump(1);
      break;
    case 89: //-----------Y: jump to bookmark 3
      modes[BOOKMARK].jump(2);
      break;
    case 85: //-----------U: clear bookmarks
      modes[BOOKMARK].reset();
      break;
    case 65: //-----------A: toggle show doppel / (un-)white out
      stage.toggleDoppel();
      break;
    case 83: //-----------S: toggle black out left
      stage.toggleBlackoutLeft();
      break;
    case 68: //-----------D: toggle black out right
      stage.toggleBlackoutRight();
      break;
    case 70: //-----------F: black out both on
      stage.setBlackoutAll(true);
      break;
    case 71: //-----------G: black out both off
      stage.setBlackoutAll(false);
      break;
    case 72: //-----------H: fade in left
      stage.fadeInLeft();
      break;
    case 80: //-----------P: play flashing video
      stage.playVideo();
      break;
    case 77: //-----------M: toggle autopilot
      isAutopilot = !isAutopilot;
      nextActionIdx = findNextActionIdx(recordedSeconds); //recalculate next action
      break;
    case 90: //-----------Z: reset max joint dist to default
      modes[SPEED].reset();
      break;
    case 88: //-----------X: toggle auto-saving
      isAutoSave = !isAutoSave;
      break;
    case 74: //-----------J: toggle plateau classification
      modes[PLATEAU].toggleClassifier()
      break;
    case 75: //-----------K: toggle sending new class
      modes[PLATEAU].toggleSender();
      break;
    case 78: //-----------N: go to next plateau window
      modes[PLATEAU].setWindow(setting);
      break;
    case 66: //-----------B: go to next confidence level
      modes[PLATEAU].setConfidence(setting);
      break;
    case 76: //-----------L: send DMX light commands
    if (setting != null) stage.setDMX(DMXPRESETS[setting], DMXSendInterval);
      break;
  }
}

//----------------------Performance Start/Stop Control------------------------------

//-------------------------p5 OSC & Socket Setup--------------------------------------
function connect() {
  socket = io("http://127.0.0.1:" + SOCKETPORT, {
    withCredentials: false
  });
  socket.on("connect", function() {
    console.log("Connected!");
    if (!started) socket.emit("fileIdx", 0);
  });

  //---socket msg from part 2 classification sketch------------------
  socket.on("classifying", function(msg) {
    console.log("classification is: " + (msg ? "On" : "Off"));
    modes[PLATEAU].toggleClassifier(msg);
  });

  socket.on("sending", (msg) => {
    modes[PLATEAU].toggleSender(msg);
  });

  socket.on("plateauNew", function(p) {
    if (started) {
      modes[PLATEAU].addPlateau(p);
    } else {
      console.log(
        "got a new class " +
        p.className +
        " plateau but show not started yet. skipped."
      );
    }
  });

  socket.on("queriedClass", (c) => {
    modes[PLATEAU].recoverClass(c);
  });

  socket.on("classNew", (c) => {
    if (mode == PLATEAU) modes[PLATEAU].updateClass(c);
  });

  socket.on("jointDist", (jd) => {
    modes[SPEED].updateJointDist(jd);
  });
}

// Gatekeeper for emitting
function emit(event, data) {
  if (socketPaused) return;

  console.log("Emitting: ", event, data);
  socket.emit(event, data);
}
