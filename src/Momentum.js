import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


let defaults = {
  config: {
    // maximum speed that can be reached via momentum
    maxPxPerFrame: 35,

    // stop momentum if it drops beneath this spead
    minPxPerFrame: 0.5,

    // speed to be subtracted from pxPerFrame per frame when momentum is active
    subtractMomentumPerFrame: 0.2,

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'xy'
  },

  private: {
    axis: ['x', 'y'],
    isActive: { x: false, y: false },
    currentMomentum: null,
    currentFrame: null
  }
};


let events = {
  pushBy: 'momentum:pushBy',
  start: 'momentum:start',
  startOnAxis: 'momentum:startOnAxis',
  stopOnAxis: 'momentum:stopOnAxis',
  stop: 'momentum:stop'
};


export default class Momentum {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._bindMomentum();

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  startMomentum(momentum) {
    let wasActive = {
      x: this._private.isActive.x,
      y: this._private.isActive.y
    };

    // limit pixel per frame
    this._forXY((xy) => {
      if (momentum[xy].pxPerFrame > 0) {
        if (momentum[xy].pxPerFrame > this._config.maxPxPerFrame) momentum[xy].pxPerFrame = this._config.maxPxPerFrame;
        this._private.isActive[xy] = true;
      }
    });

    this._private.currentMomentum = momentum;

    cancelAnimationFrame(this._private.currentFrame);
    this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);

    this._forXY((xy) => {
      if (!wasActive[xy]) {
        console.log("Momentum started on", xy);
        this.dispatchEvent(new Event(events.startOnAxis), { axis: xy });
      }
    });

    if (!wasActive.x && !wasActive.y) {
      console.log("Momentum started");
      this.dispatchEvent(new Event(events.start));
    }
  }


  stopMomentum() {
    this._forXY((xy) => {
      this.stopMomentumOnAxis(xy);
    });
  }


  stopMomentumOnAxis(axis) {
    if (this._private.isActive[axis]) {
      this._private.currentMomentum[axis].direction = 0;
      this._private.currentMomentum[axis].pxPerFrame = 0;
      this._private.isActive[axis] = false;

      console.log("Momentum stopped on ", axis);
      this.dispatchEvent(new Event(events.stopOnAxis), { axis: axis });

      if (!this._private.isActive.x && !this._private.isActive.y) {
        cancelAnimationFrame(this._private.currentFrame);
        console.log("Momentum stopped (from onAxis)");
        this.dispatchEvent(new Event(events.stop));
      }
    }
  }


  // LIFECYCLE


  _bindMomentum() {
    this._private.boundMomentum = this._runMomentum.bind(this);
  }


  _runMomentum() {
    let pushBy = {
        x: { direction: 0, px: 0 },
        y: { direction: 0, px: 0 }
      };

    this._forXY((xy) => {
      if (!this._private.isActive.x && !this._private.isActive.y) return; {
        if (this._private.currentMomentum[xy].pxPerFrame >= this._config.minPxPerFrame) {
          pushBy[xy].direction = this._private.currentMomentum[xy].direction;
          pushBy[xy].px = this._private.currentMomentum[xy].pxPerFrame;

          // decrease pxPerFrame to decrease scroll speed
          this._private.currentMomentum[xy].pxPerFrame -= this._config.subtractMomentumPerFrame;
        }
        else {
          this.stopMomentumOnAxis(xy);
        }
      }
    });

    if (!this._private.isActive.x && !this._private.isActive.y) {
      this.stopMomentum();
    } else {
      this.dispatchEvent(new Event(events.pushBy), pushBy);
      this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);
    }
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
