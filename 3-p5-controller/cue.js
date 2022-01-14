// Manages playback of cache and recorded video in TD
let cue = {
  reset: function() {
    this.delayFrameIdx = 0;
    this.pDelayFrameIdx = 0;
    this.currentDelayFrameIdx = 0;
    this.fileIdx = -99;
    this.pfileIdx = undefined;
    this.cuePoint = 0;
    this.availableRecordingNum = 0;
  },
  run: function () {

    //----------------------1. first we calculate how many cached/recorded content is available-----------
    this.availableRecordingNum = floor(recordedSeconds / RECORDINGSECONDS);
    let availableCACHESeconds = recordedSeconds > CACHELENGTH ? CACHELENGTH : recordedSeconds;
    text(this.availableRecordingNum + " recording clips and " + availableCACHESeconds + " seconds in TD cache available", INFOX, INFOY - 50);

    // Cue doppelganger in TD, only if there's a change
    if (abs(this.delayFrameIdx - this.pDelayFrameIdx) > 0) {
      this.update();
      this.pDelayFrameIdx = this.delayFrameIdx;
    }
  },
  set: function(seconds) {
    this.delayFrameIdx = seconds * CAMFPS;
  },
  ease: function(seconds) {
      let target = seconds * RECORDINGFPS;
      let diff = cue.delayFrameIdx - target;
      this.currentDelayFrameIdx += diff/10;
      cue.delayFrameIdx = this.currentDelayFrameIdx;
      this.pIdx = this.idx;
  },
  update: function () {
    // Only update cue if something has changed
    // if (abs(delayFrameIdx - pdelayFrameIdx) <= 0) return;

    if (this.delayFrameIdx != undefined) {

      // If delay frame is within what is cached...
      if (this.delayFrameIdx <= CACHEFRAMES) {
        emit("source", CACHE);
        this.fileIdx = -99;
        this.pfileIdx = this.fileIdx;
        this.cuePoint = 1 - this.delayFrameIdx / RECORDINGFRAMES;
        emit("frameIdx", this.delayFrameIdx);

      } else {
        emit("source", RECORDINGS);
        // let idxOfRecordingFromTD = floor((delayFrameIdx - CACHEFRAMES) / RECORDINGFRAMES)
        // this.fileIdx = this.availableRecordingNum - (idxOfRecordingFromTD + 1) ; // 1 bc number of recordings starts at 1 and TD file idx starts at 0
        // this.cuePoint = 1 - (delayFrameIdx - CACHEFRAMES - idxOfRecordingFromTD * RECORDINGFRAMES) / RECORDINGFRAMES;

        //new method of calculating file Idx and cue point
        let totalavailableFrames = (recordedSeconds - CACHELENGTH) * RECORDINGFPS + CACHEFRAMES;

        let recordingStartFrame = totalavailableFrames - this.delayFrameIdx;
        this.fileIdx = floor(recordingStartFrame / RECORDINGFRAMES);
        if(this.fileIdx < 0){
          console.log("fileIdx < 0!");
          console.log(recordedSeconds, totalavailableFrames, recordingStartFrame, RECORDINGFRAMES);
          this.fileIdx = 0; //fixed issues when plateau pStartTime ==0;
        }
        this.cuePoint = constrain(recordingStartFrame % RECORDINGFRAMES / RECORDINGFRAMES, 0, 0.98);

        let pulseDelay = 0;
        if (this.fileIdx != this.pfileIdx) {
          emit("fileIdx", this.fileIdx);
          pulseDelay = PULSEDELAY;
          this.pfileIdx = this.fileIdx;
        }
        emit("cuePoint", this.cuePoint); //updated TD to pulse after cuepoint update
      }
    } else {
      text("No available delay frames yet. Showing TD current frame", INFOX, INFOY + 125);
      emit("source", CACHE);
      emit("frameIdx", 0);
    }
  },
}
