let preset = {
  idx: undefined, //default to 4 sec.
  pIdx: undefined,
  currentDelayFrameIdx: undefined,
  jumpIdx: undefined, //preset idx smaller than this idx will be jumped and not eased
  reset: function() {
    this.idx = 2; //default to 4 sec.
    this.pIdx = 2;
    this.currentDelayFrameIdx = 0;
    this.jumpIdx = 2; //preset idx smaller than this idx will be jumped and not eased
  },
  run: function () {
    text("Current delay interval is: " + PRESETS[this.idx] + " seconds", INFOX, INFOY + 25);
    text("Note: presets on the left of " + PRESETS[this.jumpIdx] + " seconds will NOT be eased.", INFOX, INFOY + 50);
    this.updateCurrentFrame();
  },
  update: function (step) {
    // Update current preset
    this.idx += step;
    this.idx = constrain(this.idx, 0, PRESETS.length - 1);

  },
  updateCurrentFrame: function () {
    if (this.idx < this.jumpIdx || (this.idx == 2 & this.pIdx == 1)) { //if preset idx smaller than jump idx, just jump
      this.currentDelayFrameIdx = PRESETS[this.idx] * RECORDINGFPS;
    } else { // Easing
      if (this.currentDelayFrameIdx < PRESETS[this.idx] * RECORDINGFPS) this.currentDelayFrameIdx++;
      else if (this.currentDelayFrameIdx > PRESETS[this.idx] * RECORDINGFPS) this.currentDelayFrameIdx--;
      // delayFrameIdx = PRESETS[fixedIntervalIdx] * RECORDINGFPS;
    }

    delayFrameIdx = this.currentDelayFrameIdx;
    this.pIdx = this.idx;
  }
}

let manual = {
  TH: undefined,
  reset: function() {
    this.TH = 6000;
  },
  run: function () {
    text("Manual Count: " + delayFrameIdx, INFOX, INFOY + 25);
  },
  update: function (step) {

    // Update the delay
    delayFrameIdx += step;
    if (delayFrameIdx > recordedSeconds * RECORDINGFPS) {
      delayFrameIdx = recordedSeconds * RECORDINGFPS;
      text("Maximum delay reached based on available recorded content.", INFOX, INFOY + 50);
      text("Capping it to recordedSeconds * RECORDINGFPS.", INFOX, INFOY + 75);
    }
  }
}


let speed = { //------------speed-based--------------------------
  jointDist: undefined,
  pJointDist: undefined,
  FRAMESTOCACHE: undefined, //caching 20 seconds for testing, so 20 * 30 = 600 frames
  mappedFrames: undefined,
  avgFrame: undefined,
  maxJointDistsDefaults: undefined, //default max joint dist used for preset recovery
  maxJointDists: undefined, //speed cue values based on 10/20 testing
  maxJointDistIdx: undefined,  //the current idx used for speed cue
  reset: function() {
    this.jointDist = 0,
    this.pJointDist = 0,
    this.FRAMESTOCACHE = 600; //caching 20 seconds for testing, so 20 * 30 = 600 frames
    this.mappedFrames = [];
    this.avgFrame = 0;
    this.maxJointDistsDefaults = [1, 1, 1, 1]; //default max joint dist used for preset recovery
    this.maxJointDists = [0.75, 0.75, 0.75, 0.75]; //speed cue values based on 10/20 testing
    this.maxJointDistIdx = 0;  //the current idx used for speed cue
  },
  run: function () {
    //map the jointDist amount to a frame index between 0 and framesToCache
    let mappedFrame = constrain(map(this.jointDist, 0, this.maxJointDists[this.maxJointDistIdx], 0, CACHEFRAMES - 1), 0, CACHEFRAMES - 1); //currently using only TD cache for performance considerations
    // console.log(mappedFrame);

    //save the mapped frame into an array to get avg frame
    this.mappedFrames.push(mappedFrame);
    if (this.mappedFrames.length > this.FRAMESTOCACHE) {
      this.mappedFrames.splice(0, 1);
    }

    this.pJointDist = this.jointDist;


    if (this.mappedFrames.length > 0) {
      delayFrameIdx = floor(getAvg1d(this.mappedFrames));
      text("Current joint dist is: " + this.jointDist, INFOX, INFOY + 25);
      text("Averaged delay frame is: " + delayFrameIdx, INFOX, INFOY + 50);
      text("Current Max Joint Dist is: " + this.maxJointDists[this.maxJointDistIdx] + ", Z to reset.", INFOX, INFOY + 75);
    };
  },
  update: function (step) {
    // Update current speed max joint dist preset
    this.maxJointDistIdx += step;
    this.maxJointDistIdx = constrain(this.maxJointDistIdx, 0, this.maxJointDists.length - 1);
  },
  adjust: function (step) {
    // manual adjust current max joint dist
    this.maxJointDists[this.maxJointDistIdx] += step * 0.05;
    this.maxJointDists[this.maxJointDistIdx] = constrain(this.maxJointDists[this.maxJointDistIdx], 0.05, 2); //constrain joint dist btw 0.05 & 2
  }
}

let plateau = { //-------------plateau-based----------------
  //-------------------mode 3: clasification plateau stuff----------------
  plateauOn: undefined, //whether plateau classification is on or off
  classOn: undefined, //whether sending class is on or off
  plateaus: new Map(),
  currentClass: undefined,
  haveNewClass: false,
  targetClass: undefined,
  targetClassInPlateaus: false,
  currentClipStartTime: undefined,
  currentClipFinished: true,
  currentClipLength: undefined,
  initialDelayFrameIdx: undefined,
  timer: undefined,
  currentWindowIdx: 0, //idx 0 is window length 20
  reset: function() {
    this.plateauOn = undefined; //whether plateau classification is on or off
    this.classOn = undefined; //whether sending class is on or off
    this.plateaus = new Map();
    this.currentClass = undefined;
    this.haveNewClass = false;
    this.targetClass = undefined;
    this.targetClassInPlateaus = false;
    this.currentClipStartTime = undefined;
    this.currentClipFinished = true;
    this.currentClipLength = undefined;
    this.initialDelayFrameIdx = undefined;
    this.timer = undefined;
    this.currentWindowIdx = 0; //idx 0 is window length 20
  },
  run: function () {

    // if we can't get plateau classification status, need to check if classifier is running and socket connection is ok.
    if (this.plateauOn == undefined) {
      text("Plateau classification is unknown. PLEASE CHECK Classifier Connection.", INFOX, INFOY + 25);
      return;
    }

    // run normal plateau logic
    if (this.classOn != undefined) {
      text("Plateau classification is: " + (this.plateauOn ? "On." : "Off.") + " Sending Class: " + (this.classOn ? "On." : "Off.") + " Window: " + PLATEAUWINDOWS[this.currentWindowIdx], INFOX, INFOY + 25);
    } else {
      text("Plateau classification is: " + (this.plateauOn ? "On." : "Off.") + " Sending Class: unknow. (Should be off by default).", INFOX, INFOY + 25);
    }

    if (!this.currentClass) { console.log("querying class"); socket.emit("queryClass"); }

    //----------------------auto controlling TD using plateau data------------------------
    // console.log(haveNewClass, currentClipFinished);
    if (this.haveNewClass || this.currentClipFinished) {
      //pick a plateau whenever there's a new class or the current clip is finished
      let [pStartTime, pLength] = getStartTimeAndLengthRandom(this.plateaus, this.currentClass);
      this.haveNewClass = false;
      // this.currentClipFinished = false;

      // console.log(pStartTime, pLength);
      if (pStartTime != undefined && pLength != undefined) {
        this.targetClass = this.currentClass; //TODO: target class is a place holder for interuption logic
        this.targetClassInPlateaus = true;
        this.currentClipStartTime = Date.now();
        this.currentClipLength = pLength;
        console.log("target class " + this.currentClass + " in plateaus: " + this.targetClassInPlateaus);
        console.log("start: " + pStartTime + " length: " + pLength);
        let millisToDelay = Date.now() - startTime - pStartTime;
        console.log("millis to delay: " + millisToDelay);
        delayFrameIdx = floor((millisToDelay) / 1000 * CAMFPS); //convert plateau start time to how many frames we should go back from the present
        this.initialDelayFrameIdx = delayFrameIdx;
        // this.haveNewClass = false;
        this.currentClipFinished = false;

        // Clear the current timer if there is one
        if (this.timer) clearTimeout(this.timer);

        //wait for pLength milliseconds to ask for a new clip
        this.timer = setTimeout(() => {
          this.currentClipFinished = true;
          console.log("current clip done.")
        }, pLength);

      } else {
        this.targetClassInPlateaus = false;
      }

    } else {
      //otherwise continue on the current clip (update the delayFrameIdx every RECORDINGSECONDS)
      // if (this.initialDelayFrameIdx) delayFrameIdx = this.initialDelayFrameIdx + floor((Date.now() - this.currentClipStartTime) / 1000 / RECORDINGSECONDS) * RECORDINGFRAMES;

      //otherwise continue on the current clip (auto roll over to next recording is now happening in TD)
      if (this.initialDelayFrameIdx) delayFrameIdx = this.initialDelayFrameIdx;
    }

    text("Current class is: " + this.currentClass, INFOX, INFOY + 50);
    if (!this.targetClassInPlateaus) text("We need at least one plateau finished " + RECORDINGSECONDS + " seconds ago to pull from the recording.", INFOX, INFOY + 75);
    if (this.targetClassInPlateaus) text("Current pulling " + this.targetClass + ", method is: Random. Finishing in: " + (this.currentClipLength - (Date.now() - this.currentClipStartTime)) / 1000, INFOX, INFOY + 100);


    // if (this.plateauOn) { //-----------------------if plateau classification is on, we calculate the number of frames to be delayed automatically

    // } else {

    //   text("Press J to turn on plateau classification", INFOX, INFOY + 50);
    //   // //----------------------manual controlling TD using mouse as a fall back------------------------
    //   // fill(0);
    //   // ellipse(mouseX, mouseY, 50, 50);
    //   // //first calculate the number of frames available for manual srubbing
    //   // //dynamically allocating TD cached frames for scrubbing is too glitchy, so we assume TD is already fully cached.
    //   // let availableFrames = cue.availableRecordingNum * RECORDINGFRAMES + CACHEFRAMES;

    //   // //then we reversely map mouseX with available Frames
    //   // delayFrameIdx = constrain(floor(map(mouseX, 0, width, availableFrames - 1, 0)), 0, availableFrames - 1);
    //   // // delayFrameIdx = 0;
    // }
  },
  update: function (step) {
    this.currentWindowIdx += step;
    console.log(this.currentWindowIdx);
    this.currentWindowIdx = constrain(this.currentWindowIdx, 0, PLATEAUWINDOWS.length - 1);
    socket.emit("updateWindow", PLATEAUWINDOWS[this.currentWindowIdx]);
  }
}

let bookmark = { //------------bookmark---------------------
  bookmarks: [],
  idx: 0,
  bookmark1: undefined,
  bookmark2: undefined,
  bookmark3: undefined,
  reset: function() {
    this.bookmarks = [];
    this.idx = 0;
    this.bookmark1 = undefined;
    this.bookmark2 = undefined;
    this.bookmark3 = undefined;
  },
  run: function () {
    if (this.bookmark1 || this.bookmark2 || this.bookmark3) {
      let bookmarkTime1 = this.bookmark1 == undefined ? "empty" : (nf(floor(this.bookmark1 / 1000 / 60), 2, 0) + ":" + nf(floor(this.bookmark1 / 1000 % 60), 2, 0));
      let bookmarkTime2 = this.bookmark2 == undefined ? "empty" : (nf(floor(this.bookmark2 / 1000 / 60), 2, 0) + ":" + nf(floor(this.bookmark2 / 1000 % 60), 2, 0));
      let bookmarkTime3 = this.bookmark3 == undefined ? "empty" : (nf(floor(this.bookmark3 / 1000 / 60), 2, 0) + ":" + nf(floor(this.bookmark3 / 1000 % 60), 2, 0));
      text("Current bookmarks:  " + bookmarkTime1 + ",  " + bookmarkTime2 + ",  " + bookmarkTime3, INFOX, INFOY + 25);
    } else {
      text("No bookmarks available yet.", INFOX, INFOY + 25);
    }
    text("Press Q, W, E to add/overwrite, press R, T, Y to jump.", INFOX, INFOY + 50);
    // let bookmarksString = "";
    // this.bookmarks.forEach((bm) => { bookmarksString += (bm / 1000) + "  " });
    // text("Available bookmarks are:" + bookmarksString, INFOX, INFOY + 75, 450);
  },
  // update: function (step) {
  //   // Update current bookmark
  //   this.idx += step;
  //   this.idx = constrain(this.idx, 0, this.bookmarks.length - 1);
  // },
  jump: function (bmNum) {
    let bmToJump;
    if (bmNum == 1) { bmToJump = this.bookmark1; }
    else if (bmNum == 2) { bmToJump = this.bookmark2; }
    else if (bmNum == 3) { bmToJump = this.bookmark3; }
    if (!bmToJump) return;
    console.log("jump to: " + bmToJump);
    delayFrameIdx = floor((Date.now() - startTime - bmToJump) / 1000 * CAMFPS);
  }
}

let other = {
  run: function () {
    text("Press I to show JOKE 1 text.", INFOX, INFOY + 25);
    text("Press O to show JOKE 2 text.", INFOX, INFOY + 50);
    text("Press P to play FLASHING video.", INFOX, INFOY + 75);
  },
  reset: function() {
    return;
  }
}


// Store all the modes in an array
let modes = [preset, manual, speed, plateau, bookmark, other];

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
  // console.log(pltData);

  if (pltData) {
    const foundPlateau = chance.pickone(pltData);
    return [foundPlateau.start, foundPlateau.length];
  } else {
    return [undefined, undefined];
  }
}

function getStartTimeAndLengthRandomOpposite(_plateaus, _currentClass) {
  let pltData;
  switch (_currentClass) {
    case "1":
      pltData = _plateaus.get("4");
      break;
    case "2":
      pltData = _plateaus.get("3");
      break;
    case "3":
      pltData = _plateaus.get("2");
      break;
    case "4":
      pltData = _plateaus.get("1");
      break;
    case "5":
      pltData = _plateaus.get("6");
      break;
    case "6":
      pltData = _plateaus.get("5");
      break;
  }


  if (pltData) {
    const foundPlateau = chance.pickone(pltData);
    return [foundPlateau.start, foundPlateau.length];
  } else {
    return [undefined, undefined];
  }
}
