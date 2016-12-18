import { default as utils } from './utils/utils';
import { default as ease } from './utils/ease';
import { default as lodash } from './utils/lodash';
// TODO: import via npm as soon as available
import { default as ShbTouch } from './vendor/ShbTouch';
import { default as Momentum } from './Momentum';
import { default as Animate } from './Animate';


let defaults = {
  config: {
    // main container, direct parent of the moveable
    container: null,

    // the scrollable DOM node. can also be a plain object with the parameters { width, height,
    // left, top }. for the later case, ShbScroll will only send out events without DOM manipulation
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

    // testing
    pullToRefresh: false,

    // testing
    pullToRefreshOverscroll: 100,

    // testing
    pullToRefreshMargin: 50,

    // NOTE: please take a look at the config objects inside ShbTouch.js, Animate.js and Momentum.js
    // regarding what other possible config parameters can be passed
  },

  private: {
    axis: ['x', 'y'],
    container: {
      width: 0,
      height: 0,
    },
    moveable: {
      width: 0,
      height: 0,
      x: {
        position: 0, // in pixels
        progress: 0, // in percent
        overscroll: 0, // in pixels
        overscrollDirection: 0, // 1 or -1
        overscrollPull: 0 // in percent
      },
      y: {
        position: 0,
        progress: 0,
        overscroll: 0,
        overscrollDirection: 0,
        overscrollPull: 0
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
    isPullToRefreshActive: false,
    isAbstractMoveable: false,
    isAnimatingOnAxis: {
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
  positionStable: 'positionStable',
  startPullToRefresh: 'startPullToRefresh'
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
    // fires a "positionChange" event with an absolute position
    this.animate = new Animate(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);
    this._bindEvents();

    requestAnimationFrame(() => {
      this._setupDomElements();
      this._calculateParams();
    });
  }


  // PUBLIC


  scrollTo(position, animateTime) {
    this.momentum.stop();
    this.animate.stop();

    let scrollTarget = this._getScrollTarget(position);

    if (animateTime) {
      this._forXY((xy) => {
        this.animate.startOnAxis(xy, this._private.moveable[xy].position, scrollTarget[xy], animateTime, 'easeInOutCubic');
      });
    }
    else {
      requestAnimationFrame(() => this._updateMoveablePosition(scrollTarget));
    }
  }


  scrollBy(position, animateTime) {
    let { x = 0, y = 0 } = position;

    this.scrollTo({
      x: this._private.moveable.x.position + x,
      y: this._private.moveable.y.position + y,
    }, animateTime);
  }


  scrollTop(animateTime) {
    this.scrollTo(this._private.moveable.x.position, this._private.boundaries.y.start, animateTime);
  }


  scrollBottom(animateTime) {
    this.scrollTo(this._private.moveable.x.position, this._private.boundaries.y.end, animateTime);
  }


  stopPullToRefresh() {
    this._state.isPullToRefreshActive = false;
    this._checkForBounceStart();
  }


  disableScrolling(isDisabled) {
    this.momentum.stop();
    this.animate.stop();
    this.shbTouch.disableScrolling(isDisabled);
  }


  refresh() {
    requestAnimationFrame(() => this._calculateParams());
  }


  destroy() {
    this._unbindEvents();
    this.shbTouch.destroy();

    this.momentum.stop();
    this.animate.stop();

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

    this._private.boundAnimateHandlers = {
      animateStartOnAxis: this._onAnimateStartOnAxis.bind(this),
      animatePositionChange: this._onAnimatePositionChange.bind(this),
      animateEnd: this._checkForPositionStable.bind(this),
      animateEndOnAxis: this._onAnimateEndOnAxis.bind(this)
    };

    lodash.forEach(this._private.boundAnimateHandlers, (handler, eventName) => {
      this.animate.addEventListener(eventName, handler);
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

    lodash.forEach(this._private.boundAnimateHandlers, (handler, eventName) => {
      this.animate.removeEventListener(eventName, handler);
    });

    lodash.forEach(this._private.boundMomentumHandlers, (handler, eventName) => {
      this.momentum.removeEventListener(eventName, handler);
    });

    if (this._private.boundDebouncedRefresh) {
      window.removeEventListener('resize', this._private.boundDebouncedRefresh);
    }
  }


  _setupDomElements() {
    // attributes requried by the container
    this._config.container.style.overflow = 'hidden';

    if (this._config.moveable instanceof HTMLElement) {
      // attributes requried by the moveable
      this._config.moveable.style.position = 'absolute';
      this._config.moveable.style.left = '0px';
      this._config.moveable.style.top = '0px';
      this._config.moveable.style.webkitTransform = 'translate3d(0px, 0px, 0px)';
      this._config.moveable.style.willChange = 'transform';
    }
  }


  _calculateParams() {
    if (!(this._config.moveable instanceof HTMLElement)) this._state.isAbstractMoveable = true;

    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height',
        clientDimension = xy === 'x' ? 'clientWidth' : 'clientHeight';

      this._private.container[dimension] = this._config.container[clientDimension];
      this._private.moveable[dimension] = this._config.moveable[this._state.isAbstractMoveable ? dimension : clientDimension];

      this._private.boundaries[xy].start = 0;
      this._private.boundaries[xy].end = this._private.moveable[dimension] - this._private.container[dimension];

      // in case the moveable is smaller than the container, the only "stable" end position is 0
      if (this._private.boundaries[xy].end < 0) this._private.boundaries[xy].end = 0;
    });

    // abstract moveables may have left/top position values that are not 0 (in opposition to DOM
    // moveables, which get set to left/top = 0 when calling '_setupDomElements()'). calling
    // '_updateMoveablePosition()' once adjusts all internally stored values
    if (this._state.isAbstractMoveable) {
      this._updateMoveablePosition({ x: this._config.moveable.left, y: this._config.moveable.top });
    }
  }


  // EVENT HANDLERS


  _onTouchStart(event) {
    this._state.isTouchActive = true;
    this.momentum.stop();
    this.animate.stop();
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

      // overscrolling is allowed
      if (this._config.overscroll) {
        // - reduce the push by a linear factor of the distance. the further the overscroll, the
        // smaller the push
        // - additionally, the multiplier only gets applied when increasing the overscroll distance
        if (this._private.moveable[xy].overscroll > 0
            && pushBy[xy].direction === this._private.moveable[xy].overscrollDirection) {

          // for non-touch pushes (e.g. momentum pushes) we use a smaller maximum overscroll
          let maxOverscroll = this._state.isTouchActive ? this._config.maxTouchOverscroll : this._config.maxMomentumOverscroll,
            multiplier = ease.easeLinear(this._private.moveable[xy].overscroll, 1, -1, maxOverscroll);

          pxToAdd *= multiplier;

          // we stop momentum when it becomes too slow so the bounce animation can kick in
          if (this._state.isMomentumOnAxis[xy]
              && (multiplier < this._config.minMomentumMultiplier || Math.abs(pxToAdd) < this._config.minMomentumPush)) {
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
    if (this._state.isPullToRefreshActive) this.dispatchEvent(new Event(events.startPullToRefresh));

    this._checkForBounceStart();
    this._checkForPositionStable();
  }


  _onTouchEndWithMomentum(event) {
    this._forXY((xy) => {
      if (this._private.moveable[xy].overscrollDirection === 0) {
        this.momentum.startOnAxis(xy, event.data[xy]);
      }
    });
  }


  _onMomentumStartOnAxis(event) {
    this._state.isMomentumOnAxis[event.data.axis] = true;
  }


  _onMomentumEndOnAxis(event) {
    this._state.isMomentumOnAxis[event.data.axis] = false;
    this._checkForBounceStartOnAxis(event.data.axis);
  }


  _onAnimateStartOnAxis(event) {
    this._state.isAnimatingOnAxis[event.data.axis] = true;
  }


  _onAnimatePositionChange(event) {
    // we only care about the position update of the axis where animate is actually active. this
    // enables us to run Animate and Momentum at the same time
    let newPosition = {
      x: this._state.isAnimatingOnAxis.x ? event.data.x : this._private.moveable.x.position,
      y: this._state.isAnimatingOnAxis.y ? event.data.y : this._private.moveable.y.position
    };

    this._updateMoveablePosition(newPosition);
  }


  _onAnimateEndOnAxis(event) {
    this._state.isAnimatingOnAxis[event.data.axis] = false;
  }


  // CONDITION CHECKERS


  _checkForBounceStart() {
    this._forXY((xy) => {
      this._checkForBounceStartOnAxis(xy);
    });
  }


  _checkForBounceStartOnAxis(axis) {
    if (this._state.isTouchActive
        || this._state.isAnimatingOnAxis[axis]
        || this._state.isMomentumOnAxis[axis]
        || this._private.moveable[axis].overscrollDirection === 0) return;

    let scrollTarget = this._private.moveable[axis].overscrollDirection > 0 ? this._private.boundaries[axis].start : this._private.boundaries[axis].end;
    if (this._state.isPullToRefreshActive) scrollTarget -= this._config.pullToRefreshMargin * this._private.moveable[axis].overscrollDirection;

    this.animate.startOnAxis(axis, this._private.moveable[axis].position, scrollTarget);
  }


  _checkForPositionStable() {
    if (this._state.isTouchActive
        || this._state.isAnimatingOnAxis.x || this._state.isAnimatingOnAxis.y
        || this._state.isMomentumOnAxis.x || this._state.isMomentumOnAxis.y) return;

    let eventData = {
      isTouchActive: this._state.isTouchActive,
      x: Object.assign({}, this._private.moveable.x),
      y: Object.assign({}, this._private.moveable.y)
    };

    this.dispatchEvent(new Event(events.positionStable), eventData);
  }


  // MOVEMENT AND POSITIONING


  _updateMoveablePosition(newPosition) {
    let positionHasChanged = false;

    this._forXY((xy) => {
      if (this._config.overscroll) {
        // overscrolling on axis start (left or top)
        if (newPosition[xy] < this._private.boundaries[xy].start) {
          this._private.moveable[xy].overscroll = this._private.boundaries[xy].start - newPosition[xy];
          this._private.moveable[xy].overscrollDirection = 1;
        }
        // overscrolling on axis start (right or bottom)
        else if (newPosition[xy] > this._private.boundaries[xy].end) {
          this._private.moveable[xy].overscroll = newPosition[xy] - this._private.boundaries[xy].end;
          this._private.moveable[xy].overscrollDirection = -1;
        }
        // no overscrolling
        else {
          this._private.moveable[xy].overscroll = 0;
          this._private.moveable[xy].overscrollDirection = 0;
        }

        // multiplication by 1.1 is required as the "1" might never be reached otherwise
        this._private.moveable[xy].overscrollPull = Math.min(Math.max(this._private.moveable[xy].overscroll * 1.1 / this._config.pullToRefreshOverscroll, 0), 1);

        // once isPullToRefreshActive is true, it can only be unset by stopPullToRefresh()
        if (this._config.pullToRefresh
            && this._state.isTouchActive
            && this._private.moveable[xy].overscrollPull >= 1) {
          this._state.isPullToRefreshActive = true;
        }
      }

      if (this._private.moveable[xy].position !== newPosition[xy]) {
        this._private.moveable[xy].position = newPosition[xy];
        positionHasChanged = true;

        if (this._private.boundaries[xy].end > 0) {
          this._private.moveable[xy].progress = this._private.moveable[xy].position / this._private.boundaries[xy].end;
        }
        else {
          this._private.moveable[xy].progress = 1;
        }
      }
    });

    if (positionHasChanged) {
      if (!this._state.isAbstractMoveable) this._updateMoveableNodePosition();

      let eventData = {
        isTouchActive: this._state.isTouchActive,
        x: Object.assign({}, this._private.moveable.x),
        y: Object.assign({}, this._private.moveable.y)
      };

      this.dispatchEvent(new Event(events.positionChange), eventData);
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
      if (position[xy] === undefined) {
        scrollTarget[xy] = this._private.moveable[xy].position;
      }
      else if (position[xy] <  this._private.boundaries[xy].start) {
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
