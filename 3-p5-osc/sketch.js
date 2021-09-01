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
let btnStart, btnStartVideo, btnStop;
let started = false;
let startTime = 0;

// Recorder
let isRecording = false;
let recordIntervalID;
let recordedSeconds;

let delayFrameIdx = 0;
let pDelayFrameIdx = 0;
let currentDelayFrameIdx = 0;



function setup() {
  createCanvas(W, H);
  connect(); //ports for OBS In / Out, TD In / Out

  btnStart = createButton('START'); //master control: start performance
  btnStart.position(0, 0);
  btnStart.mousePressed(startPerformance);
  btnStartVideo = createButton('START VIDEO'); //master control: start performance in video mode (in progress)
  btnStartVideo.position(80, 0);
  btnStartVideo.mousePressed(() => {
    startVideo();
    startPerformance();
  });
  btnStop = createButton('STOP'); //master control: stop performance
  btnStop.position(200, 0);
  btnStop.mousePressed(stopPerformance);

  textAlign(LEFT, CENTER);

}

function draw() {

  if (!started) {
    background(255, 0, 255);
    textSize(14);
    text("Please clean all recording files first except record.mp4 before START", width / 2 - 225, height / 2);
    text("The first recording file will be named 'recording(2).mp4', then 3, 4, ...", width / 2 - 225, height / 2 + 25);
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

    // Cue doppelganger in TD, only if there's a change
    if (abs(delayFrameIdx - pDelayFrameIdx) > 0) {
      cue.run();
      pDelayFrameIdx = delayFrameIdx;
    }
  }
}


//------start & stop performance----------------
function startPerformance() {
  //---clear plateau data
  plateau.plateaus.clear();

  //---record start time---
  startTime = Date.now();

  //start recording
  socket.emit("record", 1);
  isRecording = true;

  // recordIntervalID = setInterval(() => { // record a new clip every for every RECORDINGSECONDS seconds, so that both TD cache and hard drive recording latency is managable.
  //   console.log("Recording stopped at:" + (Date.now() - startTime));
  //
  //   socket.emit("record", 0);
  //   isRecording = false;
  //
  //   setTimeout(() => {
  //     console.log("Recording started at:" + (Date.now() - startTime));
  //     socket.emit("record", 1);
  //     isRecording = true;
  //   }, RECORDINGGAP); //KNOWN ISSUE--> seems that OBS will take a little bit of time to save a video file (less than 600ms for a 5min video). NEED TO FIX THIS!
  //
  // }, RECORDINGSECONDS * 1000);

  started = true;
  console.log("Show and recording started at: " + startTime);
}

function stopPerformance() {
  //---record stop time---
  started = false;
  clearInterval(recordIntervalID);
  socket.emit("record", 0)
  isRecording = false;
  console.log("Show and recording stopped at: " + (Date.now() - startTime));
  manualCount1 = 0;
  mode = 0;
  bookmarkTime = -99;

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
    case UP_ARROW: //arrow left
      if (mode == MANUAL) modes[MANUAL].update(-1);
      break;
    case DOWN_ARROW: //arrow right
      if (mode == MANUAL) modes[MANUAL].update(1);
      break;
    case LEFT_ARROW: //arrow left
      if (mode == PRESET) modes[PRESET].update(-1);
      break;
    case RIGHT_ARROW: //arrow right
      preset.idx < PRESETS.length - 1 ? preset.idx++ : preset.idx = PRESETS.length - 1;
      break;
    case 81: //-----------Q: bookmark a time
      bookmark.ts = Date.now() - startTime;
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

  // if (manualCount1 > manualCount1Thres) manualCount1 = manualCount1Thres;
  // if (manualCount1 < 0) manualCount1 = 0;
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

  socket.on('plateauNew', function(p) {
    console.log("got a new plateau: ");
    console.log(p);

    //for each plateau, record its start time relative to the show's start time, i.e., how many milli seconds after the show starts.
    let st = p.start - startTime > 0 ? p.start - startTime : 0;

    if (!plateaus.has(p.className)) {
      plateaus.set(p.className, [{
        start: st,
        length: p.end - p.start
      }]); // if plateau of this class never exists, add one.
    } else {
      plateaus.get(p.className).push({
        start: st,
        length: p.end - p.start
      }); // if plateau of this class already exists, add data to array.
    }
    // console.log(plateaus);
    // plateaus.push({ className: p.className, start: p.start - startTime, length: p.end - p.start }); //save plateaus with timestamps in relation to recording start time
  });

  socket.on('classNew', (c) => {
    if (currentClass != c) {
      haveNewClass = true;
      currentClass = c;
    };
  });

  socket.on('jointDist', (jd) => {
    jointDist = jd;
  });
}
