import { default as utils } from './utils/utils';
import { default as lodash } from './utils/lodash';
// TODO: import via npm as soon as available
import { default as ShbTouch } from './vendor/ShbTouch';
import { default as Momentum } from './Momentum.js';
import { default as Bounce } from './Bounce.js';
import { default as AnimatedScroll } from './AnimatedScroll.js';


let defaults = {
  config: {
    // main container, direct parent of the moveable
    container: null,

    // the scrollable DOM node
    moveable: null,

    // axis to allow scrolling on, gets translated into an array by the class constructor
    axis: 'y',

    // allow scrolling beyond the edge of the container
    overscroll: true,

    // allow listening to the debounced window.resize event and call refresh
    refreshOnResize: true,

    // maximum amount of pixels for touch based overscrolling
    maxTouchOverscroll: 150,

    // maximum amount of pixels for momentum based overscrolling
    maxMomentumOverscroll: 100,

    // stop momentum if speed falls below
    minMomentumPush: 1.75,

    // stop momentum if multiplier falls below
    minMomentumMultiplier: 0.25,

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

    let targetPosition = this._getScrollTarget({ x, y });

    if (animateTime) {
      this.animatedScroll.start(
        { x: this._private.moveable.x.position, y: this._private.moveable.y.position },
        targetPosition,
        animateTime);
    }
    else {
      requestAnimationFrame(() => this._updateMoveablePosition(targetPosition));
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

    this.momentum.stop();
    this.bounce.stop();
    this.animatedScroll.stop();

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
      momentumEnd: this._checkForPositionStable.bind(this),
      momentumEndOnAxis: this._onMomentumEndOnAxis.bind(this)
    };

    lodash.forEach(this._private.boundMomentumHandlers, (handler, eventName) => {
      this.momentum.addEventListener(eventName, handler);
    });

    this._private.boundBounceHandlers = {
      bounceStartOnAxis: this._onBounceStartOnAxis.bind(this),
      bouncePositionChange: this._onBouncePositionChange.bind(this),
      bounceEnd: this._checkForPositionStable.bind(this),
      bounceEndOnAxis: this._onBounceEndOnAxis.bind(this),
    };

    lodash.forEach(this._private.boundBounceHandlers, (handler, eventName) => {
      this.bounce.addEventListener(eventName, handler);
    });

    this._private.boundAnimatedScrollHandlers = {
      scrollStart: this._onAnimatedScrollStart.bind(this),
      scrollPositionChange: this._onAnimatedScrollPositionChange.bind(this),
      scrollEnd: this._onAnimatedScrollEnd.bind(this)
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
      newPosition = {
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

        newPosition[xy] = this._private.moveable[xy].position + pxToAdd;
      }
      // overscrolling is not allowed, constrain movement to the boundaries
      else {
        newPosition[xy] = this._private.moveable[xy].position + pxToAdd;

        // overscrolling on axis start (left or top)
        if (newPosition[xy] < this._private.boundaries[xy].start) {
          newPosition[xy] = this._private.boundaries[xy].start;
          stopMomentum = true;
        }
        // overscrolling on axis end (right or bottom)
        else if (newPosition[xy] > this._private.boundaries[xy].end) {
          newPosition[xy] = this._private.boundaries[xy].end;
          stopMomentum = true;
        }
      }

      if (stopMomentum) this.momentum.stopOnAxis(xy);
    });

    this._updateMoveablePosition(newPosition);
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
    this._state.isMomentumOnAxis[event.data.axis] = true;
  }


  _onMomentumEndOnAxis(event) {
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

    this._updateMoveablePosition(newPosition);
  }


  _onBounceEndOnAxis(event) {
    this._state.isBouncingOnAxis[event.data.axis] = false;
  }


  _onAnimatedScrollStart() {
    this._state.isAnimatedScrolling = true;
  }


  _onAnimatedScrollPositionChange(event) {
    this._updateMoveablePosition(event.data);
  }


  _onAnimatedScrollEnd() {
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
    if (this._state.isTouchActive
        || this._state.isBouncingOnAxis[axis]
        || this._state.isMomentumOnAxis[axis]) return;

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
    if (this._state.isTouchActive
        || this._state.isAnimatedScrolling
        || this._state.isBouncingOnAxis.x || this._state.isBouncingOnAxis.y
        || this._state.isMomentumOnAxis.x || this._state.isMomentumOnAxis.y) return;

    this.dispatchEvent(new Event(events.positionStable), lodash.cloneDeep(this._private.moveable));
  }


  // MOVEMENT AND POSITIONING


  _updateMoveablePosition(newPosition) {
    this._forXY((xy) => {
      if (this._config.overscroll) {
        let boundaries = this._private.boundaries;

        // overscrolling on axis start (left or top)
        if (newPosition[xy] < boundaries[xy].start) {
          this._private.moveable[xy].overscroll = boundaries[xy].start - newPosition[xy];
        }
        // overscrolling on axis start (right or bottom)
        else if (newPosition[xy] > boundaries[xy].end) {
          this._private.moveable[xy].overscroll = newPosition[xy] - boundaries[xy].end;
        }
        else {
          this._private.moveable[xy].overscroll = 0;
        }
      }
    });

    if (this._private.moveable.x.position !== newPosition.x
        || this._private.moveable.y.position !== newPosition.y) {
      this._forXY((xy) => {
        this._private.moveable[xy].position = newPosition[xy];

        if (this._private.boundaries[xy].end > 0) {
          this._private.moveable[xy].progress = this._private.moveable[xy].position / this._private.boundaries[xy].end;
        } else {
          this._private.moveable[xy].progress = 1;
        }
      });

      this._updateMoveableNodePosition();
      this.dispatchEvent(new Event(events.positionChange), lodash.cloneDeep(this._private.moveable));
    }
  }


  _updateMoveableNodePosition() {
    this._config.moveable.style.webkitTransform = `translate3d(${-this._private.moveable.x.position}px, ${-this._private.moveable.y.position}px, 0px)`;
  }


  // HELPERS


  _forXY(toExecute) {
    this._private.axis.forEach(toExecute);
  }


  _getScrollTarget(position) {
    let scrollTarget = { x: 0, y: 0 };

    this._forXY((xy) => {
      if (position[xy] <  this._private.boundaries[xy].start) {
        scrollTarget[xy] =  this._private.boundaries[xy].start;
      }
      else if (position[xy] >  this._private.boundaries[xy].end) {
        scrollTarget[xy] =  this._private.boundaries[xy].end;
      }
      else {
        scrollTarget[xy] = position[xy];
      }
    });

    return scrollTarget;
  }
}
