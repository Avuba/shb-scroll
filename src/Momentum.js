import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';


let defaults = {
  config: {
    // maximum speed that can be reached via momentum
    maxPxPerFrame: 35,

    // stop momentum if it drops beneath this spead
    minPxPerFrame: 0.5,

    // speed to be subtracted from pxPerFrame per frame when momentum is active
    subtractPxPerFrame: 0.2,

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
  momentumStart: 'momentumStart',
  momentumStartOnAxis: 'momentumStartOnAxis',
  momentumPush: 'momentumPush',
  momentumStop: 'momentumStop',
  momentumStopOnAxis: 'momentumStopOnAxis'
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


  start(momentum) {
    cancelAnimationFrame(this._private.currentFrame);

    if (!this._state.isActive.x && !this._state.isActive.y) this.dispatchEvent(new Event(events.momentumStart));
    this._private.currentMomentum = momentum;

    this._forXY((xy) => {
      if (momentum[xy].pxPerFrame > 0) {
        if (momentum[xy].pxPerFrame > this._config.maxPxPerFrame) {
          momentum[xy].pxPerFrame = this._config.maxPxPerFrame;
        }

        if (!this._state.isActive[xy]) {
          this._state.isActive[xy] = true;
          this.dispatchEvent(new Event(events.momentumStartOnAxis), { axis: xy });
        }
      }
    });

    this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);
  }


  stop() {
    this._forXY((xy) => this.stopOnAxis(xy));
  }


  stopOnAxis(axis) {
    if (!this._state.isActive[axis]) return;

    this._private.currentMomentum[axis].direction = 0;
    this._private.currentMomentum[axis].pxPerFrame = 0;
    this._state.isActive[axis] = false;

    this.dispatchEvent(new Event(events.momentumStopOnAxis), { axis });

    if (!this._state.isActive.x && !this._state.isActive.y) {
      cancelAnimationFrame(this._private.currentFrame);
      this.dispatchEvent(new Event(events.momentumStop));
    }
  }


  // PRIVATE


  _runMomentum() {
    let momentumPush = {
      x: { direction: 0, px: 0 },
      y: { direction: 0, px: 0 }
    };

    this._forXY((xy) => {
      if (this._private.currentMomentum[xy].pxPerFrame >= this._config.minPxPerFrame) {
        momentumPush[xy].direction = this._private.currentMomentum[xy].direction;
        momentumPush[xy].px = this._private.currentMomentum[xy].pxPerFrame;

        // decrease the speed with every frame
        this._private.currentMomentum[xy].pxPerFrame -= this._config.subtractPxPerFrame;
      }
      else {
        this.stopOnAxis(xy);
      }
    });

    if (!this._state.isActive.x && !this._state.isActive.y) {
      this.stop();
    }
    else {
      this.dispatchEvent(new Event(events.momentumPush), momentumPush);
      this._private.currentFrame = requestAnimationFrame(this._private.boundMomentum);
    }
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
