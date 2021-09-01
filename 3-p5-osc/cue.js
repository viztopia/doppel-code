let cue = {
  fileIdx: undefined,
  pfileIdx: undefined,
  cuePoint: undefined,
  run: function() {

    //----------------------1. first we calculate how many cached/recorded content is available-----------
    let availableRecordingNum = floor(recordedSeconds / RECORDINGSECONDS);
    let availableCACHESeconds = recordedSeconds > CACHELENGTH ? CACHELENGTH : recordedSeconds;
    text(availableRecordingNum + " recording clips and " + availableCACHESeconds + " seconds in TD cache available", INFOX, INFOY - 50);

    // Display current delay and file
    text("Delayed frame:" + delayFrameIdx, INFOX, INFOY + 125);
    text("File:" + fileIdx + " cuePoint: " + cuePoint, INFOX, INFOY + 150);
  },
  update: function() {
    // Only update cue if something has changed
    if (abs(delayFrameIdx - pdelayFrameIdx) <= 0) return;

    // If delay frame is within what is cached...
    if (delayFrameIdx <= CACHEFRAMES) {
      socket.emit("source", CACHE); //source 1: load frame from TD cache memory
      this.fileIdx = -99;
      cuePoint = 1 - delayFrameIdx / RECORDINGFRAMES;
      socket.emit("frameIdx", delayFrameIdx);

    } else if(availableRecordingNum > 2) {
      socket.emit("source", RECORDINGS); //mode 0: load frame from recordings
      let idxOfRecordingFromTD = floor((delayFrameIdx - CACHEFRAMES) / RECORDINGFRAMES)
      this.fileIdx = availableRecordingNum - (idxOfRecordingFromTD + 1) + 2; // 2 is the offset for getting the correct recording file name idx in Windows. May need a different value for Mac.
      cuePoint = 1 - (delayFrameIdx - CACHEFRAMES - idxOfRecordingFromTD * RECORDINGFRAMES) / RECORDINGFRAMES;
      let pulseDelay = 0;
      if(this.fileIdx != this.pfileIdx) {
        socket.emit("fileIdx", this.fileIdx);
        pulseDelay = PULSEDELAY;
      }
      socket.emit("cuePoint", cuePoint);
      setTimeout(()=>{socket.emit("cuePulse", 1);}, pulseDelay);
      // TODO: Turn off pulse

    } else {
      text("No available delay frames yet. Showing TD current frame", INFOX, INFOY + 125);
      socket.emit("source", CACHE); //mode 1: load frame from TD cache memory
      socket.emit("frameIdx", 0);
    }
  }
}

//-----------------To-do: video mode--------------------
//1. tell pose estimation & classification sketch to scrub to a specific time
//2. tell TD to srub movie file in to a specific time
//3. scrubbing method: TBD
