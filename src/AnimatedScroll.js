import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';

let defaults = {
  config: {
    maxPxPerFrame: 20
  },

  private: {
    isActive: false,
    startPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    totalDistance: 0,
    pxPerFrame: 0,
    maxPxPerFrame: 0,
    direction: {
      radians: 0,
      x: 0,         // component weight in x, effectively cos(radians)
      y: 0          // component weight in y, effectively sin(radians)
    }
  }
};

let events = {
  start: 'animatedScroll:start',
  pushBy: 'animatedScroll:pushBy',
  stop: 'animatedScroll:stop'
};

export default class AnimatedScroll {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._bindAnimatedScroll();

    this.events = events;
    utils.addEventTargetInterface(this);
  }


  // LIFECYCLE


  _bindAnimatedScroll() {
    this._private.boundAnimatedScroll = this._runAnimatedScroll.bind(this);
  }


  _startAnimatedScroll(startPosition, targetPosition, scrollSpeed) {
    if (this._private.isActive) cancelAnimationFrame(this._private.currentFrame);

    this._private.isActive = true;

    // SET STARTING POSITION AND TARGET

    this._private.startPosition = {
      x: startPosition.x,
      y: startPosition.y
    };

    this._private.currentPosition = {
      x: startPosition.x,
      y: startPosition.y
    };

    this._private.targetPosition = {
      x: targetPosition.x,
      y: targetPosition.y
    };

    this._private.totalDistance = this._getPositionDistance(
      this._private.startPosition,
      this._private.targetPosition
    );

    // CALCULATE SCROLL DIRECTION

    let distance = {
      x: this._private.targetPosition.x - this._private.startPosition.x,
      y: this._private.targetPosition.y - this._private.startPosition.y
    };

    this._private.direction.radians = Math.atan2(distance.y, distance.x);
    this._private.direction.x = Math.cos(this._private.direction.radians);
    this._private.direction.y = Math.sin(this._private.direction.radians);

    // SET SPEED AND START ANIMATING

    this._private.maxPxPerFrame = scrollSpeed > 0 ? scrollSpeed : this._config.maxPxPerFrame;
    // set the current scrolling speed to the maximum speed; speed will decrease as the moveable
    // nears its target position
    animatedScroll.pxPerFrame = animatedScroll.maxPxPerFrame;
    animatedScroll.isAnimatedScrolling = true;

    this._private.currentFrame = requestAnimationFrame(this._private.boundAnimatedScroll);
  }


  _runAnimatedScroll() {
    let animatedScroll = this._private.animatedScroll,
      distanceToTarget = this._getPositionDistance(this._private.position, animatedScroll.targetPosition);

    // slow down when close to target
    if (distanceToTarget < this._config.scrollToSlowingDistance) {
      animatedScroll.pxPerFrame = animatedScroll.maxPxPerFrame * (distanceToTarget/this._config.scrollToSlowingDistance);
    }

    // stop when on target
    if (distanceToTarget < 1 || animatedScroll.pxPerFrame < this._config.minScrollPxPerFrame) {
        this._stopAnimatedScroll();
        this._setWegbierPosition(animatedScroll.targetPosition);
    }
    // otherwise move towards target
    else {
      this._forXY((xy) => {
        this._private.position[xy] += animatedScroll.pxPerFrame * animatedScroll.direction[xy];
      });
      this._setWegbierPosition(this._private.position);

      this._private.currentFrame = requestAnimationFrame(this._private.boundAnimatedScroll);
    }
  }


  _stopAnimatedScroll() {
    let animatedScroll = this._private.animatedScroll;

    animatedScroll.pxPerFrame = 0;
    animatedScroll.isAnimatedScrolling = false;

    cancelAnimationFrame(this._private.currentFrame);
  }
}
