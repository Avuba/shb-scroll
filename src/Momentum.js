import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';


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
    currentMomentum: null,
    currentFrame: null
  },

  state: {
    isActive: { x: false, y: false }
  }
};


let events = {
  pushBy: 'pushBy',
  start: 'start',
  startOnAxis: 'startOnAxis',
  stopOnAxis: 'stopOnAxis',
  stop: 'stop'
};


export default class Momentum {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._private.boundMomentum = this._runMomentum.bind(this);

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  startMomentum(momentum) {
    let wasActive = {
      x: this._state.isActive.x,
      y: this._state.isActive.y
    };

    // limit pixel per frame
    this._forXY((xy) => {
      if (momentum[xy].pxPerFrame > 0) {
        if (momentum[xy].pxPerFrame > this._config.maxPxPerFrame) momentum[xy].pxPerFrame = this._config.maxPxPerFrame;
        this._state.isActive[xy] = true;
      }
    });

    this._private.currentMomentum = momentum;

    cancelAnimationFrame(this._private.currentFrame);
    this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);

    this._forXY((xy) => {
      if (!wasActive[xy]) this.dispatchEvent(new Event(events.startOnAxis), { axis: xy });
    });

    if (!wasActive.x && !wasActive.y) this.dispatchEvent(new Event(events.start));
  }


  stopMomentum() {
    this._forXY((xy) => {
      this.stopMomentumOnAxis(xy);
    });
  }


  stopMomentumOnAxis(axis) {
    if (this._state.isActive[axis]) {
      this._private.currentMomentum[axis].direction = 0;
      this._private.currentMomentum[axis].pxPerFrame = 0;
      this._state.isActive[axis] = false;

      this.dispatchEvent(new Event(events.stopOnAxis), { axis: axis });

      if (!this._state.isActive.x && !this._state.isActive.y) {
        cancelAnimationFrame(this._private.currentFrame);
        this.dispatchEvent(new Event(events.stop));
      }
    }
  }


  // LIFECYCLE


  _runMomentum() {
    let pushBy = {
      x: { direction: 0, px: 0 },
      y: { direction: 0, px: 0 }
    };

    this._forXY((xy) => {
      // while the amount of momentum is meaningful on this axis, compose the pushBy event data
      // and decrease the momentum
      if (this._private.currentMomentum[xy].pxPerFrame >= this._config.minPxPerFrame) {
        pushBy[xy].direction = this._private.currentMomentum[xy].direction;
        pushBy[xy].px = this._private.currentMomentum[xy].pxPerFrame;

        // decrease pxPerFrame to decrease scroll speed
        this._private.currentMomentum[xy].pxPerFrame -= this._config.subtractMomentumPerFrame;
      }
      else {
        this.stopMomentumOnAxis(xy);
      }
    });

    if (!this._state.isActive.x && !this._state.isActive.y) {
      this.stopMomentum();
    }
    else {
      this.dispatchEvent(new Event(events.pushBy), pushBy);
      this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);
    }
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
