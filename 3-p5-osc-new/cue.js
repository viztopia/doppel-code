let cue = {
  fileIdx: -99,
  pfileIdx: undefined,
  cuePoint: 0,
  availableRecordingNum: 0,
  showDoppel: true,
  blackoutLeft: false,
  blackoutRight: false,
  fadeints: -1,
  toggleclassifier: 0,
  togglesendclass: 0,
  isPlayingSound: false,
  run: function () {

    //----------------------1. first we calculate how many cached/recorded content is available-----------
    this.availableRecordingNum = floor(recordedSeconds / RECORDINGSECONDS);
    let availableCACHESeconds = recordedSeconds > CACHELENGTH ? CACHELENGTH : recordedSeconds;
    text(this.availableRecordingNum + " recording clips and " + availableCACHESeconds + " seconds in TD cache available", INFOX, INFOY - 50);

    // Cue doppelganger in TD, only if there's a change
    if (abs(delayFrameIdx - pDelayFrameIdx) > 0) {
      this.update();
      pDelayFrameIdx = delayFrameIdx;
    }

    // Display current delay and file
    text("Delayed frame: " + delayFrameIdx + "      File: " + this.fileIdx + " cuePoint: " + this.cuePoint, INFOX, INFOY + 125);
    text("Doppel: " + (cue.showDoppel ? "On" : "Off") + "    Sound: " + (cue.isPlayingSound ? "On" : "Off"), INFOX, INFOY + 150);
    text("Blackout:" + (cue.blackoutLeft ? " Left" : "") + (cue.blackoutRight ? " Right" : ""), INFOX, INFOY + 175);
    text("Fadein: " + cue.fadeints, INFOX, INFOY + 200);
    text("Classify: " + cue.toggleclassifier + "      Send: " + cue.togglesendclass , INFOX, INFOY + 225);
  },
  update: function () {
    // Only update cue if something has changed
    // if (abs(delayFrameIdx - pdelayFrameIdx) <= 0) return;

    if (delayFrameIdx != undefined) {

      // If delay frame is within what is cached...
      if (delayFrameIdx <= CACHEFRAMES) {
        socket.emit("source", CACHE);
        this.fileIdx = -99;
        this.pfileIdx = this.fileIdx;
        cuePoint = 1 - delayFrameIdx / RECORDINGFRAMES;
        socket.emit("frameIdx", delayFrameIdx);

      } else {
        socket.emit("source", RECORDINGS);
        // let idxOfRecordingFromTD = floor((delayFrameIdx - CACHEFRAMES) / RECORDINGFRAMES)
        // this.fileIdx = this.availableRecordingNum - (idxOfRecordingFromTD + 1) ; // 1 bc number of recordings starts at 1 and TD file idx starts at 0
        // this.cuePoint = 1 - (delayFrameIdx - CACHEFRAMES - idxOfRecordingFromTD * RECORDINGFRAMES) / RECORDINGFRAMES;

        //new method of calculating file Idx and cue point
        let totalavailableFrames = (recordedSeconds - CACHELENGTH) * RECORDINGFPS + CACHEFRAMES;

        let recordingStartFrame = totalavailableFrames - delayFrameIdx;
        this.fileIdx = floor(recordingStartFrame / RECORDINGFRAMES);
        if(this.fileIdx < 0){
          console.log("fileIdx < 0!");
          console.log(recordedSeconds, totalavailableFrames, recordingStartFrame, RECORDINGFRAMES);
          this.fileIdx = 0; //fixed issues when plateau pStartTime ==0;
        }
        this.cuePoint = constrain(recordingStartFrame % RECORDINGFRAMES / RECORDINGFRAMES, 0, 0.98);

        let pulseDelay = 0;
        if (this.fileIdx != this.pfileIdx) {
          socket.emit("fileIdx", this.fileIdx);
          pulseDelay = PULSEDELAY;
          this.pfileIdx = this.fileIdx;
          // socket.emit("cuePulse", 1);
          // setTimeout(() => { socket.emit("cuePulse", 0); }, 20);
        }
        socket.emit("cuePoint", this.cuePoint); //updated TD to pulse after cuepoint update
        // socket.emit("cuePulse", 1);
        // setTimeout(() => { socket.emit("cuePulse", 1); }, pulseDelay);
        // TODO: Turn off pulse
      }
    } else {
      text("No available delay frames yet. Showing TD current frame", INFOX, INFOY + 125);
      socket.emit("source", CACHE);
      socket.emit("frameIdx", 0);
    }
  }
}
