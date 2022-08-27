// Manages playback of cache and recorded video in TD
let cue = {
  reset: function() {
    this.source = CACHE;
    this.delayFrameIdx = 0;
    this.pDelayFrameIdx = 0;
    this.intermediateDelayFrameIdx = 0;
    this.fileIdx = -99;
    this.pfileIdx = undefined;
    this.cuePoint = 0;
    this.availableRecordingNum = 0;
    this.easing = undefined;
  },
  run: function() {

    //----------------------1. first we calculate how many cached/recorded content is available-----------
    this.availableRecordingNum = floor(recordedSeconds / RECORDINGSECONDS);
    let availableCACHESeconds = recordedSeconds > CACHELENGTH ? CACHELENGTH : recordedSeconds;
    text(this.availableRecordingNum + " recording clips and " + availableCACHESeconds + " seconds in TD cache available", INFOX, INFOY - 50);
  },
  set: function(seconds) {
    this.setFrames(seconds * CAMFPS);
  },

  setFrames: function(frames) {
    // Ignore if there has been no change

    if (floor(frames) == this.delayFrameIdx) return;


    this.pDelayFrameIdx = this.delayFrameIdx;
    this.delayFrameIdx = floor(frames);
    this.update();
    this.emit();
  },

  ease: function(seconds) {

    // if there's an easing happening at the moment, clear it
    if (this.easing) clearInterval(this.easing);

    // Calculate target
    let target = seconds * RECORDINGFPS;
    // Where am I now?
    let intermediateDelayFrameIdx = this.delayFrameIdx;

    console.log(intermediateDelayFrameIdx, target);

    // Calculate distance
    let diff = this.delayFrameIdx - target
    // Keep easying towards target
    this.easing = setInterval(() => {
      diff = target - intermediateDelayFrameIdx;
      intermediateDelayFrameIdx += (diff * 0.05);

      // Set the new delayFrameIdx
      cue.setFrames(intermediateDelayFrameIdx);
      if (abs(diff) <= 1) clearInterval(this.easing);
    }, 50);
  },
  update: function() {

    if (this.delayFrameIdx == undefined) {
      text("No available delay frames yet. Showing TD current frame", INFOX, INFOY + 125);
      this.source = CACHE;
      this.delayFrameIdx = 0;
    } else {
      // If delay frame is within what is cached...
      if (this.delayFrameIdx <= CACHEFRAMES) {
        // console.log("SENDING IT OUT");
        this.source = CACHE;
        this.fileIdx = -99;
        this.pfileIdx = this.fileIdx;
        this.cuePoint = 1 - this.delayFrameIdx / RECORDINGFRAMES;
      } else {
        this.source = RECORDINGS;

        //new method of calculating file Idx and cue point
        let totalavailableFrames = (recordedSeconds - CACHELENGTH) * RECORDINGFPS + CACHEFRAMES;

        let recordingStartFrame = totalavailableFrames - this.delayFrameIdx;
        this.fileIdx = floor(recordingStartFrame / RECORDINGFRAMES);
        if (this.fileIdx < 0) {
          console.log("fileIdx < 0!");
          console.log(recordedSeconds, totalavailableFrames, recordingStartFrame, RECORDINGFRAMES);
          this.fileIdx = 0; //fixed issues when plateau pStartTime ==0;
        }
        this.cuePoint = constrain(recordingStartFrame % RECORDINGFRAMES / RECORDINGFRAMES, 0, 0.98);

        if (this.fileIdx != this.pfileIdx) {
          this.fileChanged = true;
          this.pfileIdx = this.fileIdx;
        }
      }
    }
  },
  emit: function() {
    emit("source", this.source);
    switch (this.source) {
      case CACHE:
        emit("frameIdx", this.delayFrameIdx);
      break;
      case RECORDINGS:
        if(this.fileChanged) emit("fileIdx", this.fileIdx);
        emit("cuePoint", this.cuePoint);
      break;
    }
  }
}
