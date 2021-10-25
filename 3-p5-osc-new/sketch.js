// MIDI controller

// choreography logic, updated 08/24:
// 0: PRESET interval mode: PRESET interval looping btw 4s, 4.5s, 6s and 10s
// 1: Manual 1 mode: manual mode controlling the number of frames to delay using 1 interval;
// 2: Speed mode: based on the joint distance, calcualte the amount of delay;
// 3: Plateau mode: based on current class, pick one plateau with the same class; if no corresponding plateaus found, just play current frame;
// - If one plateau finishes and we're still in the same class, pick another plateau with the same class;
// - If we receive a new class in the middle of a plateau playback, jump to a new plateau that matches the new class;
// - Added code and modes for plateau-based control and speed-based control and manual
// 4: Bookmark mode: Q to save the current time as a bookmark, W to jump to bookmark


//---------------modes config---------------------
let mode = 0; // 0: PRESET interval, 1: manual 1 interval, 2: speed-based, 3:plateau-based, 4: bookmark

//--------------sockets config-----------------------
let socket;

//-------------show settings--------------
let btnStart, btnStop, btnSaveShow, btnRecoverShow, btnRecoverOhCrap;
let started = false;
let startTime = 0;

// Recorder
let recordedSeconds;

// Delay Frame Idx for cueing
let delayFrameIdx = 0;
let pDelayFrameIdx = 0;

//-------------recover settings-----------
let acceptingNewPlateau = true;

//-------------autopilot-------------
let isAutopilot = true;
let autopilotData;
let nextActionIdx = undefined;

function setup() {
  createCanvas(W, H);
  connect(); //ports for OBS In / Out, TD In / Out

  btnStart = createButton('START'); //master control: start performance
  btnStart.position(0, 0);
  btnStart.mousePressed(startPerformance);
  btnStop = createButton('STOP'); //master control: stop performance
  btnStop.position(80, 0);
  btnStop.mousePressed(stopPerformance);

  btnSaveShow = createButton('SAVE'); //
  btnSaveShow.position(160, 0);
  btnSaveShow.mousePressed(savePerformance);

  btnRecoverShow = createButton('RECOVER'); //
  btnRecoverShow.position(240, 0);
  btnRecoverShow.mousePressed(() => {
    acceptingNewPlateau = true;
    recoverPerformance("showData.json")
  }); //make sure to change json name to showData.json

  btnRecoverOhCrap = createButton('RECOVER Oh Crap'); //
  btnRecoverOhCrap.position(240, 25);
  btnRecoverOhCrap.mousePressed(() => {
    acceptingNewPlateau = false;
    recoverPerformance("showData.json")
  }); //make sure to change json name to showData.json

  textAlign(LEFT, CENTER);

  loadJSON("autopilot.json", (data) => {
    autopilotData = data
  });
  // window.addEventListener('keydown', (e) => {
  //   console.log(e)
  // })
}

function draw() {

  if (!started) {
    background(255, 0, 255);
    textSize(14);
    text("If you wanna recover show:", INFOX, INFOY - 25);
    text("Please make sure TD window is active and NOT minimized FIRST!", INFOX, INFOY + 25);
    text("Then make sure showData.json is updated.", INFOX, INFOY + 50);
    if (autopilotData) {
      text("Autopilot is: " + (isAutopilot ? "On" : "Off") + ", press M to toggle.", INFOX, INFOY + 100);
    } else {
      text("Autopilot data is not available. Please check autopilot.json", INFOX, INFOY + 100);
    }
    text("Doppel: " + (cue.showDoppel ? "On" : "Off") + "    Sound: " + (cue.isPlayingSound ? "On" : "Off"), INFOX, INFOY + 175);
    text("Blackout:" + (cue.blackoutLeft ? " Left" : "") + (cue.blackoutRight ? " Right" : ""), INFOX, INFOY + 200);
    text("Fadein: " + cue.fadeints, INFOX, INFOY + 225);
  } else {

    //--------display mode-----------------------
    background(MODEBGS[mode]);
    textSize(40);
    text("mode: " + MODENAMES[mode], INFOX, INFOY);

    //--------display show time------------------
    recordedSeconds = floor((Date.now() - startTime) / 1000);
    let clockMin = floor(recordedSeconds / 60);
    let clockSec = recordedSeconds % 60;
    textSize(14);
    text("Show clock is: " + nf(clockMin, 2, 0) + ":" + nf(clockSec, 2, 0), INFOX, INFOY - 125);

    //--------autopilot------------------
    if (autopilotData && isAutopilot) {
      if (nextActionIdx == undefined) {
        nextActionIdx = findNextActionIdx(recordedSeconds);
        // console.log(nextActionIdx);
      } else {

        if (nextActionIdx <= autopilotData.actions.length - 1) {
          let nextAction = autopilotData.actions[nextActionIdx];
          let actionMin = floor(nextAction.time / 60);
          let actionSec = nextAction.time % 60;
          text("Autopilot is On. Next action: at " + nf(actionMin, 2, 0) + ":" + nf(actionSec, 2, 0) + " press " + nextAction.key + "-" + nextAction.note, INFOX, INFOY - 100, W - 50);
          if (recordedSeconds == nextAction.time) {
            // console.log("executing: " + nextAction.time + ", " + nextAction.key + ", " + nextAction.note);
            let kc;
            if (nextAction.key == "ArrowLeft") kc = 37;
            else if (nextAction.key == "ArrowUp") kc = 38;
            else if (nextAction.key == "ArrowRight") kc = 39;
            else if (nextAction.key == "ArrowDown") kc = 40;
            else kc = nextAction.key.charCodeAt(0);
            window.dispatchEvent(new KeyboardEvent('keydown', {
              keyCode: kc,
              which: kc
            }));
            nextActionIdx++;

          }
        } else {
          text("Autopilot is On. No more actions", INFOX, INFOY - 75);
        }
      }
    } else {
      text("Autopilot is Off. Press M to toggle.", INFOX, INFOY - 75);
    }

    // Run the current mode
    modes[mode].run();

    // Run the curren cue time
    cue.run();

  }
}


//------start & stop performance----------------
function startPerformance() {

  //---reset plateau data
  plateau.plateaus.clear();

  //---reset bookmarks
  bookmark.ts = undefined;

  //---record start time---
  startTime = Date.now();

  //start recording
  socket.emit("record", 1);

  //start show
  started = true;
  console.log("Show and recording started at: " + startTime);
}

function stopPerformance() {
  //stop show
  started = false;

  //stop recording
  socket.emit("record", 0)
  console.log("Show and recording stopped at: " + (Date.now() - startTime));

  //stop sound
  cue.isPlayingSound = false;
  socket.emit("playsound", cue.isPlayingSound)

  //reset cue
  cue.showDoppel = false;
  socket.emit("showdoppel", cue.showDoppel);
  cue.blackoutLeft = false;
  socket.emit("blackoutleft", cue.blackoutLeft);
  cue.blackoutRight = false;
  socket.emit("blackoutright", cue.blackoutRight);

  //reset mode
  mode = 0;
  preset.idx = 2;

  //reset autopilot
  // isAutopilot = false;
  nextActionIdx = undefined;

  //we don't reset startTime, recordedSeconds, delayFrameIdx, pleateaus, and bookmarks just so we can save them if needed
}

function savePerformance() {

  //------------Handling of Rec every 30 sec issue------------------
  //first off, we need to remove the extra recordsing in TD, and update the N number accordingly..
  //then we clean the data to be saved

  //1. get the last available second as a reference
  const lastSecond = recordedSeconds - recordedSeconds % RECORDINGSECONDS;
  // console.log(lastSecond);
  const lastSecondMillis = lastSecond * 1000;

  //2. clear extra plateaus beyond the last second
  //TBD: what about the current class / have new class / target class? These will very likely to be different / recalculated, but might create glitches
  let plateausToSave = new Map();
  plateau.plateaus.forEach((value, key) => {
    let uncleanedPlateaus = plateau.plateaus.get(key);
    // console.log(uncleanedPlateaus);
    let cleanedPlateaus = [];
    uncleanedPlateaus.forEach((p) => {
      if (p.start <= lastSecondMillis) {
        cleanedPlateaus.push(p)
      } //using only start or start + length?
      // console.log(cleanedPlateaus);
    })
    plateausToSave.set(key, cleanedPlateaus);
  })
  // console.log(plateausToSave);
  //3. clear extra bookmark beyond the last second
  let bookmarksToSave = [];
  for (let bm of bookmark.bookmarks) {
    if (bm > lastSecondMillis) continue;
    bookmarksToSave.push(bm);
  }

  let bm1ToSave = bookmark.bookmark1 > lastSecondMillis ? bookmark.bookmark1 : undefined;
  let bm2ToSave = bookmark.bookmark2 > lastSecondMillis ? bookmark.bookmark2 : undefined;
  let bm3ToSave = bookmark.bookmark3 > lastSecondMillis ? bookmark.bookmark3 : undefined;

  let showData = {
    //control data
    mode: mode,
    startTime: startTime,
    recordedSeconds: recordedSeconds,
    delayFrameIdx: delayFrameIdx,
    pDelayFrameIdx: pDelayFrameIdx,
    acceptingNewPlateau: acceptingNewPlateau,
    isAutopilot: isAutopilot,

    //cue data
    showDoppel: cue.showDoppel,
    blackoutLeft: cue.blackoutLeft,
    blackoutRight: cue.blackoutRight,

    //also saving data for each mode
    preset_idx: preset.idx,
    preset_currentDelayFrameIdx: preset.currentDelayFrameIdx,
    manual_TH: manual.TH,
    speed_jointDist: speed.jointDist,
    speed_mappedFrames: speed.mappedFrames,
    speed_avgFrame: speed.avgFrame,
    plateau_plateauOn: plateau.plateauOn,
    plateau_plateaus: JSON.stringify([...plateausToSave]), //replace with cleaned plateaus now
    plateau_currentClass: plateau.currentClass, //should we clear this?
    plateau_haveNewClass: plateau.haveNewClass, //should we clear this?
    plateau_targetClass: plateau.targetClass, //should we clear this?
    plateau_targetClassInPlateaus: plateau.targetClassInPlateaus, //should we clear this?
    plateau_currentClipStartTime: plateau.currentClipStartTime, //should we clear this?
    plateau_currentClipFinished: plateau.currentClipFinished, //should we clear this?
    plateau_currentClipLength: plateau.currentClipLength, //should we clear this?
    plateau_initialDelayFrameIdx: plateau.initialDelayFrameIdx, //should we clear this?
    bookmark_bookmarks: bookmarksToSave, //replace with cleared bookmarks
    bookmark_bookmark1: bm1ToSave,
    bookmark_bookmark2: bm2ToSave,
    bookmark_bookmark3: bm3ToSave,
  };

  console.log("saving the following show data: ");
  console.log(showData);
  saveJSON(showData, 'showData-' + month() + '-' + day() + '-' + hour() + '-' + minute() + '-' + second() + '.json');
  // saveJSON(showData, 'showData.json');
}

function recoverPerformance(jsonPath) {

  loadJSON(jsonPath, (data) => {
    mode = data.mode;
    startTime = Date.now() - (data.recordedSeconds - data.recordedSeconds % RECORDINGSECONDS) * 1000;
    recordedSeconds = data.recordedSeconds - data.recordedSeconds % RECORDINGSECONDS;
    delayFrameIdx = data.delayFrameIdx;
    pDelayFrameIdx = data.pDelayFrameIdx;
    acceptingNewPlateau = data.acceptingNewPlateau;
    isAutopilot = data.isAutopilot;

    cue.showDoppel = data.showDoppel;
    cue.blackoutLeft = data.blackoutLeft;
    cue.blackoutRight = data.blackoutRight;

    preset.idx = data.preset_idx;
    preset.currentDelayFrameIdx = data.preset_currentDelayFrameIdx;
    manual.TH = data.manual_TH;
    speed.jointDist = data.speed_jointDist;
    speed.mappedFrames = data.speed_mappedFrames;
    speed.avgFrame = data.speed_avgFrame;
    // plateau.plateauOn = data.plateau_plateauOn;
    plateau.plateaus = new Map(JSON.parse(data.plateau_plateaus));
    // plateau.currentClass = data.plateau_currentClass;
    // plateau.haveNewClass = data.plateau_haveNewClass;
    // plateau.targetClass = data.plateau_targetClass;
    // plateau.targetClassInPlateaus = data.plateau_targetClassInPlateaus;
    // plateau.currentClipStartTime = data.plateau_currentClipStartTime;
    // plateau.currentClipFinished = data.plateau_currentClipFinished;
    // plateau.currentClipLength = data.plateau_currentClipLength;
    // plateau.initialDelayFrameIdx = data.plateau_initialDelayFrameIdx;
    bookmark.bookmarks = data.bookmark_bookmarks;
    bookmark.bookmark1 = data.bookmark_bookmark1;
    bookmark.bookmark2 = data.bookmark_bookmark2;
    bookmark.bookmark2 = data.bookmark_bookmark3;

    //resuem cues
    socket.emit("showdoppel", cue.showDoppel);
    socket.emit("blackoutleft", cue.blackoutLeft);
    socket.emit("blackoutright", cue.blackoutRight);

    //resume recording
    //socket msg should be the file idx to start recording with. no need for +1 bc file idx starts with 0
    socket.emit("resumerecord", floor(recordedSeconds / RECORDINGSECONDS));

    //resume sound
    socket.emit("cuesound", recordedSeconds);
    if (cue.isPlayingSound == false) {
      cue.isPlayingSound = true;
      socket.emit("playsound", cue.isPlayingSound)
    };


    //start show
    started = true;
    console.log("Show recovered at new start time: " + startTime);

    console.log("recovered plateaus are:");
    console.log(plateau.plateaus);
  });
}

//----------------------autopilot helper-------------------
function findNextActionIdx(currentShowTime) {
  let nextIdx = 0;
  for (let action of autopilotData.actions) {
    if (currentShowTime > action.time) {
      nextIdx++;
    } else break;
  }
  return nextIdx;
}

//----------------------Mode Select--------------------------
function keyPressed(e) {
  // console.log(e);
  // console.log(keyCode);
  switch (keyCode) {
    case 48: //----0------
      mode = PRESET;
      break;
    case 49: //----1------
      mode = MANUAL;
      break;
    case 50: //----2------
      mode = SPEED;
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
      if (mode == MANUAL) modes[MANUAL].update(1);
      if (mode == SPEED) modes[SPEED].adjust(1);
      break;
    case DOWN_ARROW: //arrow down
      if (mode == MANUAL) modes[MANUAL].update(-1);
      if (mode == SPEED) modes[SPEED].adjust(-1);
      break;
    case LEFT_ARROW: //arrow left
      if (mode == PRESET) modes[PRESET].update(-1);
      if (mode == BOOKMARK) modes[BOOKMARK].update(-1);
      if (mode == SPEED) modes[SPEED].update(-1);
      break;
    case RIGHT_ARROW: //arrow right
      if (mode == PRESET) modes[PRESET].update(1);
      if (mode == BOOKMARK) modes[BOOKMARK].update(1);
      if (mode == SPEED) modes[SPEED].update(1);
      break;
    case 81: //-----------Q: save bookmark 1
      // bookmark.ts = Date.now() - startTime;
      bookmark.bookmark1 = Date.now() - startTime;
      break;
    case 87: //-----------W: save bookmark 2
      bookmark.bookmark2 = Date.now() - startTime;
      break;
    case 69: //-----------E: save bookmark 3
      // bookmark.ts = Date.now() - startTime;
      bookmark.bookmark3 = Date.now() - startTime;
      break;
    case 82: //-----------R: jump to bookmark 1
      bookmark.jump(1);
      break;
    case 84: //-----------T: jump to bookmark 2
      // bookmark.ts = Date.now() - startTime;
      bookmark.jump(2);
      break;
    case 89: //-----------Y: jump to bookmark 3
      bookmark.jump(3);
      break;
    case 65: //-----------A: toggle show doppel / (un-)white out
      cue.showDoppel = !cue.showDoppel;
      socket.emit("showdoppel", cue.showDoppel);
      break;
    case 83: //-----------S: toggle black out left
      cue.blackoutLeft = !cue.blackoutLeft;
      socket.emit("blackoutleft", cue.blackoutLeft);
      break;
    case 68: //-----------D: toggle black out right
      cue.blackoutRight = !cue.blackoutRight;
      socket.emit("blackoutright", cue.blackoutRight);
      break;
    case 70: //-----------F: black out both on
      socket.emit("blackoutleft", true);
      socket.emit("blackoutright", true);
      cue.blackoutLeft = true;
      cue.blackoutRight = true;
      break;
    case 71: //-----------G: black out both off
      socket.emit("blackoutleft", false);
      socket.emit("blackoutright", false);
      cue.blackoutLeft = false;
      cue.blackoutRight = false;
      break;
    case 72: //-----------H: black out both off
      socket.emit("fadeinleft");
      cue.fadeints = Date.now();
      break;
    case 73: //-----------I: show joke 1 text
      if (mode == OTHER) socket.emit("source", JOKE1);
      break;
    case 79: //-----------O: show joke 2 text
      if (mode == OTHER) socket.emit("source", JOKE2);
      break;
    case 80: //-----------P: play flashing video
      if (mode == OTHER) socket.emit("source", VIDEO);
      break;
    case 77: //-----------M: toggle autopilot
      isAutopilot = !isAutopilot;
      nextActionIdx = findNextActionIdx(recordedSeconds); //recalculate next action
      break;
    case 76: //-----------L: toggle play/stop sound.mp3
      cue.isPlayingSound = !cue.isPlayingSound
      socket.emit("playsound", cue.isPlayingSound);
      break;
    case 90: //-----------Z: reset max joint dists to their defaults
      speed.maxJointDists.splice(0, speed.maxJointDists.length, ...speed.maxJointDistsDefaults);
      break;
  }

}


//----------------------Performance Start/Stop Control------------------------------

//-------------------------p5 OSC & Socket Setup--------------------------------------
function connect() {
  socket = io.connect('http://127.0.0.1:' + SOCKETPORT, {
    port: SOCKETPORT,
    rememberTransport: false
  });
  socket.on('connect', function() {
    console.log("Connected!");
    if (!started) socket.emit("fileIdx", 0);
  });

  //---socket msg from part 2 classification sketch------------------
  socket.on('plateauOn', function(msg) {
    console.log("plateau classification is: " + (msg ? "On" : "Off"));
    plateau.plateauOn = msg;
  });

  // socket.on('plateauNew222222', function (p) {  //black out all plateaus, for testing only
  socket.on('plateauNew', function(p) {

    if (started) {

      if (acceptingNewPlateau) {
        console.log("received a new plateau of class " + p.className + ". it'll be available after " + RECORDINGSECONDS + " seconds.");

        setTimeout(() => { //delay RECORDINGSECONDS so that plateau playback won't bleed into cache

          console.log("new plateau available: ");
          console.log(p);

          //for each plateau, record its start time relative to the show's start time, i.e., how many milli seconds after the show starts.
          let st = p.start - startTime > 0 ? p.start - startTime : 0;

          if (!plateau.plateaus.has(p.className)) {
            plateau.plateaus.set(p.className, [{
              start: st,
              length: p.end - p.start
            }]); // if plateau of this class never exists, add one.
          } else {
            plateau.plateaus.get(p.className).push({
              start: st,
              length: p.end - p.start
            }); // if plateau of this class already exists, add data to array.
          }
          // console.log(plateaus);
          // plateaus.push({ className: p.className, start: p.start - startTime, length: p.end - p.start }); //save plateaus with timestamps in relation to recording start time

        }, RECORDINGSECONDS * 1000);
      } else {
        console.log("received a new plateau of class " + p.className + " but acceptance is closed. skipped.");
      }

    } else {
      console.log("got a new class " + p.className + " plateau but show not started yet. skipped.");
      // console.log(p);
    }
  });

  socket.on('queriedClass', (c) => {
    if (!plateau.currentClass) {
      plateau.currentClass = c;
      console.log("got queried class: " + c);
    } else {
      console.log("current class is: " + plateau.currentClass);
    };
  });

  socket.on('classNew', (c) => {
    if (mode == PLATEAU && plateau.currentClass != c) {
      plateau.haveNewClass = true;
      plateau.currentClass = c;
      console.log("got new class: " + c);
    };
  });

  socket.on('jointDist', (jd) => {
    speed.jointDist = jd;
  });
}
