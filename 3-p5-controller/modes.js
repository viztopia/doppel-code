let preset = {
  reset: function() {
    this.idx = 1; //default to 4 sec.
    this.pIdx = 1;
  },
  run: function() {
    text("Current delay interval is: " + PRESETS[this.idx] + " seconds", INFOX, INFOY + 30);
  },
  set: function(idx) {
    this.idx = idx;
    cue.set(PRESETS[this.idx]);
  },
  update: function(step) {
    // Update current preset
    this.idx += step;
    this.idx = constrain(this.idx, 0, PRESETS.length - 1);
    // cue.ease(PRESETS[this.idx]);
    cue.set(PRESETS[this.idx]);
  },
  emit: function(){
    cue.emit();
  }
}

let manual = {
  reset: function() {
    this.delayInSeconds = 0;
  },
  run: function() {
    text("Manual Count: " + nf(this.delayInSeconds * 0.05, 0, 2), INFOX, INFOY + 30);
  },
  set: function(seconds) {
    cue.set(seconds);
  },
  adjust: function(step) {
    // Update the delay
    this.delayInSeconds += step * 0.1;
    this.set(this.delayInSeconds);
  }
}


let speed = { //------------speed-based--------------------------
  reset: function() {
    this.jointDist = 0,
    this.pJointDist = 0,
    this.FRAMESTOCACHE = 600; //caching 20 seconds for testing, so 20 * 30 = 600 frames
    this.mappedFrames = [];
    this.avgFrame = 0;
    this.maxJointDist = 1; //speed cue values based on 10/20 testing
  },
  run: function() {
    //map the jointDist amount to a frame index between 0 and framesToCache
    let mappedFrame = constrain(map(this.jointDist, 0, this.maxJointDist, 0, CACHEFRAMES - 1), 0, CACHEFRAMES - 1); //currently using only TD cache for performance considerations
    // console.log(mappedFrame);

    //save the mapped frame into an array to get avg frame
    this.mappedFrames.push(mappedFrame);
    if (this.mappedFrames.length > this.FRAMESTOCACHE) {
      this.mappedFrames.splice(0, 1);
    }

    this.pJointDist = this.jointDist;


    if (this.mappedFrames.length > 0) {
      // Set new delayFrameIdx
      cue.setFrames(floor(getAvg1d(this.mappedFrames)));
      text("Current joint dist is: " + this.jointDist, INFOX, INFOY + 30);
      text("Averaged delay frame is: " + cue.delayFrameIdx, INFOX, INFOY + 50);
      text("Current Max Joint Dist is: " + nfs(this.maxJointDist, 0, 2) + ", Z to reset.", INFOX, INFOY + 70);
    };
  },
  set: function(mjd) {
    // Update current speed max joint dist
    this.maxJointDist = mjd;
  },
  adjust: function(step) {
    // manual adjust current max joint dist
    this.maxJointDist += step * 0.05;
    this.maxJointDist = constrain(this.maxJointDist, 0.05, 2); //constrain joint dist btw 0.05 & 2
  },
  updateJointDist: function(jd) {
    this.jointDist = jd;
  }
}

let plateau = { //-------------plateau-based----------------
  reset: function() {
    this.classify = false; //whether plateau classification is on or off
    this.PLATEAUS = 0;
    this.CLASSES = 1;
    this.sending = this.PLATEAUS; //whether sending class is on or off
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
    this.window = 60;
    this.confidence = 90; //idx 0 is 90% classification confidence
  },
  emit: function(){
    emit("setclassifier", this.classify);
    emit("setsender", this.sending);
    emit("updateWindow", this.window);
    emit("updateConfidence", this.confidence);
  },
  run: function() {
    if (!this.currentClass) {
      console.log("querying class");
      emit("queryClass");
    }

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

        // Calculate delay from NOW in MS
        let millisToDelay = Date.now() - startTime - pStartTime;
        console.log("millis to delay: " + millisToDelay);
        // Set delayFrameIdx
        cue.set(floor((millisToDelay) / 1000));
        this.initialDelayFrameIdx = cue.delayFrameIdx;

        // Have new clip now...
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

    }

    text("Current class is: " + this.currentClass, INFOX, INFOY + 30);
    if (!this.targetClassInPlateaus) text("No plateaus available. (" + RECORDINGSECONDS + "s ago)", INFOX, INFOY + 50);
    if (this.targetClassInPlateaus) text("Current pulling " + this.targetClass + ", method is: Random. Finishing in: " + (this.currentClipLength - (Date.now() - this.currentClipStartTime)) / 1000, INFOX, INFOY + 70);

  },

  toggleClassifier: function(state) {
    // Ignore if there is no state change
    if(state == this.classify) return;

    this.classify = state == undefined ? !this.classify : state;
    emit("setclassifier", this.classify);
  },
  toggleSender: function(state) {
    // Ignore if there is no state change
    if(state == this.sending) return;

    this.sending = state == undefined ? (this.sending == 0 ? this.CLASSES : this.PLATEAUS) : state;
    emit("setsender", this.sending);
  },

  setWindow: function(window) {
    if (!window) window = 60;
    this.window = window;
    emit("updateWindow", this.window);
  },
  setConfidence: function(confidence) {
    this.confidence = confidence;
    emit("updateConfidence", this.confidence);
  },
  addPlateau: function(p) {
    console.log(
      "received a new plateau of class " +
      p.className +
      ". it'll be available after " +
      RECORDINGSECONDS +
      " seconds."
    );

    setTimeout(() => {
      //delay RECORDINGSECONDS so that plateau playback won't bleed into cache

      console.log("new plateau available: ");
      console.log(p);

      //for each plateau, record its start time relative to the show's start time, i.e., how many milli seconds after the show starts.
      let st = p.start - startTime > 0 ? p.start - startTime : 0;

      if (!this.plateaus.has(p.className)) {
        this.plateaus.set(p.className, [{
          start: st,
          length: p.end - p.start,
        }, ]); // if plateau of this class never exists, add one.
      } else {
        this.plateaus.get(p.className).push({
          start: st,
          length: p.end - p.start,
        }); // if plateau of this class already exists, add data to array.
      }
      // console.log(plateaus);
      // plateaus.push({ className: p.className, start: p.start - startTime, length: p.end - p.start }); //save plateaus with timestamps in relation to recording start time
    }, RECORDINGSECONDS * 1000);
  },
  updateClass : function(c) {
    if (modes[PLATEAU].currentClass != c) {
      modes[PLATEAU].haveNewClass = true;
      modes[PLATEAU].currentClass = c;
      console.log("got new class: " + c);
    }
  },
  recoverClass : function(c) {
    if (modes[PLATEAU].currentClass) {
      console.log("current class already exist: " + modes[PLATEAU].currentClass);
      return;
    }
    modes[PLATEAU].currentClass = c || "1-Front";
    console.log("got queried class: " + c);
  }
}

let bookmark = { //------------bookmark---------------------
  reset: function() {
    this.bookmarks = [undefined, undefined, undefined];
    this.idx = 0;
    this.str = "";
  },
  save: function(idx, ts) {
    console.log("saving bookmark " + idx)
    this.bookmarks[idx] = ts;
    this.updateStr();
  },
  updateStr: function() {
    this.str = "";
    this.bookmarks.forEach((bm) => {
      if (!bm) return;
      this.str += (nf(floor(bm / 1000 / 60), 2, 0) + ":" + nf(floor(bm / 1000 % 60), 2, 0) + "(" + bm + ")\t")
    });
  },
  run: function() {
    this.updateStr();
    text("Press Q, W, E to add/overwrite, press R, T, Y to jump.", INFOX, INFOY + 50);
  },
  set: function(idx) {  // this function seems obsolete
    // Set current bookmark
    this.idx = idx;
    this.idx = constrain(this.idx, 0, this.bookmarks.length - 1);
  },
  jump: function(idx) {
    let bmToJump = this.bookmarks[idx];
    if (!bmToJump) return;
    console.log("jump to: " + bmToJump);
    let bmInDelaySeconds = floor((Date.now() - startTime - bmToJump) / 1000 * CAMFPS);
    cue.set(bmInDelaySeconds);
  }
}

let other = {
  run: function() {
    text("Press P to play FLASHING video.", INFOX, INFOY + 50);
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
