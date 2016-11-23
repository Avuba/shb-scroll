import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';


let defaults = {
  config: {
    axis: 'xy',
    bounceTime: 500
  },

  private: {
    axis: ['x', 'y'],
    startPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    animateTime: { x: 0, y: 0 },
    startTime: { x: 0, y: 0 }
  },

  state: {
    isActive: { x: false, y: false }
  }
};


let events = {
  bounceStart: 'bounceStart',
  bounceStartOnAxis: 'bounceStartOnAxis',
  bouncePush: 'bouncePush',
  bounceEnd: 'bounceEnd',
  bounceEndOnAxis: 'bounceEndOnAxis'
};


export default class Bounce {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._private.boundBounce = this._runBounce.bind(this);

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // PUBLIC


  startBounceOnAxis(axis, startPosition, targetPosition, animateTime) {
    cancelAnimationFrame(this._private.currentFrame);

    let isBounceStart = !this._state.isActive.x && !this._state.isActive.y;

    this._state.isActive[axis] = true;
    this._private.startPosition[axis] = startPosition;
    this._private.currentPosition[axis] = startPosition;
    this._private.targetPosition[axis] = targetPosition;
    this._private.startTime[axis] = Date.now();
    this._private.animateTime[axis] = animateTime > 0 ? animateTime : this._config.bounceTime;

    if (isBounceStart) this.dispatchEvent(new Event(events.bounceStart));
    this.dispatchEvent(new Event(events.bounceStartOnAxis), { axis: axis });

    this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
  }


  stop() {
    this._forXY((xy) => {
      if (this._state.isActive[xy]) {
        this._state.isActive[xy] = false;
        this.dispatchEvent(new Event(events.bounceEndOnAxis), { axis: xy });
      }
    });

    cancelAnimationFrame(this._private.currentFrame);
    this.dispatchEvent(new Event(events.bounceEnd));
  }


  // LIFECYCLE


  _runBounce() {
    this._forXY((xy) => {
      if (this._state.isActive[xy]) {
        let timePassed = Date.now() - this._private.startTime[xy];

        // CALCULATE NEW POSITION

        // we test how much time has passed and not the position. testing the position doesn't make
        // sense because:
        // a) exponential functions never really cross the axis;
        // b) some ease functions will cross the axes (spring-like effect).
        if (timePassed < this._private.animateTime[xy]) {
          this._private.currentPosition[xy] = utils.easeOutCubic(
            timePassed,
            this._private.startPosition[xy],
            this._private.targetPosition[xy] - this._private.startPosition[xy],
            this._private.animateTime[xy]);
        }
        // bounce stops on this axis: snap to target, un-flag bounce, dispatch event
        else {
          this._private.currentPosition[xy] = this._private.targetPosition[xy];
          this._state.isActive[xy] = false;

          this.dispatchEvent(new Event(events.bounceEndOnAxis), { axis: xy });
        }
      }
    });

    this.dispatchEvent(new Event(events.bouncePush), this._private.currentPosition);

    if (this._state.isActive.x || this._state.isActive.y) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
    }
    else {
      this.stop();
    }
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
