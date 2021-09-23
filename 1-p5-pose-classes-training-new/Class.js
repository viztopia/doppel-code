class Class {
  constructor(label, el) {
    this.label = label;
    this.el = el;
    this.el.id = label;
    this.interval = null;

    // Set id of element
    this.record = this.el.getElementsByClassName('record')[0];
    this.record.textContent = this.label;

    this.on = false;

    // Race condition with mouseup event
    setTimeout(() => {
      this.record.onmouseup = () => {
        this.on = !this.on;
        console.log((this.on ? 'RECORD! ' : 'STOP! ') + this.label);
        if (this.on) {
          this.interval = setInterval(() => {
            addExample(this.label);
          }, rate)
        } else {
          clearInterval(this.interval);
        }
      }
    }, 1000);

    // Reset button
    this.reset = this.el.getElementsByClassName('reset')[0];
    this.reset.onmouseup = () => {
      clearLabel(this.label);
    };

    // Update
    this.confidence = this.el.getElementsByClassName('confidence')[0];
  }


  updateDuration(change) {
    this.duration += change;
  }

  count(count) {
    this.record.textContent = this.label + ': ' + (count || 0);
  }

  score(confidence) {
    this.confidence.textContent = confidence || 0;
  }

  reset() {

  }



}
