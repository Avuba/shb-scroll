import { default as Wegbier } from '../node_modules/wegbier/dist/Wegbier.js';
import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


let defaults = {
  config: {
    // main container for defining the boundaries of the scrollable area and
    // setting the event listeners. is expected to be a simple DOM node
    container: null,

    // TODO remove, the scrollable should be a list of items
    moveable: null,

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'y',

    // lock movement in one direction. relevant if more touch/scroll libraries
    // are at the same spot and only the locked element should move
    lock: false,

    // speed for animated scrolling, in px/frame
    maxScrollToSpeed: 50,

    // the distance in px from the target position, at which animated scroll starts slowing down
    scrollToSlowingDistance: 300
  },

  private: {
    wegbier: null,
    boundHandlers: {},
    axis: ['x', 'y'],
    position: { x: 0, y: 0 },
    positionLimits: { x: 0, y: 0},
    isScrollLocked: false,

    animatedScroll: {
      isScrolling: false,
      speed: 0,
      direction: {
        radians: 0,
        x: 0,         // component weight in x, effectively cos(radians)
        y: 0          // component weight in y, effectively sin(radians)
      },
      startingPos: { x: 0, y: 0 },
      targetPos: { x: 0, y: 0 },
      totalDistance: 0
    }
  }
};


export default class Mustafas {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this._calculatePositionLimits();

    // it's bad manners to modify the "moveable" property of the config passed as parameter to the
    // constructor, so we clone a separate config object and modify that one instead
    let configWegbier = fUtils.cloneDeep(defaults.config);
    if (config) fUtils.mergeDeep(configWegbier, this._config);
    configWegbier.moveable = this._getMoveableSize();

    this._private.wegbier = new Wegbier(configWegbier);

    this._bindEvents();
    this._bindAnimatedScroll();
  }


  // PUBLIC


  resize() {
    this._calculatePositionLimits();

    let configWegbier = {
      moveable: this._getMoveableSize()
    }
    this._private.wegbier.refresh(configWegbier);
  }


  getScrollPosition() {
    return { left: this._private.position.x, top: this._private.position.y };
  }


  scrollTo(left, top, shouldAnimate) {
    if (this._private.isScrollLocked) return;

    if (this._private.animatedScroll.isScrolling) {
      this._stopAnimatedScroll();
    }

    if (shouldAnimate) {
      this._startAnimatedScroll( { x: left, y: top } );
    }
    else {
      this._private.wegbier.scrollTo({x: left, y: top});
    }
  }


  scrollBy(left, top, shouldAnimate) {
    this._scrollTo(this._private.position.x +left, this._private.position.x +top, shouldAnimate);
  }


  scrollTop(shouldAnimate) {
    this.scrollTo(this._private.position.x, 0, shouldAnimate);
  }


  scrollBottom(shouldAnimate) {
    this.scrollTo(this._private.position.x, this._private.positionLimits.y, shouldAnimate);
  }


  // freezes the scroll on all axes, returns the resulting state of frozen-ness (boolean)
  freezeScroll(shouldFreeze) {
    let scrollLocked = shouldFreeze ? true : false;

    if (shouldFreeze && this._private.animatedScroll.isScrolling) {
      this._stopAnimatedScroll();
    }

    // while the scroll is locked, mustafas doesn't update its coordinates (or the DOM node).
    // when unlocking, it uses its old coordinates to restore the wegbier's position.
    if (this._private.isScrollLocked && !scrollLocked) {
      this._private.wegbier.scrollTo(this._private.position);
    }

    this._private.isScrollLocked = scrollLocked;
    return this._private.isScrollLocked;
  }


  destroy() {
    this._unbindEvents();
    this._private.wegbier.destroy();
    this._config.container = null;
    this._config.moveable = null;
  };


  // LIFECYCLE


  _calculatePositionLimits() {
    let positionLimits = {
      x: this._config.moveable.clientWidth - this._config.container.clientWidth,
      y: this._config.moveable.clientHeight - this._config.container.clientHeight
    }

    // only set limits for the axis we use, and on which the moveable is larger than the container
    this._forXY((xy) => {
      if (positionLimits[xy] > 0)
        this._private.positionLimits[xy] = -positionLimits[xy];
    });
  }


  _getMoveableSize() {
    return {
      width: this._config.moveable.clientWidth,
      height: this._config.moveable.clientHeight
    };
  }


  _bindEvents() {
    this._private.boundHandlers = {
      'wegbier:positionChanged': this._onPositionChanged.bind(this)
    };

    fUtils.forEach(this._private.boundHandlers, (handler, event) => {
      this._private.wegbier.addEventListener(event, handler);
    });
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundHandlers, (handler, event) => {
      this._private.wegbier.removeEventListener(event, handler);
    });
  }


  _onPositionChanged(event) {
    if (this._private.isScrollLocked) return;
    this._private.position.x = event.detail.x;
    this._private.position.y = event.detail.y;
    this._updateMoveablePosition();
  }


  // MOVEABLE MANIPULATION


  _updateMoveablePosition() {
    this._config.moveable.style.webkitTransform = 'translate3d(' + this._private.position.x + 'px, ' + this._private.position.y + 'px, 0px)';
  }


  // ANIMATED SCROLLING


  _bindAnimatedScroll() {
    this._private.boundAnimatedScroll = this._runAnimatedScroll.bind(this);
  }


  _startAnimatedScroll(targetPos) {
    let animatedScroll = this._private.animatedScroll;

    cancelAnimationFrame(this._private.currentFrame);

    animatedScroll.startingPos = {
      x: this._private.position.x,
      y: this._private.position.y
    }

    animatedScroll.targetPos = {
      x: this._private.position.x,
      y: this._private.position.y
    }

    let validTargetPos = this._nearestValidPosition(targetPos);

    // only set a target position for axes on which scrolling is enabled.
    // otherwise, tarhet position remains the same as current position.
    this._forXY((xy) => {
      animatedScroll.targetPos[xy] = validTargetPos[xy];
    });

    animatedScroll.totalDistance = this._positionDistance(
      animatedScroll.startingPos,
      animatedScroll.targetPos
    );

    this._calculateScrollDirection();
    animatedScroll.speed = this._config.maxScrollToSpeed;
    animatedScroll.isScrolling = true;

    this._private.currentFrame = requestAnimationFrame(this._private.boundAnimatedScroll);
  }


  _runAnimatedScroll() {
    let animatedScroll = this._private.animatedScroll;

    let distanceToTarget = this._positionDistance(
      this._private.position,
      animatedScroll.targetPos
    );

    // slow down when close to target
    if (distanceToTarget < this._config.scrollToSlowingDistance) {
      animatedScroll.speed = this._config.maxScrollToSpeed * (distanceToTarget/this._config.scrollToSlowingDistance);
    }

    // stop when on target
    if (distancePx < 1) {
        this._stopAnimatedScroll();
        this.scrollTo(
          animatedScroll.targetPos.x,
          animatedScroll.targetPos.y
        );
    }
    // otherwise move towards target
    else {
      this._forXY((xy) => {
        this._private.position[xy] += animatedScroll.speed * animatedScroll.direction[xy];
      });
      this._private.wegbier.scrollTo(this._private.position);

      this._private.currentFrame = requestAnimationFrame(this._private.boundAnimatedScroll);
    }
  }


  _stopAnimatedScroll() {
    let animatedScroll = this._private.animatedScroll;

    animatedScroll.speed = 0;
    animatedScroll.isScrolling = false;

    cancelAnimationFrame(this._private.currentFrame);
  }


  _calculateScrollDirection() {
    let animatedScroll = this._private.animatedScroll,
      distance = { x: 0, y: 0 };

    // update the position, according to the speed component on each axis
    this._forXY((xy) => {
      distance[xy] = animatedScroll.targetPos[xy] - animatedScroll.startingPos[xy];
    });

    animatedScroll.direction.radians = Math.atan2(distance.y, distance.x);

    animatedScroll.direction.x = Math.cos(animatedScroll.direction.radians);
    animatedScroll.direction.y = Math.sin(animatedScroll.direction.radians);
  }


  // HELPERS


  _positionDistance(pos1, pos2) {
    return this._distance(pos1.x, pos1.y, pos2.x, pos2.y);
  }


  _distance(x1, y1, x2, y2) {
    return Math.sqrt( (x2-=x1)*x2 + (y2-=y1)*y2 );
  }


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _nearestValidPosition(position) {
    let result = { x: 0, y: 0 };

    this._forXY((xy) => {
      if (position[xy] > 0)
        result[xy] = 0;
      else if (position[xy] < this._private.positionLimits[xy])
        result[xy] = this._private.positionLimits[xy];
      else
        result[xy] = position[xy];
    });

    return result;
  }
};
