let stage = {
  reset: function () {
    this.showDoppel = true;
    this.blackoutLeft = true;
    this.blackoutRight = true;
    this.fadeints = undefined;
    this.dmx = {};
    this.emit();
  },
  emit: function () {
    // Send state to TD
    emit("showdoppel", this.showDoppel);
    emit("blackoutleft", this.blackoutLeft);
    emit("blackoutright", this.blackoutRight);
    this.setDMX(this.dmx);
  },
  toggleDoppel: function () {
    this.showDoppel = !this.showDoppel;
    emit("showdoppel", this.showDoppel);
  },
  toggleBlackoutLeft: function () {
    this.blackoutLeft = !this.blackoutLeft;
    emit("blackoutleft", this.blackoutLeft);
  },
  toggleBlackoutRight: function () {
    this.blackoutRight = !this.blackoutRight;
    emit("blackoutright", this.blackoutRight);
  },
  setBlackoutAll: function (state) {
    this.blackoutLeft = state;
    this.blackoutRight = state;
    emit("blackoutleft", this.blackoutLeft);
    emit("blackoutright", this.blackoutRight);
  },
  fadeInLeft: function () {
    this.fadeints = Date.now();
    this.blackoutLeft = false;
    emit("fadeinleft");
  },
  setDMX: function (preset) {
    // 1. compare the current level of each channel to the preset target's level
    // 2. calculate the increment for each channel to reach the target's level at the given interval and duration
    // 3. this is linear fading. not sure if we avoid do easing for DMX bc of potential flooding issue, need to test out
    this.dmx = preset;
    for (const lightID in this.dmx) {
      let target = this.dmx[lightID];
      emit("DMX", { channel: target.channel, value: target.level, duration: target.duration })


      // console.log(current, target);
      // console.log(target.duration);

      // let diff = target.level - current.level;
      // // if (diff != 0){
      // // }
      // if (target.duration == 0 ) {
      //   current.increment = diff; //didn't floor the increment here just yet
      // } else {
      //   current.increment = diff / (target.duration * 1000 / interval); //didn't floor the increment here just yet
      // }

      // console.log(current.increment);
      // //if there's a fading happening at the moment, clear it
      // if (current.fading) clearInterval(current.fading);

      // current.fading = setInterval(() => {
      //   current.level += current.increment;
      //   current.level = constrain(current.level, 0, 255);

      //   emit("DMX", {channel:target.channel, value:floor(current.level)}) //only floor the level when emiting to preserve its maximum accuracy while increment is not an integer
      //   if (abs(target.level - current.level) <= 1) {
      //     clearInterval(current.fading);
      //     current.level = target.level //force saving target level to current, so the next DMX cue can be triggered
      //   }

      // }, interval);
    }
  },
  playVideo: function () {
    emit("source", VIDEO);
  },
  display: function stage() {
    // Display current delay and file
    text("Delayed frame: " + floor(cue.delayFrameIdx) + "      File: " + cue.fileIdx + " cuePoint: " + nfs(cue.cuePoint, 0, 2), INFOX, INFOY + 125);
    text("Doppel (A): " + (this.showDoppel ? "On" : "Off"), INFOX, INFOY + 150);
    let timeElapsed = this.fadeints ? constrain(floor(this.fadeints - Date.now() / 1000), 0, 30) : 0;
    text("Blackout (S,D,F,G): " + (this.blackoutLeft ? " Left" : "") + (this.blackoutRight ? " Right" : "" + "\t\Fade: " + timeElapsed) + "\t\tSetup(,) JokeFade(.) JokeCut(/) Cut(;)", INFOX, INFOY + 175);
    text("Bookmarks (4): " + modes[BOOKMARK].str, INFOX, INFOY + 200);
    text("Classify (J): " + (modes[PLATEAU].classify ? "On" : "Off") + "\t\tSend (K): " + (modes[PLATEAU].sending == modes[PLATEAU].CLASSES ? "Plateaus" : "Classes" + "\t\tWindow (N): " + modes[PLATEAU].window + "\t\tConfidence (B): " + modes[PLATEAU].confidence), INFOX, INFOY + 225);
  }
}
