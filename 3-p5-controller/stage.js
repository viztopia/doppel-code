let stage = {
  reset: function() {
    this.showDoppel = true;
    this.blackoutLeft = true;
    this.blackoutRight = true;
    this.fadeints = undefined;
    this.emit();
  },
  emit: function() {
    // Send state to TD
    emit("showdoppel", this.showDoppel);
    emit("blackoutleft", this.blackoutLeft);
    emit("blackoutright", this.blackoutRight);
  },
  toggleDoppel: function() {
    this.showDoppel = !this.showDoppel;
    emit("showdoppel", this.showDoppel);
  },
  toggleBlackoutLeft: function() {
    this.blackoutLeft = !this.blackoutLeft;
    emit("blackoutleft", this.blackoutLeft);
  },
  toggleBlackoutRight: function() {
    this.blackoutRight = !this.blackoutRight;
    emit("blackoutright", this.blackoutRight);
  },
  setBlackoutAll: function(state) {
    this.blackoutLeft = state;
    this.blackoutRight = state;
    emit("blackoutleft", this.blackoutLeft);
    emit("blackoutright", this.blackoutRight);
  },
  fadeInLeft: function() {
    this.fadeints = Date.now();
    this.blackoutLeft = false;
    emit("fadeinleft");
  },
  playVideo: function() {
    emit("source", VIDEO);
  },
  display: function stage() {
    // Display current delay and file
    text("Delayed frame: " + floor(cue.delayFrameIdx) + "      File: " + cue.fileIdx + " cuePoint: " + nfs(cue.cuePoint, 0, 2), INFOX, INFOY + 125);
    text("Doppel (A): " + (this.showDoppel ? "On" : "Off"), INFOX, INFOY + 150);
    let timeElapsed = this.fadeints ? constrain(floor(this.fadeints - Date.now()/1000), 0, 30) : 0;
    text("Blackout (S,D,F,G): " + (this.blackoutLeft ? " Left" : "") + (this.blackoutRight ? " Right" : "" + "\t\Fade: " + timeElapsed), INFOX, INFOY + 175);
    text("Bookmarks (4): " + modes[BOOKMARK].str, INFOX, INFOY + 200);
    text("Classify (J): " + (modes[PLATEAU].classify ? "On" : "Off") + "\t\tSend (K): " + (modes[PLATEAU].sending == modes[PLATEAU].CLASSES ? "Plateaus" : "Classes" + "\t\tWindow: "), INFOX, INFOY + 225);
  }
}
