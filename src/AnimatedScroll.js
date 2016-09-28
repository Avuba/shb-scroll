import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';

let defaults = {
  config: {
    maxPxPerFrame: 50,
    minPxPerFrame: 0.2,
    slowingDistance: 150
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
  scrollTo: 'animatedScroll:scrollTo',
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


  // PUBLIC


  startAnimatedScroll(startPosition, targetPosition, scrollSpeed) {
    if (this._private.isActive) cancelAnimationFrame(this._private.currentFrame);

    console.log("starAnimScr target", targetPosition);
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
    console.log("direction", this._private.direction);

    // SET SPEED AND START ANIMATING

    this._private.maxPxPerFrame = scrollSpeed > 0 ? scrollSpeed : this._config.maxPxPerFrame;
    // set the current scrolling speed to the maximum speed; speed will decrease as the moveable
    // nears its target position
    this._private.pxPerFrame = this._private.maxPxPerFrame;
    this._private.isActive = true;

    this._private.currentFrame = requestAnimationFrame(this._private.boundAnimatedScroll);

    this.dispatchEvent(new Event(events.start));
    console.log("TUVA", this._private.targetPosition);
  }


  stopAnimatedScroll() {
    if (!this._private.isActive) return;

    this._private.pxPerFrame = 0;
    this._private.isActive = false;

    cancelAnimationFrame(this._private.currentFrame);
    this.dispatchEvent(new Event(events.stop));
  }


  // LIFECYCLE


  _bindAnimatedScroll() {
    this._private.boundAnimatedScroll = this._runAnimatedScroll.bind(this);
  }


  _runAnimatedScroll() {
    let distanceToTarget = this._getPositionDistance(this._private.currentPosition, this._private.targetPosition);
    console.log("dist, speed", distanceToTarget, this._private.pxPerFrame);

    // slow down when close to target
    if (distanceToTarget < this._config.slowingDistance) {
      this._private.pxPerFrame = this._private.maxPxPerFrame * (distanceToTarget/this._config.slowingDistance);
    }

    // stop when on target
    if (distanceToTarget < 1 || this._private.pxPerFrame < this._config.minScrollPxPerFrame) {
      this._private.currentPosition.x += this._private.targetPosition.x;
      this._private.currentPosition.y += this._private.targetPosition.y;

      this.dispatchEvent(new Event(events.scrollTo), this._private.targetPosition);

      this.stopAnimatedScroll();
    }
    // otherwise move towards target
    else {
      this._private.currentPosition.x += this._private.pxPerFrame * this._private.direction.x;
      this._private.currentPosition.y += this._private.pxPerFrame * this._private.direction.y;

      this.dispatchEvent(new Event(events.scrollTo), this._private.currentPosition);

      this._private.currentFrame = requestAnimationFrame(this._private.boundAnimatedScroll);
    }
  }


  // HELPERS


  _getPositionDistance(pos1, pos2) {
    return Math.sqrt( ((pos2.x - pos1.x) * (pos2.x - pos1.x)) + ((pos2.y - pos1.y) * (pos2.y - pos1.y)) );
  }
}
