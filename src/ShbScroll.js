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
    axis: ['x', 'y'],
    container: {
      height: 0,
      width: 0
    },
    boundaries: {
      x: {
        start: 0,
        end: 0
      },
      y: {
        start: 0,
        end: 0
      }
    },
    moveable: {
      x: {
        position: 0, // in pixels
        progress: 0, // in percent
        overscroll: 0 // in pixels
      },
      y: {
        position: 0,
        progress: 0,
        overscroll: 0
      }
    }
  },

  state: {
    isTouchActive: false,
    isAnimatedScrolling: false,
    isBouncingOnAxis: {
      x: false,
      y: false
    },
    isMomentumOnAxis: {
      x: false,
      y: false
    }
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
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);
    this._private.axis = this._config.axis.split('');

    this.shbTouch = new ShbTouch(this._config);
    this.bounce = new Bounce(this._config);
    this.momentum = new Momentum(this._config);
    this.animatedScroll = new AnimatedScroll(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);
    this._bindEvents();

    requestAnimationFrame(() => this._calculateParams());
  }


  // PUBLIC


  refresh(config) {
    if (config) lodash.merge(this._config, config);
    requestAnimationFrame(() => this._calculateParams());
  }


  setPositionPercentage(positionPercentage) {
    this.scrollToPercentage(positionPercentage, positionPercentage);
  }


  scrollToPercentage(left, top, shouldAnimate, scrollSpeed) {
    let percentage = { x: left, y: top },
      range = { x: 0, y: 0 },
      position = { x: 0, y: 0 };

    this._forXY((xy) => {
      range[xy] = this._private.boundaries[xy].end - this._private.boundaries[xy].start;
      position[xy] = this._private.boundaries[xy].start + (range[xy] * percentage[xy]);
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
      this.animatedScroll.startAnimatedScroll({ x: this._private.moveable.x.position, y: this._private.moveable.y.position }, validTargetPosition, scrollSpeed);
    }
    else {
      this._updateCoords(validTargetPosition);
    }
  }


  scrollBy(left, top, shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.moveable.x.position +left, this._private.moveable.y.position + top, shouldAnimate, scrollSpeed);
  }


  scrollTop(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.moveable.x.position, this._private.boundaries.y.start, shouldAnimate, scrollSpeed);
  }


  scrollBottom(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.moveable.x.position, this._private.boundaries.y.end, shouldAnimate, scrollSpeed);
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
      touchStart: this._onTouchStart.bind(this),
      touchEnd: this._onTouchEnd.bind(this),
      pushBy: this._onPushBy.bind(this),
      touchEndWithMomentum: this._onTouchEndWithMomentum.bind(this)
    };

    lodash.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.addEventListener(eventName, handler);
    });

    this._private.boundBounceHandlers = {
      bounceStartOnAxis: this._onBounceStartOnAxis.bind(this),
      bounceEndOnAxis: this._onBounceEndOnAxis.bind(this),
      bounceToPosition: this._onBounceToPosition.bind(this)
    };

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.addEventListener(eventName, handler);
    });

    this._private.boundMomentumHandlers = {
      startOnAxis: this._onMomentumStartOnAxis.bind(this),
      stopOnAxis: this._onMomentumStopOnAxis.bind(this),
      pushBy: this._onPushBy.bind(this),
      stop: this._onMomentumStop.bind(this)
    };

    lodash.forEach(this._private.boundMomentumHandlers, (handler, eventName) => {
      this.momentum.addEventListener(eventName, handler);
    });

    this._private.boundAnimatedScrollHandlers = {
      start: this._onAnimatedScrollStart.bind(this),
      scrollTo: this._onAnimatedScrollTo.bind(this),
      stop: this._onAnimatedScrollStop.bind(this)
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


  _onTouchStart() {
    this._state.isTouchActive = true;

    this.bounce.stop();
    this.momentum.stopMomentum();
  }


  _onTouchEnd() {
    this._state.isTouchActive = false;
    this._checkForBounceStart();
    this._checkForPositionStable();
  }


  _onBounceStartOnAxis(event) {
    this._state.isBouncingOnAxis[event.data.axis] = true;
  }


  _onBounceEndOnAxis(event) {
    this._state.isBouncingOnAxis[event.data.axis] = false;
    this._checkForPositionStable();
  }


  _onBounceToPosition(event) {
    // bounce will send us a coordinate pair, but only the coordinate for the active axis is
    // meaningful, which causes problems in 2d-scrollable objects; this would better be avoided by
    // removing the axis-separation logic in bounce and instead always using a target, similarly
    // to what happens in animated scroll
    let newPosition = {
      x: this._state.isBouncingOnAxis.x ? event.data.x : this._private.moveable.x.position,
      y: this._state.isBouncingOnAxis.y ? event.data.y : this._private.moveable.y.position
    };
    this._updateCoords(newPosition);
  }


  _onMomentumStartOnAxis(event) {
    this._state.isMomentumOnAxis[event.data.axis] = true;
  }


  _onMomentumStop() {
    this._checkForPositionStable();
  }


  _onMomentumStopOnAxis(event) {
    this._state.isMomentumOnAxis[event.data.axis] = false;
    this._checkForBounceStartOnAxis(event.data.axis);
  }


  _onAnimatedScrollStart() {
    this._state.isAnimatedScrolling = true;
  }


  _onAnimatedScrollStop() {
    this._state.isAnimatedScrolling = false;
    this._checkForPositionStable();
  }


  _onAnimatedScrollTo(event) {
    this._updateCoords(event.data);
  }


  _onPushBy(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.moveable.x.position,
        y: this._private.moveable.x.position
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
        if (this._private.moveable[xy].overscroll > 0) {
          // for non-touch pushes (i.e. momentum) we use a smaller overscroll maximum, so that the
          // momentum is reduced (and stopped) earlier. this gets us closer to the iOS behavior
          let maxOverscroll = this._state.isTouchActive ? this._config.maxTouchOverscroll : this._config.maxMomentumOverscroll,
            multiplier = utils.easeLinear(this._private.moveable[xy].overscroll, 1, -1, maxOverscroll);

          pxToAdd *= multiplier;

          // if the source of push was momentum, and the multiplier or result are too low, we
          // stop the momentum so that bounce can kick in
          if (this._state.isMomentumOnAxis[xy]
            && (multiplier < this._config.minMomentumMultiplier || Math.abs(pxToAdd) < this._config.minMomentumPush)) {
            stopMomentum = true;
          }
        }

        newCoordinates[xy] = this._private.moveable[xy].position + pxToAdd;
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        newCoordinates[xy] = this._private.moveable[xy].position + pxToAdd;

        // check on axis start (left or top)
        if (newCoordinates[xy] < boundaries[xy].start) {
          newCoordinates[xy] = boundaries[xy].start;
          stopMomentum = true;
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] > boundaries[xy].end) {
          newCoordinates[xy] = boundaries[xy].end;
          stopMomentum = true;
        }
      }

      if (stopMomentum) this.momentum.stopMomentumOnAxis(xy);
    });

    this._updateCoords(newCoordinates);
  }


  _onTouchEndWithMomentum(event) {
    // do not start new momentum when overscrolling
    if (this._private.moveable.x.overscroll > 0 || this._private.moveable.y.overscroll > 0) return;
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

      boundaries[xy].start = 0;
      boundaries[xy].end = moveableDimensions[dimension] - container[dimension];
      // moveable is smaller than container on this axis, the only "stable" position is 0
      if (boundaries[xy].end < 0) boundaries[xy].end = 0;
    });
  }


  _updateCoords(newCoordinates) {
    this._forXY((xy) => {

      // DEAL WITH OVERSCROLLING

      if (this._config.overscroll) {
        let boundaries = this._private.boundaries;

        // check on axis start (left or top)
        if (newCoordinates[xy] < boundaries[xy].start) {
          this._private.moveable[xy].overscroll = boundaries[xy].start - newCoordinates[xy];
        }
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] > boundaries[xy].end) {
          this._private.moveable[xy].overscroll = newCoordinates[xy] - boundaries[xy].end;
        }
        else {
          this._private.moveable[xy].overscroll = 0;
        }
      }
    });

    // APPLY NEW COORDINATES AND DISPATCH EVENT

    let moveable = this._private.moveable;

    if (moveable.x.position !== newCoordinates.x || moveable.y.position !== newCoordinates.y) {
      this._forXY((xy) => {
        moveable[xy].position = newCoordinates[xy];

        if (this._private.boundaries[xy].end > 0) {
          moveable[xy].progress = moveable[xy].position / this._private.boundaries[xy].end;
        }
      });

      requestAnimationFrame(() => this._updateMoveablePosition());
      this.dispatchEvent(new Event(events.positionChanged), lodash.cloneDeep(this._private.moveable));
    }
  }


  // DOM MANIPULATION


  _updateMoveablePosition() {
    this._config.moveable.style.webkitTransform = `translate3d(${-this._private.moveable.x.position}px, ${-this._private.moveable.y.position}px, 0px)`;
  }


  // CONDITION CHECKING


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    if (this._state.isTouchActive || this._state.isBouncingOnAxis[axis] || this._state.isMomentumOnAxis[axis]) return;

    if (this._private.moveable[axis].position < this._private.boundaries[axis].start) {
      if (this._private.axis.length > 1) this.momentum.stopMomentum();
      this.bounce.bounceToTargetOnAxis(axis, this._private.moveable[axis].position, this._private.boundaries[axis].start);
    }
    else if (this._private.moveable[axis].position > this._private.boundaries[axis].end) {
      if (this._private.axis.length > 1) this.momentum.stopMomentum();
      this.bounce.bounceToTargetOnAxis(axis, this._private.moveable[axis].position, this._private.boundaries[axis].end);
    }
  }


  _checkForPositionStable() {
    if (!this._state.isTouchActive && !this._state.isAnimatedScrolling
        && !this._state.isBouncingOnAxis.x && !this._state.isBouncingOnAxis.y
        && !this._state.isMomentumOnAxis.x && !this._state.isMomentumOnAxis.y) {
      this.dispatchEvent(new Event(events.positionStable), lodash.cloneDeep(this._private.moveable));
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
      if (position[xy] < boundaries[xy].start) {
        result[xy] = boundaries[xy].start;
      }
      else if (position[xy] > boundaries[xy].end) {
        result[xy] = boundaries[xy].end;
      }
      else {
        result[xy] = position[xy];
      }
    });

    return result;
  }
}
