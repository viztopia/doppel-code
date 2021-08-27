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

let blackoutLeft = false; //key A to blackout / un-blackout left half
let blackoutRight = false; //key S to blackout / un-blackout right half

//--------------sockets config-----------------------
let socket;
let socketPort = PORT;


//-------------show settings--------------
let btnStart, btnStartVideo, btnStop;
let started = false;
let startTime = 0;

// OBS
let isRecording = false;
let recordIntervalID;
let recordedSeconds;

let delayFrameIdx = 0;
let currentDelayFrameIdx = 0;


//-------------------other------------
let OBSRecordingGap = 1000; //in milli secs. KNOWN ISSUE: some time is required to finish saving the current recording to disk before we can start recording the next clip, especially with high CPU.

function setup() {
  createCanvas(W, H);
  setupOsc(12000, 12001, 13000, 13001); //ports for OBS In / Out, TD In / Out

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

    text("Please clean all recording files first except record.mp4 before START", width / 2 - 225, height / 2);
    text("The first recording file will be named 'recording(2).mp4', then 3, 4, ...", width / 2 - 225, height / 2 + 25);
    sendOscTD("/fileIdx", 0);
  } else {

    // What mode are we in?
    displayMode();

    //--------draw backgrounds in different color---------------
    modes[mode].run();

    //--------display show time------------------
    recordedSeconds = floor((Date.now() - startTime) / 1000);
    text("Performance & recording started for " + recordedSeconds + " seconds, " + recordedSeconds * RECORDINGFPS + " frames", width / 2 - 250, height / 2 - 75);

    //----------------------1. first we calculate how many cached/recorded content is available-----------
    let availableRecordingNum = floor(recordedSeconds / RECORDINGSECONDS);
    let availableTDCacheSeconds = recordedSeconds > TDCACHELENGTH ? TDCACHELENGTH : recordedSeconds;
    text(availableRecordingNum + " recording clips and " + availableTDCacheSeconds + " seconds in TD cache available", width / 2 - 250, height / 2 - 50);


    //-----------------------3. then control TD using delay frame----------------------------
    // console.log(delayFrameIdx);
    if (delayFrameIdx) {

      let cueFileIdx;
      let cuePoint;
      if (delayFrameIdx <= TDCACHEFRAMES) {
        sendOscTD("/mode", 1); //mode 1: load frame from TD cache memory
        cueFileIdx = -99;
        cuePoint = 1 - delayFrameIdx / RECORDINGFRAMES;
        sendOscTD("/frameIdx", delayFrameIdx);

      } else {
        sendOscTD("/mode", 0); //mode 0: load frame from recordings
        let idxOfRecordingFromTD = floor((delayFrameIdx - TDCACHEFRAMES) / RECORDINGFRAMES)
        cueFileIdx = availableRecordingNum - (idxOfRecordingFromTD + 1) + 2; // 2 is the offset for getting the correct recording file name idx in Windows. May need a different value for Mac.
        cuePoint = 1 - (delayFrameIdx - TDCACHEFRAMES - idxOfRecordingFromTD * RECORDINGFRAMES) / RECORDINGFRAMES;
        sendOscTD("/fileIdx", cueFileIdx);
        sendOscTD("/cuePoint", cuePoint);
      }

      text("showing delayed frame:" + delayFrameIdx, width / 2 - 250, height / 2 + 125);
      text("showing file:" + cueFileIdx + " cuePoint: " + cuePoint, width / 2 - 250, height / 2 + 150);

    } else {
      text("No available delay frames yet. Showing TD current frame", width / 2 - 250, height / 2 + 125);
      sendOscTD("/mode", 1); //mode 1: load frame from TD cache memory
      sendOscTD("/frameIdx", 0);
    }

    //-----------------To-do: video mode--------------------
    //1. tell pose estimation & classification sketch to scrub to a specific time
    //2. tell TD to srub movie file in to a specific time
    //3. scrubbing method: TBD


  }
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
      manual.step--;
      break;
    case DOWN_ARROW: //arrow right
      manual.step++;
      break;
    case LEFT_ARROW: //arrow left
      preset.idx > 0 ? preset.idx-- : preset.idx = 0;
      break;
    case RIGHT_ARROW: //arrow right
      preset.idx < PRESETDELAYS.length - 1 ? preset.idx++ : preset.idx = PRESETDELAYS.length - 1;
      break;
    case 81: //-----------Q: bookmark a time
      bookmark.ts = Date.now() - startTime;
      break;
    case 87: //-----------W: jump to bookmark
      bookmark.jump();
      break;
    case 65: //-----------A: toggle blackout left
      blackoutLeft = !blackoutLeft;
      sendOscTD("/blackoutLeft", blackoutLeft ? 1 : 0);
      break;
    case 83: //-----------S: blackout right
      blackoutRight = !blackoutRight;
      sendOscTD("/blackoutRight", blackoutRight ? 1 : 0);
      break;
  }

  // if (manualCount1 > manualCount1Thres) manualCount1 = manualCount1Thres;
  // if (manualCount1 < 0) manualCount1 = 0;
}


//----------------------Performance Start/Stop Control------------------------------

//-----used only for video mode-------------
//Tell pose estimation & classification sketch and TD to start playting the video at the same time
//Need to change the source from VideoCaptureIn to MovieFileIn in TD first
function startVideo() {
  socket.emit("startPlayingVideo", VIDEOPATH);
  sendOscTD();
}

//------start & stop performance----------------
function startPerformance() {
  //---clear plateau data
  plateau.plateaus.clear();

  //---record start time---
  startTime = Date.now();

  //start OBS recording
  toggleOBSRecording();

  recordIntervalID = setInterval(() => { // record a new clip every for every RECORDINGSECONDS seconds, so that both TD cache and hard drive recording latency is managable.
    console.log("Recording stopped at:" + (Date.now() - startTime));
    toggleOBSRecording();

    setTimeout(() => {
      console.log("Recording started at:" + (Date.now() - startTime));
      toggleOBSRecording();
    }, OBSRecordingGap); //KNOWN ISSUE--> seems that OBS will take a little bit of time to save a video file (less than 600ms for a 5min video). NEED TO FIX THIS!

  }, RECORDINGSECONDS * 1000);

  started = true;
  console.log("Show and recording started at: " + startTime);
}

function stopPerformance() {
  //---record stop time---
  started = false;
  clearInterval(recordIntervalID);
  sendOsc("/stopRecording", "");
  isRecording = false;
  console.log("Show and recording stopped at: " + (Date.now() - startTime));
  manualCount1 = 0;
  mode = 0;
  bookmarkTime = -99;

}

//----------OBS controls---------------
function toggleOBSRecording() {
  if (isRecording) {
    sendOsc("/stopRecording", "");
  } else {
    sendOsc("/startRecording", "");
  }
  isRecording = !isRecording;
}

//----------send a pulse to cue the recording for delay playback. currently used in plateau mode.
//might be useful for video mode too?
function mouseClicked() {
  sendOscTD("/cuePulse", 1);
  setTimeout(() => {
    sendOscTD("/cuePulse", 0)
  }, 20);
}

//-------------------------p5 OSC & Socket Setup--------------------------------------
function setupOsc(oscPortIn, oscPortOut, oscPortIn2, oscPortOut2) {
  socket = io.connect('http://127.0.0.1:' + socketPort, {
    port: socketPort,
    rememberTransport: false
  });
  socket.on('connect', function() {

    //---Setup OBS OSC---
    socket.emit('config1', {
      server: {
        port: oscPortIn,
        host: '127.0.0.1'
      },
      client: {
        port: oscPortOut,
        host: '127.0.0.1'
      }
    });

    //---Setup TD OSC---
    socket.emit('config2', {
      server: {
        port: oscPortIn2,
        host: '127.0.0.1'
      },
      client: {
        port: oscPortOut2,
        host: '127.0.0.1'
      }
    });
  });

  //---OBS---
  socket.on('message1', function(msg) {
    console.log("message1");
    if (msg[0] == '#bundle') {
      for (var i = 2; i < msg.length; i++) {
        receiveOsc(msg[i][0], msg[i].splice(1));
      }
    } else {
      receiveOsc(msg[0], msg.splice(1));
    }
  });

  //---TD---
  socket.on('message2', function(msg) {
    console.log("message2");
    if (msg[0] == '#bundle') {
      for (var i = 2; i < msg.length; i++) {
        receiveOsc(msg[i][0], msg[i].splice(1));
      }
    } else {
      receiveOsc(msg[0], msg.splice(1));
    }
  });

  //---socket msg from part 2 classification sketch------------------
  socket.on('plateauOn', function(msg) {
    console.log("plateau classification is: " + (msg ? "On" : "Off"));
    plateauOn = msg;
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

function sendOsc(address, value) {
  socket.emit('message1', [address].concat(value));
}

function sendOscTD(address, value) {
  socket.emit('message2', [address].concat(value));
}

function receiveOsc(address, value) {
  console.log("received OSC: " + address + ", " + value);

  if (address == '/test') {
    x = value[0];
    y = value[1];
  }
}


//------------helper functions to get delay frame in TD-----------------------
function getStartTimeAndLengthFirstMatch(_plateaus) {
  let pltData = _plateaus.get(_currentClass);
  if (pltData.length > 0) {
    const foundPlateau = pltData[0];

    //converting from milli seconds to frames
    const delayFrame = floor(foundPlateau.start / 1000 * CAMFPS);
    return delayFrame;
  } else {
    return undefined;
  }
}

function getStartTimeAndLengthRandom(_plateaus, _currentClass) {
  let pltData = _plateaus.get(_currentClass);

  if (pltData) {
    const foundPlateau = chance.pickone(pltData);

    return [foundPlateau.start, foundPlateau.length];
  } else {
    return [undefined, undefined];
  }
}
