import { default as Kotti } from '../node_modules/kotti/dist/Kotti.js';
import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as Momentum } from './Momentum.js';
import { default as Bounce } from './Bounce.js';
import { default as AnimatedScroll } from './AnimatedScroll.js';
import { default as ResizeDebouncer } from './ResizeDebouncer.js';

let defaults = {
  config: {
    // main container for defining the boundaries of the scrollable area and
    // setting the event listeners. is expected to be a simple DOM node
    container: null,

    // the moveable DOM node with the actual scrollable content
    moveable: null,

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'y',

    // lock movement in one direction. relevant if more touch/scroll libraries
    // are at the same spot and only the locked element should move
    lock: false,

    // allow scrolling beyond the edge of moveable
    overscroll: true,

    // maximum amount of pixels for touch-led overscrolling
    maxTouchOverscroll: 150,

    // maximum amount of pixels for momentum-led overscrolling
    maxMomentumOverscroll: 100,

    // how much time (in msec) it takes to bounce back
    bounceTime: 500,

    // how much time (in msec) it takes to animate-scroll
    scrollTime: 500,

    // maximum speed for scrolling, in px/frame
    maxPxPerFrame: 50,

    // minimum speed for scrolling, under which animated scrolling stops
    minPxPerFrame: 0.2,

    // minimum overscroll push, under which momentum is stopped
    minMomentumPush: 1.0,

    // minimum overscroll push multiplier, under which momentum is stopped
    minMomentumMultiplier: 0.15,

    // when set to true, listens to debounced window.resize events and calls refresh
    refreshOnResize: true
  },

  private: {
    container: {
      height: 0,
      width: 0
    },
    // a single abstract moveable is used to represent the combined collection of slides
    moveable: {
      height: 0,
      width: 0,
      x: 0,
      y: 0
    },
    boundaries: {
      x: {
        axisStart: 0,
        axisEnd: 0
      },
      y: {
        axisStart: 0,
        axisEnd: 0
      }
    },
    // amount of overscroll on each axis, is pixels
    overscrollPx: {
      x: 0,
      y: 0
    },
    axis: ['x', 'y'],
    isBouncingOnAxis: { x: false, y: false },
    isMomentumOnAxis: { x: false, y: false },
    isAnimatedScrolling: false,
    isTouchActive: false
  }
};


let events = {
  positionChanged: 'mustafas:positionChanged',
  positionStable: 'mustafas:positionStable'
};


export default class Mustafas {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this.kotti = new Kotti(this._config);
    this.bounce = new Bounce(this._config);
    this.momentum = new Momentum(this._config);
    this.animatedScroll = new AnimatedScroll(this._config);

    if (this._config.refreshOnResize) this.resizeDebouncer = new ResizeDebouncer();

    this.events = events;
    utils.addEventTargetInterface(this);

    this._calculateParams();
    this._bindEvents();

    this._private.boundUpdateElementPositions = this._updateElementPositions.bind(this);
  }


  // PUBLIC


  refresh(config) {
    if (config) fUtils.mergeDeep(this._config, config);

    this._calculateParams();
  }


  getScrollPosition() {
    return { left: this._private.moveable.x, top: this._private.moveable.y };
  }


  scrollTo(left, top, shouldAnimate, scrollSpeed) {
    if (this._private.isScrollFrozen) return;

    if (this._private.isAnimatedScrolling) {
      this.animatedScroll.stopAnimatedScroll();
    }

    let validTargetPosition = this._getNearestValidPosition({ x: left, y: top });

    if (shouldAnimate) {
      // TODO stop any bounce or momentum
      this.momentum.stopMomentum();
      this.bounce.stop();
      this.animatedScroll.startAnimatedScroll(this._private.moveable, validTargetPosition, scrollSpeed);
    }
    else {
      this._updateCoords(validTargetPosition);
    }
  }


  scrollBy(left, top, shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x +left, this._private.position.x +top, shouldAnimate, scrollSpeed);
  }


  scrollTop(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.moveable.x, this._private.boundaries.y.axisStart, shouldAnimate, scrollSpeed);
  }


  scrollBottom(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.moveable.x, this._private.boundaries.y.axisEnd, shouldAnimate, scrollSpeed);
  }


  freezeScroll(shouldFreeze) {
    this.momentum.stopMomentum();
    this.animatedScroll.stop();
    this.kotti.setEnabled(!shouldFreeze);

    // TODO stop momentum and/or animated scroll
  }


  getBoundaries() {
    return fUtils.cloneDeep(this._private.boundaries);
  }


  destroy() {
    this._unbindEvents();
    this.kotti.destroy();

    if (this.resizeDebouncer) this.resizeDebouncer.destroy();

    this._config.container = null;
    this._config.moveable = null;
  };


  // LIFECYCLE


  _bindEvents() {
    this._private.boundHandlersKotti = {
      touchStart: this._handleTouchStart.bind(this),
      touchEnd: this._handleTouchEnd.bind(this),
      pushBy: this._handlePushBy.bind(this),
      finishedTouchWithMomentum: this._handleTouchMomentum.bind(this)
    };

    fUtils.forEach(this._private.boundHandlersKotti, (handler, eventType) => {
      this.kotti.addEventListener(this.kotti.events[eventType], handler);
    });

    this._private.boundHandlersBounce = {
      bounceStartOnAxis: this._handleBounceStartOnAxis.bind(this),
      bounceEndOnAxis: this._handleBounceEndOnAxis.bind(this),
      bounceToPosition: this._handleBounceToPosition.bind(this)
    };

    fUtils.forEach(this._private.boundHandlersBounce, (handler, eventType) => {
      this.bounce.addEventListener(this.bounce.events[eventType], handler);
    });

    this._private.boundHandlersMomentum = {
      pushBy: this._handlePushBy.bind(this),
      startOnAxis: this._handleMomentumStartOnAxis.bind(this),
      stopOnAxis: this._handleMomentumStopOnAxis.bind(this),
      stop: this._handleMomentumStop.bind(this)
    };

    fUtils.forEach(this._private.boundHandlersMomentum, (handler, eventType) => {
      this.momentum.addEventListener(this.momentum.events[eventType], handler);
    });

    this._private.boundHandlersAnimatedScroll = {
      start: this._handleAnimatedScrollStart.bind(this),
      scrollTo: this._handleAnimatedScrollTo.bind(this),
      stop: this._handleAnimatedScrollStop.bind(this)
    };

    fUtils.forEach(this._private.boundHandlersAnimatedScroll, (handler, eventType) => {
      this.animatedScroll.addEventListener(this.animatedScroll.events[eventType], handler);
    });
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundHandlersKotti, (handler, eventType) => {
      this.kotti.removeEventListener(this.kotti.events[eventType], handler);
    });

    fUtils.forEach(this._private.boundHandlersBounce, (handler, eventType) => {
      this.bounce.removeEventListener(this.bounce.events[eventType], handler);
    });

    fUtils.forEach(this._private.boundHandlersMomentum, (handler, eventType) => {
      this.momentum.removeEventListener(this.momentum.events[eventType], handler);
    });
  }


  // EVENT HANDLERS


  _handleTouchStart() {
    this._private.isTouchActive = true;
    if (this._private.isBouncingOnAxis.x || this._private.isBouncingOnAxis.y) {
      this.bounce.stop();
    }
    // TODO stop momentum too
    if (this._private.isMomentumOnAxis.x || this._private.isMomentumOnAxis.y) {
      this.momentum.stopMomentum();
    }
  }


  _handleTouchEnd() {
    this._private.isTouchActive = false;
    this._checkForBounceStart();
    this._checkForPositionStable();
  }


  _handleBounceStartOnAxis(event) {
    this._private.isBouncingOnAxis[event.data.axis] = true;
  }


  _handleBounceEndOnAxis(event) {
    this._private.isBouncingOnAxis[event.data.axis] = false;
    this._checkForPositionStable();
  }


  _handleBounceToPosition(event) {
    this._updateCoords(event.data);
  }


  _handleMomentumStartOnAxis(event) {
    this._private.isMomentumOnAxis[event.data.axis] = true;
  }


  _handleMomentumStop(event) {
    this._checkForPositionStable();
  }


  _handleMomentumStopOnAxis(event) {
    this._private.isMomentumOnAxis[event.data.axis] = false;
    this._checkForBounceStartOnAxis(event.data.axis);
  }


  _handleAnimatedScrollStart(event) {
    console.log("START");
    this._private.isAnimatedScrolling = true;
  }


  _handleAnimatedScrollStop(event) {
    console.log("STOP");
    this._private.isAnimatedScrolling = false;
    this._checkForPositionStable();
  }


  _handleAnimatedScrollTo(event) {
    this._updateCoords(event.data);
  }


  _handlePushBy(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.moveable.x,
        y: this._private.moveable.y
      },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      let pxToAdd = pushBy[xy].px * pushBy[xy].direction,
        stopMomentum = false;

      // OVERSCROLLING IS ALLOWED

      // the further you overscroll, the smaller is the displacement; we multiply the displacement
      // by a linear factor of the overscroll distance
      if (this._config.overscroll) {
        if (this._private.overscrollPx[xy] > 0) {
          // for non-touch pushes (i.e. momentum) we use a smaller overscroll maximum, so that the
          // momentum is reduced (and stopped) earlier. this gets us closer to the iOS behavior
          let maxOverscroll = this._private.isTouchActive ? this._config.maxTouchOverscroll : this._config.maxMomentumOverscroll,
            multiplier = utils.easeLinear(this._private.overscrollPx[xy], 1, -1, maxOverscroll);

          pxToAdd *= multiplier;

          // todo remove literal value
          if (this._private.isMomentumOnAxis[xy]
            && (multiplier < this._config.minMomentumMultiplier || Math.abs(pxToAdd) < this._config.minMomentumPush)) {
            console.log("px/mult too small", pxToAdd.toFixed(2), multiplier.toFixed(2));
            this.momentum.stopMomentumOnAxis(xy);
          }
        }

        newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;

        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart) {
          newCoordinates[xy] = boundaries[xy].axisStart;
          stopMomentum = true;
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd) {
          newCoordinates[xy] = boundaries[xy].axisEnd;
          stopMomentum = true;
        }
      }

      if (stopMomentum) this.momentum.stopMomentumOnAxis(xy);
    });

    this._updateCoords(newCoordinates);
  }


  _handleTouchMomentum(event) {
    if (this._private.overscrollPx.x > 0 || this._private.overscrollPx.y > 0) return;
    // TODO remove once kotti stops sending zeroes
    if (event.data.x.pxPerFrame + event.data.y.pxPerFrame !== 0)
      this.momentum.startMomentum(event.data);
  }


  // POSITION AND MOVEMENT


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    this._private.moveable.width = this._config.moveable.clientWidth;
    this._private.moveable.height = this._config.moveable.clientHeight;

    // calculate the maximum and minimum coordinates for scrolling. these are used as boundaries for
    // determining overscroll status, initiating bounce (if allowed); and also to determine bounce
    // target position when overscrolling
    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';
      this._private.boundaries[xy].axisStart = 0;
      this._private.boundaries[xy].axisEnd = this._private.container[dimension] - this._private.moveable[dimension];
      // moveable is smaller than container on this axis, the only "stable" position is 0
      if (this._private.boundaries[xy].axisEnd > 0) this._private.boundaries[xy].axisEnd = 0;
    });
  }


  _updateCoords(newCoordinates) {
    this._forXY((xy) => {

      // DEAL WITH OVERSCROLLING

      if (this._config.overscroll) {
        let overscrollPx = this._private.overscrollPx,
          boundaries = this._private.boundaries;


        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart) {
          overscrollPx[xy] = newCoordinates[xy] - boundaries[xy].axisStart;
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd) {
          overscrollPx[xy] = boundaries[xy].axisEnd - newCoordinates[xy];
        }
        else {
          overscrollPx[xy] = 0;
        }
      }
    });

    // APPLY NEW COORDINATES AND DISPATCH EVENT

    if (this._private.moveable.x !== newCoordinates.x || this._private.moveable.y !== newCoordinates.y) {
      this._private.moveable.x = newCoordinates.x;
      this._private.moveable.y = newCoordinates.y;
      requestAnimationFrame(this._private.boundUpdateElementPositions);

      this.dispatchEvent(new Event(events.positionChanged), {
        position: {
          x: this._private.moveable.x,
          y: this._private.moveable.y
        },
        percent: {
          x: this._private.moveable.x / (this._private.moveable.width - this._private.container.width),
          y: this._private.moveable.y / (this._private.moveable.height - this._private.container.height)
        }
      });
    }
  }


  // DOM MANIPULATION


  _updateElementPositions() {
    this._config.moveable.style.webkitTransform = `translate3d(
        ${this._private.moveable.x}px, ${this._private.moveable.y}px, 0px)`;
  }


  // CONDITION CHECKING


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    // TODO single-line
    if (this._private.isTouchActive
        || this._private.isBouncingOnAxis[axis]
        || this._private.isMomentumOnAxis[axis]) return;

    if (this._private.moveable[axis] > this._private.boundaries[axis].axisStart) {
      this.bounce.bounceToTargetOnAxis(axis, this._private.moveable[axis], this._private.boundaries[axis].axisStart);
    }
    else if (this._private.moveable[axis] < this._private.boundaries[axis].axisEnd) {
      this.bounce.bounceToTargetOnAxis(axis, this._private.moveable[axis], this._private.boundaries[axis].axisEnd);
    }
  }


  _checkForPositionStable() {
    if (!this._private.isTouchActive
        && !this._private.isAnimatedScrolling
        && !this._private.isBouncingOnAxis.x
        && !this._private.isBouncingOnAxis.y
        && !this._private.isMomentumOnAxis.x
        && !this._private.isMomentumOnAxis.y) {
      console.log("POS STABLE");
      this.dispatchEvent(new Event(events.positionStable), {
        position: {
          x: this._private.moveable.x,
          y: this._private.moveable.y
        },
        percent: {
          x: this._private.moveable.x / (this._private.moveable.width - this._private.container.width),
          y: this._private.moveable.y / (this._private.moveable.height - this._private.container.height)
        }
      });
    }
  }


  // ANIMATED SCROLLING


 /*


  _bindAnimatedScroll() {
    this._private.boundAnimatedScroll = this._runAnimatedScroll.bind(this);
  }


  _startAnimatedScroll(targetPosition, scrollSpeed) {
    let animatedScroll = this._private.animatedScroll;

    cancelAnimationFrame(this._private.currentFrame);

    // SET STARTING POSITION AND VALID TARGET

    animatedScroll.startingPosition = {
      x: this._private.position.x,
      y: this._private.position.y
    };

    animatedScroll.targetPosition = {
      x: this._private.position.x,
      y: this._private.position.y
    };

    let validTargetPosition = this._getNearestValidPosition(targetPosition);

    // only set a target position for axes on which scrolling is enabled.
    // otherwise, tarhet position remains the same as current position.
    this._forXY((xy) => {
      animatedScroll.targetPosition[xy] = validTargetPosition[xy];
    });

    animatedScroll.totalDistance = this._getPositionDistance(
      animatedScroll.startingPosition,
      animatedScroll.targetPosition
    );

    // CALCULATE SCROLL DIRECTION

    let distance = { x: 0, y: 0 };

    this._forXY((xy) => {
      distance[xy] = animatedScroll.targetPosition[xy] - animatedScroll.startingPosition[xy];
    });

    animatedScroll.direction.radians = Math.atan2(distance.y, distance.x);
    animatedScroll.direction.x = Math.cos(animatedScroll.direction.radians);
    animatedScroll.direction.y = Math.sin(animatedScroll.direction.radians);

    // SET SPEED AND START ANIMATING

    animatedScroll.maxPxPerFrame = scrollSpeed > 0 ? scrollSpeed : this._config.maxScrollPxPerFrame;
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
  */


  // HELPERS


  _getPositionDistance(pos1, pos2) {
    return this._distance(pos1.x, pos1.y, pos2.x, pos2.y);
  }


  _distance(x1, y1, x2, y2) {
    return Math.sqrt( (x2 -= x1)*x2 + (y2 -= y1)*y2 );
  }


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _getNearestValidPosition(position) {
    let result = { x: 0, y: 0 },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      if (position[xy] > boundaries[xy].axisStart) {
        result[xy] = boundaries[xy].axisStart;
      }
      else if (position[xy] < boundaries[xy].axisEnd) {
        result[xy] = boundaries[xy].axisEnd;
      }
      else {
        result[xy] = position[xy];
      }
    });

    return result;
  }
};
