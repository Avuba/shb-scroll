import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';
// TODO: import via npm as soon as available
import { default as ShbTouch } from './vendor/ShbTouch';
import { default as Momentum } from './Momentum.js';
import { default as Bounce } from './Bounce.js';
import { default as AnimatedScroll } from './AnimatedScroll.js';


let defaults = {
  config: {
    // main container for defining the boundaries of the scrollable area and setting the event
    // listeners. is expected to be a simple DOM node
    container: null,

    // the moveable DOM node with the actual scrollable content
    moveable: null,

    // decide what axis to allow scrolling on, gets translated into an array by
    // the class constructor
    axis: 'y',

    // lock movement in one direction. relevant if more touch/scroll libraries are at the same spot
    // and only the locked element should move
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
    minMomentumPush: 1.5,

    // minimum overscroll push multiplier, under which momentum is stopped
    minMomentumMultiplier: 0.25,

    // when set to true, listens to debounced window.resize events and calls refresh
    refreshOnResize: true

    // NOTE: please take a look at the config objects inside ShbTouch.js, Bounce.js, Momentum.js and
    // AnimatedScroll.js regarding what other possible config parameters can be passed
  },

  private: {
    axis: ['x', 'y'],
    container: {
      height: 0,
      width: 0
    },
    moveable: {
      width: 0,
      height: 0,
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
  positionChange: 'positionChange',
  positionStable: 'positionStable'
};


export default class ShbScroll {
  constructor(config) {
    this._config = lodash.cloneDeep(defaults.config);
    this._private = lodash.cloneDeep(defaults.private);
    this._state = lodash.cloneDeep(defaults.state);

    if (config) lodash.merge(this._config, config);
    this._private.axis = this._config.axis.split('');

    // both fire a "push" event with a relative direction
    this.shbTouch = new ShbTouch(this._config);
    this.momentum = new Momentum(this._config);

    // both fire a "positionChange" event including an absolute position
    this.bounce = new Bounce(this._config);
    this.animatedScroll = new AnimatedScroll(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);
    this._bindEvents();

    requestAnimationFrame(() => this._calculateParams());
  }


  // PUBLIC


  scrollTo(x, y, animateTime) {
    this.animatedScroll.stop();
    this.momentum.stop();
    this.bounce.stop();

    let targetPosition = this._getClosestScrollTarget({ x, y });

    if (animateTime) {
      this.animatedScroll.start(
        { x: this._private.moveable.x.position, y: this._private.moveable.y.position },
        targetPosition,
        animateTime);
    }
    else {
      this._updateCoords(targetPosition);
    }
  }


  scrollBy(x, y, animateTime) {
    this.scrollTo(this._private.moveable.x.position + x, this._private.moveable.y.position + y, animateTime);
  }


  scrollTop(animateTime) {
    this.scrollTo(this._private.moveable.x.position, this._private.boundaries.y.start, animateTime);
  }


  scrollBottom(animateTime) {
    this.scrollTo(this._private.moveable.x.position, this._private.boundaries.y.end, animateTime);
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


  disableScrolling(isDisabled) {
    this.momentum.stop();
    this.animatedScroll.stop();
    this.shbTouch.disableScrolling(isDisabled);
  }


  refresh(config) {
    if (config) lodash.merge(this._config, config);
    requestAnimationFrame(() => this._calculateParams());
  }


  destroy() {
    this._unbindEvents();
    this.shbTouch.destroy();

    this.animatedScroll.stop();
    this.momentum.stop();
    this.bounce.stop();

    this._config.container = null;
    this._config.moveable = null;
  }


  // LIFECYCLE


  _bindEvents() {
    this._private.boundShbTouchHandlers = {
      touchStart: this._onTouchStart.bind(this),
      touchPush: this._onPush.bind(this),
      touchEnd: this._onTouchEnd.bind(this),
      touchEndWithMomentum: this._onTouchEndWithMomentum.bind(this)
    };

    lodash.forEach(this._private.boundShbTouchHandlers, (handler, eventName) => {
      this.shbTouch.addEventListener(eventName, handler);
    });

    this._private.boundMomentumHandlers = {
      momentumStartOnAxis: this._onMomentumStartOnAxis.bind(this),
      momentumPush: this._onPush.bind(this),
      momentumStop: this._onMomentumStop.bind(this),
      momentumStopOnAxis: this._onMomentumStopOnAxis.bind(this)
    };

    lodash.forEach(this._private.boundMomentumHandlers, (handler, eventName) => {
      this.momentum.addEventListener(eventName, handler);
    });

    this._private.boundBounceHandlers = {
      bounceStartOnAxis: this._onBounceStartOnAxis.bind(this),
      bouncePositionChange: this._onBouncePositionChange.bind(this),
      bounceEndOnAxis: this._onBounceEndOnAxis.bind(this),
    };

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.addEventListener(eventName, handler);
    });

    this._private.boundAnimatedScrollHandlers = {
      scrollStart: this._onAnimatedScrollStart.bind(this),
      scrollPush: this._onAnimatedScrollPush.bind(this),
      scrollStop: this._onAnimatedScrollStop.bind(this)
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


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    this._private.moveable.width = this._config.moveable.clientWidth;
    this._private.moveable.height = this._config.moveable.clientHeight;

    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';

      this._private.boundaries[xy].start = 0;
      this._private.boundaries[xy].end = this._private.moveable[dimension] - this._private.container[dimension];

      // in case the moveable is smaller than the container, the only "stable" end position is 0
      if (this._private.boundaries[xy].end < 0) this._private.boundaries[xy].end = 0;
    });
  }


  // EVENT HANDLERS


  _onTouchStart() {
    this._state.isTouchActive = true;
    this.bounce.stop();
    this.momentum.stop();
    this.animatedScroll.stop();
  }


  _onPush(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.moveable.x.position,
        y: this._private.moveable.x.position
      };

    this._forXY((xy) => {
      // directions obtained from ShbTouch are negative, ShbScroll works with positive coordinates
      let pxToAdd = pushBy[xy].px * pushBy[xy].direction * -1,
        stopMomentum = false;

      // if overscrolling is allowed, reduce the push by a linear factor of the distance. the
      // further the overscroll, the smaller the push
      if (this._config.overscroll) {
        if (this._private.moveable[xy].overscroll > 0) {
          // for non-touch pushes (e.g. momentum pushes) we use a smaller maximum overscroll
          let maxOverscroll = this._state.isTouchActive ? this._config.maxTouchOverscroll : this._config.maxMomentumOverscroll,
            multiplier = utils.easeLinear(this._private.moveable[xy].overscroll, 1, -1, maxOverscroll);

          pxToAdd *= multiplier;

          // we stop momentum when it becomes too slow so bounce can kick in
          if (this._state.isMomentumOnAxis[xy]
            && (multiplier < this._config.minMomentumMultiplier
              || Math.abs(pxToAdd) < this._config.minMomentumPush)) {
            stopMomentum = true;
          }
        }

        newCoordinates[xy] = this._private.moveable[xy].position + pxToAdd;
      }
      // overscrolling is not allowed, constrain movement to the boundaries
      else {
        newCoordinates[xy] = this._private.moveable[xy].position + pxToAdd;

        // overscrolling on axis start (left or top)
        if (newCoordinates[xy] < this._private.boundaries[xy].start) {
          newCoordinates[xy] = this._private.boundaries[xy].start;
          stopMomentum = true;
        }
        // overscrolling on axis end (right or bottom)
        else if (newCoordinates[xy] > this._private.boundaries[xy].end) {
          newCoordinates[xy] = this._private.boundaries[xy].end;
          stopMomentum = true;
        }
      }

      if (stopMomentum) this.momentum.stopOnAxis(xy);
    });

    this._updateCoords(newCoordinates);
  }


  _onTouchEnd() {
    this._state.isTouchActive = false;
    this._checkForBounceStart();
    this._checkForPositionStable();
  }


  _onTouchEndWithMomentum(event) {
    if (this._private.moveable.x.overscroll > 0 || this._private.moveable.y.overscroll > 0) return;
    this.momentum.start(event.data);
  }


  _onMomentumStartOnAxis(event) {
    console.log('_onMomentumStartOnAxis');
    this._state.isMomentumOnAxis[event.data.axis] = true;
  }


  _onMomentumStop() {
    console.log('_onMomentumStop');
    this._checkForPositionStable();
  }


  _onMomentumStopOnAxis(event) {
    console.log('_onMomentumStopOnAxis');
    this._state.isMomentumOnAxis[event.data.axis] = false;
    this._checkForBounceStartOnAxis(event.data.axis);
  }


  _onBounceStartOnAxis(event) {
    this._state.isBouncingOnAxis[event.data.axis] = true;
  }


  _onBouncePositionChange(event) {
    // we only care about the update position of the axis where bounce is actually active. this
    // enables us to run Bounce and Momentum at the same time
    let newPosition = {
      x: this._state.isBouncingOnAxis.x ? event.data.x : this._private.moveable.x.position,
      y: this._state.isBouncingOnAxis.y ? event.data.y : this._private.moveable.y.position
    };

    this._updateCoords(newPosition);
  }


  _onBounceEndOnAxis(event) {
    this._state.isBouncingOnAxis[event.data.axis] = false;
    this._checkForPositionStable();
  }


  _onAnimatedScrollStart() {
    this._state.isAnimatedScrolling = true;
  }


  _onAnimatedScrollPush(event) {
    this._updateCoords(event.data);
  }


  _onAnimatedScrollStop() {
    this._state.isAnimatedScrolling = false;
    this._checkForPositionStable();
  }


  // CONDITION CHECKERS


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    if (this._state.isTouchActive || this._state.isBouncingOnAxis[axis] || this._state.isMomentumOnAxis[axis]) return;

    if (this._private.moveable[axis].position < this._private.boundaries[axis].start) {
      this.momentum.stopOnAxis(axis);
      this.bounce.startOnAxis(axis, this._private.moveable[axis].position, this._private.boundaries[axis].start);
    }
    else if (this._private.moveable[axis].position > this._private.boundaries[axis].end) {
      this.momentum.stopOnAxis(axis);
      this.bounce.startOnAxis(axis, this._private.moveable[axis].position, this._private.boundaries[axis].end);
    }
  }


  _checkForPositionStable() {
    if (!this._state.isTouchActive && !this._state.isAnimatedScrolling
        && !this._state.isBouncingOnAxis.x && !this._state.isBouncingOnAxis.y
        && !this._state.isMomentumOnAxis.x && !this._state.isMomentumOnAxis.y) {
      this.dispatchEvent(new Event(events.positionStable), lodash.cloneDeep(this._private.moveable));
    }
  }


  // MOVEMENT AND POSITIONING


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

      // TODO: not sure if requestAnimationFrame is needed here
      requestAnimationFrame(() => this._updateMoveablePosition());
      this.dispatchEvent(new Event(events.positionChange), lodash.cloneDeep(this._private.moveable));
    }
  }


  _updateMoveablePosition() {
    this._config.moveable.style.webkitTransform = `translate3d(${-this._private.moveable.x.position}px, ${-this._private.moveable.y.position}px, 0px)`;
  }


  // HELPERS


  _getPositionDistance(pos1, pos2) {
    return Math.sqrt( (pos2.x - pos1.x) * (pos2.x - pos1.x) + (pos2.y - pos1.y) * (pos2.y - pos1.y) );
  }


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _getClosestScrollTarget(position) {
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
