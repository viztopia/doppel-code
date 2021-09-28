// Multiple bookmarks
// MIDI controller
// Video playing mode
// Writing state values to file and reload



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

//-------------recover settings
let acceptingNewPlateau = true;



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
  btnRecoverShow.mousePressed(() => { acceptingNewPlateau = true; recoverPerformance("showData.json") }); //make sure to change json name to showData.json

  btnRecoverOhCrap = createButton('RECOVER Oh Crap'); //
  btnRecoverOhCrap.position(240, 25);
  btnRecoverOhCrap.mousePressed(() => { acceptingNewPlateau = false; recoverPerformance("showData.json") }); //make sure to change json name to showData.json

  textAlign(LEFT, CENTER);

}

function draw() {

  if (!started) {
    background(255, 0, 255);
    textSize(14);
    text("If you wanna recover show:", width / 2 - 225, height / 2 - 25);
    text("Please make sure TD window is active and NOT minimized FIRST!", width / 2 - 225, height / 2 + 25);
    text("Then make sure showData.json is updated.", width / 2 - 225, height / 2 + 50);
  } else {

    //--------display mode-----------------------
    background(MODEBGS[mode]);
    textSize(40);
    text("mode: " + MODENAMES[mode], INFOX, INFOY);

    //--------display show time------------------
    recordedSeconds = floor((Date.now() - startTime) / 1000);
    textSize(14);
    text("Performance & recording started for " + recordedSeconds + " seconds, " + recordedSeconds * RECORDINGFPS + " frames", width / 2 - 250, height / 2 - 75);

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

  //reset mode
  mode = 0;

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
      if (p.start <= lastSecondMillis) { cleanedPlateaus.push(p) } //using only start or start + length?
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

  let showData = {
    mode: mode,
    startTime: startTime,
    recordedSeconds: recordedSeconds,
    delayFrameIdx: delayFrameIdx,
    pDelayFrameIdx: pDelayFrameIdx,

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
    plateau_currentClipFinished: plateau.currentClipFinished,  //should we clear this?
    plateau_currentClipLength: plateau.currentClipLength, //should we clear this?
    plateau_initialDelayFrameIdx: plateau.initialDelayFrameIdx, //should we clear this?
    bookmark_bookmarks: bookmarksToSave, //replace with cleared bookmarks
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

    //resume recording
    //socket msg should be the file idx to start recording with. no need for +1 bc file idx starts with 0
    socket.emit("resumeRecord", floor(recordedSeconds / RECORDINGSECONDS));

    //start show
    started = true;
    console.log("Show recovered at new start time: " + startTime);

    console.log("recovered plateaus are:");
    console.log(plateau.plateaus);
  });
}

//----------------------Mode Select--------------------------
function keyPressed() {
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
    case UP_ARROW: //arrow up
      if (mode == MANUAL) modes[MANUAL].update(-1);
      if (mode == BOOKMARK) modes[BOOKMARK].update(-1);
      break;
    case DOWN_ARROW: //arrow down
      if (mode == MANUAL) modes[MANUAL].update(1);
      if (mode == BOOKMARK) modes[BOOKMARK].update(1);
      break;
    case LEFT_ARROW: //arrow left
      if (mode == PRESET) modes[PRESET].update(-1);
      break;
    case RIGHT_ARROW: //arrow right
      preset.idx < PRESETS.length - 1 ? preset.idx++ : preset.idx = PRESETS.length - 1;
      break;
    case 81: //-----------Q: bookmark a time
      // bookmark.ts = Date.now() - startTime;
      bookmark.bookmarks.push(Date.now() - startTime);
      break;
    case 87: //-----------W: jump to bookmark
      bookmark.jump();
      break;
    case 65: //-----------A: black out left on
      socket.emit("blackoutleft", true);
      break;
    case 83: //-----------S: black out left off
      socket.emit("blackoutleft", false);
      break;
    case 68: //-----------D: black out right on
      socket.emit("blackoutright", true);
      break;
    case 70: //-----------F: black out right off
      socket.emit("blackoutright", false);
      break;
    case 71: //-----------G: black out both on
      socket.emit("blackoutleft", true);
      socket.emit("blackoutright", true);
      break;
    case 72: //-----------H: black out both off
      socket.emit("blackoutleft", false);
      socket.emit("blackoutright", false);
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
  socket.on('connect', function () {
    console.log("Connected!");
    if (!started) socket.emit("fileIdx", 0);
  });

  //---socket msg from part 2 classification sketch------------------
  socket.on('plateauOn', function (msg) {
    console.log("plateau classification is: " + (msg ? "On" : "Off"));
    plateau.plateauOn = msg;
  });

  // socket.on('plateauNew222222', function (p) {  //black out all plateaus, for testing only
  socket.on('plateauNew', function (p) {

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
