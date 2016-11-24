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
  bouncePositionChange: 'bouncePositionChange',
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


  startOnAxis(axis, startPosition, targetPosition, animateTime) {
    cancelAnimationFrame(this._private.currentFrame);

    if (!this._state.isActive.x && !this._state.isActive.y) this.dispatchEvent(new Event(events.bounceStart));
    this._state.isActive[axis] = true;

    this.dispatchEvent(new Event(events.bounceStartOnAxis), { axis });

    this._private.startPosition[axis] = startPosition;
    this._private.currentPosition[axis] = startPosition;
    this._private.targetPosition[axis] = targetPosition;
    this._private.startTime[axis] = Date.now();
    this._private.animateTime[axis] = animateTime > 0 ? animateTime : this._config.bounceTime;

    this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
  }


  stop() {
    this._forXY((xy) => this._stopOnAxis(xy));
    cancelAnimationFrame(this._private.currentFrame);
    this.dispatchEvent(new Event(events.bounceEnd));
  }


  // PRIVATE


  _runBounce() {
    let shouldBounceEnd = { x: false, y: false };

    this._forXY((xy) => {
      if (this._state.isActive[xy]) {
        let timePassed = Date.now() - this._private.startTime[xy];

        // we test the passed time instead of the position as:
        // - exponential functions never really cross the target
        // - some ease functions will cross the axes (spring-like effect)
        if (timePassed < this._private.animateTime[xy]) {
          this._private.currentPosition[xy] = utils.easeOutCubic(
            timePassed,
            this._private.startPosition[xy],
            this._private.targetPosition[xy] - this._private.startPosition[xy],
            this._private.animateTime[xy]);
        }
        // snap to target and tell bounce to end
        else {
          this._private.currentPosition[xy] = this._private.targetPosition[xy];
          shouldBounceEnd[xy] = true;
        }
      }
    });

    // we have to fire bouncePositionChange even if the bounce has to stop on one axis to make sure
    // that this specific axis reaches the targetPosition
    this.dispatchEvent(new Event(events.bouncePositionChange), this._private.currentPosition);

    this._forXY((xy) => {
      if (shouldBounceEnd[xy]) this._stopOnAxis(xy)
    });

    if (this._state.isActive.x || this._state.isActive.y) {
      this._private.currentFrame = requestAnimationFrame(this._private.boundBounce);
    }
    else {
      this.stop();
    }
  }


  _stopOnAxis(axis) {
    if (!this._state.isActive[axis]) return;
    this._state.isActive[axis] = false;
    this.dispatchEvent(new Event(events.bounceEndOnAxis), { axis });
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }
}
