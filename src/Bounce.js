import { default as utils } from './utils/utils';
import { default as ease } from './utils/ease';
import { default as lodash } from './utils/lodash';


let defaults = {
  config: {
    axis: 'xy',
    animateTime: 500,
    easeAlg: 'easeOutCubic'
  },

  private: {
    axis: ['x', 'y'],
    startPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    animateTime: { x: 0, y: 0 },
    startTime: { x: 0, y: 0 },
    easeAlg: { x: null, y: null }
  },

  state: {
    isActive: { x: false, y: false }
  }
};


let events = {
  animateStart: 'animateStart',
  animateStartOnAxis: 'animateStartOnAxis',
  animatePositionChange: 'animatePositionChange',
  animateEnd: 'animateEnd',
  animateEndOnAxis: 'animateEndOnAxis'
};


export default class Bounce {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._private.boundRunAnimate = this._runAnimate.bind(this);

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  startOnAxis(axis, startPosition, targetPosition, animateTime, easeAlg) {
    if (!this._private.axis.includes(axis)) return;

    cancelAnimationFrame(this._private.currentFrame);

    if (!this._state.isActive.x && !this._state.isActive.y) this.dispatchEvent(new Event(events.animateStart));
    this._state.isActive[axis] = true;

    this.dispatchEvent(new Event(events.animateStartOnAxis), { axis });

    this._private.startPosition[axis] = startPosition;
    this._private.currentPosition[axis] = startPosition;
    this._private.targetPosition[axis] = targetPosition;
    this._private.startTime[axis] = Date.now();

    this._private.animateTime[axis] = animateTime > 0 ? animateTime : this._config.animateTime;
    this._private.easeAlg[axis] = easeAlg && ease[easeAlg] ? ease[easeAlg] : ease[this._config.easeAlg];

    this._private.currentFrame = requestAnimationFrame(this._private.boundRunAnimate);
  }


  stop() {
    this._forXY((xy) => this.stopOnAxis(xy));
  }


  stopOnAxis(axis) {
    if (!this._state.isActive[axis]) return;

    this._state.isActive[axis] = false;
    this.dispatchEvent(new Event(events.animateEndOnAxis), { axis });

    if (!this._state.isActive.x && !this._state.isActive.y) {
      this.dispatchEvent(new Event(events.animateEnd));
      cancelAnimationFrame(this._private.currentFrame);
    }
  }


  // PRIVATE


  _runAnimate() {
    let shouldAnimateEnd = { x: false, y: false };

    this._forXY((xy) => {
      if (this._state.isActive[xy]) {
        let timePassed = Date.now() - this._private.startTime[xy];

        // continue if time has not run out and the target position hasn't been reached
        if (timePassed < this._private.animateTime[xy]
            && Math.abs(this._private.targetPosition[xy] - this._private.currentPosition[xy]) > 0.5) {
          this._private.currentPosition[xy] = this._private.easeAlg[xy](
            timePassed,
            this._private.startPosition[xy],
            this._private.targetPosition[xy] - this._private.startPosition[xy],
            this._private.animateTime[xy]);
        }
        // snap to target and tell bounce to end otherise
        else {
          this._private.currentPosition[xy] = this._private.targetPosition[xy];
          shouldAnimateEnd[xy] = true;
        }
      }
    });

    // we have to fire animatePositionChange even if the bounce has to stop on one axis to make sure
    // that this specific axis reaches the targetPosition
    this.dispatchEvent(new Event(events.animatePositionChange), this._private.currentPosition);

    // only after firing the event we check what bounces to stop
    this._forXY((xy) => {
      if (shouldAnimateEnd[xy]) this.stopOnAxis(xy)
    });

    if (this._state.isActive.x || this._state.isActive.y) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundRunAnimate);
    }
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
