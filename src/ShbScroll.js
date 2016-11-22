import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';
// TODO: import via npm as soon as available
import { default as ShbTouch } from './vendor/ShbTouch';
import { default as Momentum } from './Momentum.js';
import { default as Bounce } from './Bounce.js';
import { default as AnimatedScroll } from './AnimatedScroll.js';


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
    // an abstract container is used for calculations and bookkeeping
    container: {
      height: 0,
      width: 0
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
    // the current position, relative to the upper-left corner of the moveable
    position: {
      x: {
        px: 0,
        percentage: 0
      },
      y: {
        px: 0,
        percentage: 0
      }
    },
    axis: ['x', 'y'],
    isBouncingOnAxis: { x: false, y: false },
    isMomentumOnAxis: { x: false, y: false },
    isAnimatedScrolling: false,
    isTouchActive: false
  }
};


let events = {
  positionChanged: 'positionChanged',
  positionStable: 'positionStable'
};


export default class ShbScroll {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);

    if (config) lodash.merge(this._config, config);
    this._private.axis = this._config.axis.split('');

    this.shbTouch = new ShbTouch(this._config);
    this.bounce = new Bounce(this._config);
    this.momentum = new Momentum(this._config);
    this.animatedScroll = new AnimatedScroll(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);
    this._bindEvents();

    requestAnimationFrame(() => {
      this._calculateParams();
    });
  }


  // PUBLIC


  refresh(config) {
    if (config) lodash.merge(this._config, config);

    requestAnimationFrame(() => {
      this._calculateParams();
    });
  }


  setPositionPercentage(positionPercentage) {
    this.scrollToPercentage(positionPercentage, positionPercentage);
  }


  scrollToPercentage(left, top, shouldAnimate, scrollSpeed) {
    let percentage = { x: left, y: top },
      range = { x: 0, y: 0 },
      position = { x: 0, y: 0 };

    this._forXY((xy) => {
      range[xy] = this._private.boundaries[xy].axisEnd - this._private.boundaries[xy].axisStart;
      position[xy] = this._private.boundaries[xy].axisStart + (range[xy] * percentage[xy]);
    });

    this.scrollTo(position.x, position.y, shouldAnimate, scrollSpeed);
  }


  scrollTo(left, top, shouldAnimate, scrollSpeed) {
    if (this._private.isScrollFrozen) return;

    this.animatedScroll.stopAnimatedScroll();
    this.momentum.stopMomentum();
    this.bounce.stop();

    let validTargetPosition = this._getNearestValidPosition({ x: left, y: top });

    if (shouldAnimate) {
      this.animatedScroll.startAnimatedScroll({ x: this._private.position.x.px, y: this._private.position.y.px }, validTargetPosition, scrollSpeed);
    }
    else {
      this._updateCoords(validTargetPosition);
    }
  }


  scrollBy(left, top, shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x.px +left, this._private.position.y.px +top, shouldAnimate, scrollSpeed);
  }


  scrollTop(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x.px, this._private.boundaries.y.axisStart, shouldAnimate, scrollSpeed);
  }


  scrollBottom(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x.px, this._private.boundaries.y.axisEnd, shouldAnimate, scrollSpeed);
  }


  disableScrolling(isDisabled) {
    this.momentum.stopMomentum();
    this.animatedScroll.stop();
    this.shbTouch.disableScrolling(isDisabled);
  }


  destroy() {
    this._unbindEvents();
    this.shbTouch.destroy();

    this._config.container = null;
    this._config.moveable = null;
  }


  // LIFECYCLE


  _bindEvents() {
    this._private.boundShbTouchHandlers = {
      touchStart: this._handleTouchStart.bind(this),
      touchEnd: this._handleTouchEnd.bind(this),
      pushBy: this._handlePushBy.bind(this),
      touchEndWithMomentum: this._onTouchEndWithMomentum.bind(this)
    };

    lodash.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.addEventListener(eventName, handler);
    });

    this._private.boundBounceHandlers = {
      bounceStartOnAxis: this._handleBounceStartOnAxis.bind(this),
      bounceEndOnAxis: this._handleBounceEndOnAxis.bind(this),
      bounceToPosition: this._handleBounceToPosition.bind(this)
    };

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.addEventListener(eventName, handler);
    });

    this._private.boundMomentumHandlers = {
      pushBy: this._handlePushBy.bind(this),
      startOnAxis: this._handleMomentumStartOnAxis.bind(this),
      stopOnAxis: this._handleMomentumStopOnAxis.bind(this),
      stop: this._handleMomentumStop.bind(this)
    };

    lodash.forEach(this._private.boundMomentumHandlers, (handler, eventName) => {
      this.momentum.addEventListener(eventName, handler);
    });

    this._private.boundAnimatedScrollHandlers = {
      start: this._handleAnimatedScrollStart.bind(this),
      scrollTo: this._handleAnimatedScrollTo.bind(this),
      stop: this._handleAnimatedScrollStop.bind(this)
    };

    lodash.forEach(this._private.boundAnimatedScrollHandlers, (handler, eventName) => {
      this.animatedScroll.addEventListener(eventName, handler);
    });

    if (this._config.refreshOnResize) {
      this._private.boundDebouncedRefresh = utils.getDebounced(this.refresh.bind(this));
      window.addEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  _unbindEvents() {
    lodash.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.removeEventListener(eventName, handler);
    });

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.removeEventListener(eventName, handler);
    });

    lodash.forEach(this._private.boundMomentumHandlers, (handler, eventName) => {
      this.momentum.removeEventListener(eventName, handler);
    });

    lodash.forEach(this._private.boundAnimatedScrollHandlers, (handler, eventName) => {
      this.animatedScroll.removeEventListener(eventName, handler);
    });

    if (this._private.boundDebouncedRefresh) {
      window.removeEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  // EVENT HANDLERS


  _handleTouchStart() {
    this._private.isTouchActive = true;

    this.bounce.stop();
    this.momentum.stopMomentum();
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
    // bounce will send us a coordinate pair, but only the coordinate for the active axis is
    // meaningful, which causes problems in 2d-scrollable objects; this would better be avoided by
    // removing the axis-separation logic in bounce and instead always using a target, similarly
    // to what happens in animated scroll
    let newPosition = {
      x: this._private.isBouncingOnAxis.x ? event.data.x : this._private.position.x.px,
      y: this._private.isBouncingOnAxis.y ? event.data.y : this._private.position.y.px
    };
    this._updateCoords(newPosition);
  }


  _handleMomentumStartOnAxis(event) {
    this._private.isMomentumOnAxis[event.data.axis] = true;
  }


  _handleMomentumStop() {
    this._checkForPositionStable();
  }


  _handleMomentumStopOnAxis(event) {
    this._private.isMomentumOnAxis[event.data.axis] = false;
    this._checkForBounceStartOnAxis(event.data.axis);
  }


  _handleAnimatedScrollStart() {
    this._private.isAnimatedScrolling = true;
  }


  _handleAnimatedScrollStop() {
    this._private.isAnimatedScrolling = false;
    this._checkForPositionStable();
  }


  _handleAnimatedScrollTo(event) {
    this._updateCoords(event.data);
  }


  _handlePushBy(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.position.x.px,
        y: this._private.position.x.px
      },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      // direction obtained from ShbTouch is opposite to how we keep coordinates
      let pxToAdd = pushBy[xy].px * (-pushBy[xy].direction),
        stopMomentum = false;

      // OVERSCROLLING IS ALLOWED

      // the further you overscroll, the smaller is the displacement; this is valid for user touch
      // but also for momentum; we multiply the displacement by a linear factor of the overscroll
      // distance; the further the overscroll, the smaller the displacement
      if (this._config.overscroll) {
        if (this._private.overscrollPx[xy] > 0) {
          // for non-touch pushes (i.e. momentum) we use a smaller overscroll maximum, so that the
          // momentum is reduced (and stopped) earlier. this gets us closer to the iOS behavior
          let maxOverscroll = this._private.isTouchActive ? this._config.maxTouchOverscroll : this._config.maxMomentumOverscroll,
            multiplier = utils.easeLinear(this._private.overscrollPx[xy], 1, -1, maxOverscroll);

          pxToAdd *= multiplier;

          // if the source of push was momentum, and the multiplier or result are too low, we
          // stop the momentum so that bounce can kick in
          if (this._private.isMomentumOnAxis[xy]
            && (multiplier < this._config.minMomentumMultiplier || Math.abs(pxToAdd) < this._config.minMomentumPush)) {
            stopMomentum = true;
          }
        }

        newCoordinates[xy] = this._private.position[xy].px + pxToAdd;
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        newCoordinates[xy] = this._private.position[xy].px + pxToAdd;

        // check on axis start (left or top)
        if (newCoordinates[xy] < boundaries[xy].axisStart) {
          newCoordinates[xy] = boundaries[xy].axisStart;
          stopMomentum = true;
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] > boundaries[xy].axisEnd) {
          newCoordinates[xy] = boundaries[xy].axisEnd;
          stopMomentum = true;
        }
      }

      if (stopMomentum) this.momentum.stopMomentumOnAxis(xy);
    });

    this._updateCoords(newCoordinates);
  }


  _onTouchEndWithMomentum(event) {
    // do not start new momentum when overscrolling
    if (this._private.overscrollPx.x > 0 || this._private.overscrollPx.y > 0) return;

    this.momentum.startMomentum(event.data);
  }


  // POSITION AND MOVEMENT


  _calculateParams() {
    let configMoveable = this._config.moveable,
      configContainer = this._config.container,
      container = this._private.container,
      boundaries = this._private.boundaries;

    container.width = configContainer.clientWidth;
    container.height = configContainer.clientHeight;

    let moveableDimensions = {
      width: configMoveable.clientWidth,
      height: configMoveable.clientHeight
    };

    // calculate the maximum and minimum coordinates for scrolling. these are used as boundaries for
    // determining overscroll status, initiating bounce (if allowed); and also to determine bounce
    // target position when overscrolling
    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';

      boundaries[xy].axisStart = 0;
      boundaries[xy].axisEnd = moveableDimensions[dimension] - container[dimension];
      // moveable is smaller than container on this axis, the only "stable" position is 0
      if (boundaries[xy].axisEnd < 0) boundaries[xy].axisEnd = 0;
    });
  }


  _updateCoords(newCoordinates) {
    this._forXY((xy) => {

      // DEAL WITH OVERSCROLLING

      if (this._config.overscroll) {
        let overscrollPx = this._private.overscrollPx,
          boundaries = this._private.boundaries;

        // check on axis start (left or top)
        if (newCoordinates[xy] < boundaries[xy].axisStart) {
          overscrollPx[xy] = boundaries[xy].axisStart - newCoordinates[xy];
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] > boundaries[xy].axisEnd) {
          overscrollPx[xy] = newCoordinates[xy] - boundaries[xy].axisEnd;
        }
        else {
          overscrollPx[xy] = 0;
        }
      }
    });

    // APPLY NEW COORDINATES AND DISPATCH EVENT

    let position = this._private.position;

    if (position.x.px !== newCoordinates.x || position.y.px !== newCoordinates.y) {
      this._forXY((xy) => {
        position[xy].px = newCoordinates[xy];
        if (this._private.boundaries[xy].axisEnd > 0) {
          position[xy].percentage = position[xy].px / this._private.boundaries[xy].axisEnd;
        }
      });
      requestAnimationFrame(() => {
        this._updateElementPositions();
      });

      this.dispatchEvent(new Event(events.positionChanged), {
        position: {
          x: position.x.px,
          y: position.y.px
        },
        percentage: {
          x: position.x.percentage,
          y: position.y.percentage
        }
      });
    }
  }


  // DOM MANIPULATION


  _updateElementPositions() {
    this._config.moveable.style.webkitTransform = `translate3d(
        ${-this._private.position.x.px}px, ${-this._private.position.y.px}px, 0px)`;
  }


  // CONDITION CHECKING


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    if (this._private.isTouchActive || this._private.isBouncingOnAxis[axis] || this._private.isMomentumOnAxis[axis]) return;

    if (this._private.position[axis].px < this._private.boundaries[axis].axisStart) {
      if (this._private.axis.length > 1) this.momentum.stopMomentum();
      this.bounce.bounceToTargetOnAxis(axis, this._private.position[axis].px, this._private.boundaries[axis].axisStart);
    }
    else if (this._private.position[axis].px > this._private.boundaries[axis].axisEnd) {
      if (this._private.axis.length > 1) this.momentum.stopMomentum();
      this.bounce.bounceToTargetOnAxis(axis, this._private.position[axis].px, this._private.boundaries[axis].axisEnd);
    }
  }


  _checkForPositionStable() {
    if (!this._private.isTouchActive
        && !this._private.isAnimatedScrolling
        && !this._private.isBouncingOnAxis.x
        && !this._private.isBouncingOnAxis.y
        && !this._private.isMomentumOnAxis.x
        && !this._private.isMomentumOnAxis.y) {
      let position = this._private.position;

      this.dispatchEvent(new Event(events.positionStable), {
        position: {
          x: position.x.px,
          y: position.y.px
        },
        percentage: {
          x: position.x.percentage,
          y: position.y.percentage
        }
      });
    }
  }


  // HELPERS


  _getPositionDistance(pos1, pos2) {
    return Math.sqrt( (pos2.x - pos1.x) * (pos2.x - pos1.x) + (pos2.y - pos1.y) * (pos2.y - pos1.y) );
  }


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _getNearestValidPosition(position) {
    let result = { x: 0, y: 0 },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      if (position[xy] < boundaries[xy].axisStart) {
        result[xy] = boundaries[xy].axisStart;
      }
      else if (position[xy] > boundaries[xy].axisEnd) {
        result[xy] = boundaries[xy].axisEnd;
      }
      else {
        result[xy] = position[xy];
      }
    });

    return result;
  }
}
