let preset = {
  idx: 0,
  run: function() {
    text("Current delay interval is: " + PRESETS[this.idx] + " seconds", INFOX, INFOY + 25);
    this.updateCurrentFrame();
  },
  update: function(step) {
    // Update current preset
    this.idx += step;
    this.idx = constrain(this.idx, 0, PRESETS.length-1);
  },
  updateCurrentFrame: function(){
    // Easing
    if (currentDelayFrameIdx < PRESETS[this.idx] * RECORDINGFPS) currentDelayFrameIdx++;
    else if (currentDelayFrameIdx > PRESETS[this.idx] * RECORDINGFPS) currentDelayFrameIdx--;
    // delayFrameIdx = PRESETS[fixedIntervalIdx] * RECORDINGFPS;
    delayFrameIdx = currentDelayFrameIdx;
  }
}

let manual = {
  TH: 6000,
  run: function() {
    text("Manual Count: " + delayFrameIdx, INFOX, INFOY + 25);
  },
  update: function(step) {

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
  //-------------------mode 2: speed-based delay stuff-----------------------
  jointDist: 0,
  FRAMESTOCACHE: 600, //caching 10 seconds for testing, so 10 * 60 = 600 frames
  mappedFrames: [],
  avgFrame: 0,
  run: function() {

    //map the jointDist amount to a frame index between 0 and framesToCache
    let mappedFrame = constrain(map(this.jointDist, 0, MAXJOINTDIST, 0, CACHEFRAMES - 1), 0, CACHEFRAMES - 1); //currently using only TD cache for performance considerations
    // console.log(mappedFrame);

    //save the mapped frame into an array to get avg frame
    this.mappedFrames.push(mappedFrame);
    if (this.mappedFrames.length > this.FRAMESTOCACHE) {
      this.mappedFrames.splice(0, 1);
    }

    if (mappedFrames.length > 0) {
      delayFrameIdx = floor(getAvg1d(this.mappedFrames));
      text("Current joint dist is: " + this.jointDist, INFOX, INFOY + 25);
      text("Averaged delay frame is: " + delayFrameIdx, INFOX, INFOY + 50);
    }
  }
}

let plateau = { //-------------plateau-based----------------
  //-------------------mode 3: clasification plateau stuff----------------
  plateauOn: false,
  plateaus: new Map(),
  currentClass: undefined,
  haveNewClass: false,
  currentClipFinished: true,
  lastPlateauFrameIdx: undefined,
  run: function() {
    text("Plateau classification is: " + (this.plateauOn ? "On." : "Off."), INFOX, INFOY + 25);

    if (this.plateauOn) { //-----------------------if plateau classification is on, we calculate the number of frames to be delayed automatically
      if (!this.currentClass) socket.emit("queryClass");
      //----------------------auto controlling TD using plateau data------------------------

      // console.log(haveNewClass, currentClipFinished);
      if (this.haveNewClass || this.currentClipFinished) {
        //pick a plateau whenever there's a new class or the current clip is finished
        let [pStartTime, pLength] = getStartTimeAndLengthRandom(plateaus, currentClass);

        if (pStartTime && pLength) {
          delayFrameIdx = floor((Date.now() - startTime - pStartTime) / 1000 * CAMFPS); //convert plateau start time to how many frames we should go back from the present
          this.lastPlateauFrameIdx = delayFrameIdx;
          this.haveNewClass = false;
          this.currentClipFinished = false;

          setTimeout(() => {
            this.currentClipFinished = true
          }, pLength); //waift for pLength milliseconds to ask for a new clip
        }

      } else {
        //otherwise continue on the current clip
        if (this.lastPlateauFrameIdx) delayFrameIdx = this.lastPlateauFrameIdx;
      }

      text("Current class is: " + currentClass, INFOX, INFOY + 50);
      text("We need at least one complated plateau record to pull from the recording.", INFOX, INFOY + 75);
      text("Current pulling method is: Random", INFOX, INFOY + 100);

    } else {
      //----------------------manual controlling TD using mouse as a fall back------------------------
      fill(0);
      ellipse(mouseX, mouseY, 50, 50);
      //first calculate the number of frames available for manual srubbing
      //dynamically allocating TD cached frames for scrubbing is too glitchy, so we assume TD is already fully cached.
      let availableFrames = cue.availableRecordingNum * RECORDINGFRAMES + CACHEFRAMES;

      //then we reversely map mouseX with available Frames
      delayFrameIdx = constrain(floor(map(mouseX, 0, width, availableFrames - 1, 0)), 0, availableFrames - 1);
      // delayFrameIdx = 0;
    }
  }
}

let bookmark = { //------------bookmark---------------------
  //-------------------mode 4: bookmark stuff-----------------------
  // TODO: Implement multiple bookmarks
  ts: undefined,
  lastJumpedFrameIdx: undefined,
  run: function() {
    if (this.ts) {
      text("Current bookmark is:" + this.bookmarkTime / 1000 + " seconds", INFOX, INFOY + 25);
    } else {
      text("No bookmarks available yet. Press Q to save a bookmark.", INFOX, INFOY + 25);
    }
    text("Press W to jump, press Q to overwrite the current.", INFOX, INFOY + 50);
  },
  jump: function() {
    if (!this.ts) return;

    delayFrameIdx = floor((Date.now() - startTime - this.ts) / 1000 * CAMFPS);
    this.lastJumpedFrameIdx = delayFrameIdx;
  }
}


// Store all the modes in an array
let modes = [preset, manual, speed, plateau, bookmark];

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
