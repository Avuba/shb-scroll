import { default as Kotti } from '../node_modules/kotti/dist/Kotti.js';
import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';
import { default as Bounce } from './Bounce.js';


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

    // speed for animated scrolling, in px/frame
    maxScrollPxPerFrame: 50,

    // minimum speed for animated scrolling, under which animated scrolling stops
    minScrollPxPerFrame: 0.2,

    // how much time (in msec) it takes to bounce back
    bounceTime: 500,

    // how much time (in msec) it takes to animate-scroll
    scrollTime: 500
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
    overscroll: {
      x: {
        isAxisStart: false,
        isAxisEnd: false,
        px: 0
      },
      y: {
        isAxisStart: false,
        isAxisEnd: false,
        px: 0
      }
    },
    isBouncingOnAxis: { x: false, y: false },
    axis: ['x']
    /*
    boundHandlers: {},
    axis: ['x', 'y'],
    position: { x: 0, y: 0 },
    positionLimits: { x: 0, y: 0},
    isScrollFrozen: false,
    animatedScroll: {
      isAnimatedScrolling: false,
      pxPerFrame: 0,
      maxPxPerFrame: 0,
      direction: {
        radians: 0,
        x: 0,         // component weight in x, effectively cos(radians)
        y: 0          // component weight in y, effectively sin(radians)
      },
      startingPosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      totalDistance: 0
    }
    */
  },

  state: {
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
    this._state = fUtils.cloneDeep(defaults.state);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    this.kotti = new Kotti(this._config);
    this.bounce = new Bounce(this._config);

    this.events = events;
    utils.addEventTargetInterface(this);

    this._calculateParams();
    this._bindEvents();
  }


  // PUBLIC


  refresh(config) {
    if (config) fUtils.mergeDeep(this._config, config);

    this._calculateParams();
  }


  getScrollPosition() {
    return { left: this._private.position.x, top: this._private.position.y };
  }


  scrollTo(left, top, shouldAnimate, scrollSpeed) {
    if (this._private.isScrollFrozen) return;

    if (this._private.animatedScroll.isAnimatedScrolling) {
      this._stopAnimatedScroll();
    }

    if (shouldAnimate) {
      this._startAnimatedScroll( { x: left, y: top }, scrollSpeed );
    }
    else {
      this._setWegbierPosition( { x: left, y: top } );
    }
  }


  scrollBy(left, top, shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x +left, this._private.position.x +top, shouldAnimate, scrollSpeed);
  }


  scrollTop(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x, 0, shouldAnimate, scrollSpeed);
  }


  scrollBottom(shouldAnimate, scrollSpeed) {
    this.scrollTo(this._private.position.x, this._private.positionLimits.y, shouldAnimate, scrollSpeed);
  }


  // freezes the scroll on all axes
  freezeScroll(shouldFreeze) {
    // shouldFreeze is treated as an optional parameter defaulting to true
    this._private.isScrollFrozen = shouldFreeze === false ? false : true;

    if (this._private.isScrollFrozen && this._private.animatedScroll.isAnimatedScrolling) {
      this._stopAnimatedScroll();
    }
    this._private.wegbier.freezeScroll(shouldFreeze);
  }


  destroy() {
    this._unbindEvents();
    this.kotti.destroy();

    this._config.container = null;
    this._config.moveable = null;
  };


  // LIFECYCLE


  _calculateParams() {
    this._private.container.width = this._config.container.clientWidth;
    this._private.container.height = this._config.container.clientHeight;

    this._private.moveable.width = this._config.container.clientWidth;
    this._private.moveable.height = this._config.container.clientHeight;

    // calculate the maximum and minimum coordinates for scrolling. these are used as boundaries for
    // determining overscroll status, initiating bounce (if allowed); and also to determine bounce
    // target position when overscrolling
    this._forXY((xy) => {
      let dimension = xy === 'x' ? 'width' : 'height';
      this._private.boundaries[xy].axisStart = 0;
      this._private.boundaries[xy].axisEnd = this._private.container[dimension] - this._private.moveable[dimension];
    });
  }


  _bindEvents() {
    this._private.boundHandlersKotti = {
      touchStart: this._handleTouchStart.bind(this),
      touchEnd: this._handleTouchEnd.bind(this),
      pushBy: this._handlePushBy.bind(this),
      finishedTouchWithMomentum: this._handleMomentum.bind(this)
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
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundHandlersKotti, (handler, eventType) => {
      this.kotti.removeEventListener(this.kotti.events[eventType], handler);
    });

    fUtils.forEach(this._private.boundHandlersBounce, (handler, eventType) => {
      this.bounce.removeEventListener(this.bounce.events[eventType], handler);
    });
  }


  // EVENT HANDLERS


  _handleTouchStart() {
    this._state.isTouchActive = true;
    if (this._private.isBouncingOnAxis.x || this._private.isBouncingOnAxis.y) {
      this.bounce.stop();
    }
    // TODO stop momentum too
    if (this._private.isMomentumOnAxis.x || this._private.isMomentumOnAxis.y) {
      this.momentum.stop();
    }
  }


  _handleTouchEnd() {
    this._state.isTouchActive = false;
    this._checkForBounceStart();
  }


  _handlePushBy(event) {
    let pushBy = event.data,
      newCoordinates = {
        x: this._private.moveable.x,
        y: this._private.moveable.y
      },
      boundaries = this._private.boundaries;

    this._forXY((xy) => {
      let pxToAdd = pushBy[xy].px * pushBy[xy].direction;

      newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;

      // OVERSCROLLING IS ALLOWED

      // the further you overscroll, the smaller is the displacement; we multiply the displacement
      // by a linear factor of the overscroll distance
      if (this._config.overscroll) {
        // check on axis start (left or top)
        if (pushBy[xy].direction > 0 && this._private.moveable[xy] > boundaries[xy].axisStart) {
          pxToAdd *= utils.easeLinear(Math.abs(this._private.moveable[xy]), 1, -1, this._config.maxTouchOverscroll);
        }
        // check on axis end (right or bottom)
        else if (pushBy[xy].direction < 0 && this._private.moveable[xy] < boundaries[xy].axisEnd) {
          let rightBottom = boundaries[xy].axisEnd - this._private.moveable[xy];
          pxToAdd *= utils.easeLinear(Math.abs(rightBottom), 1, -1, this._config.maxTouchOverscroll);
        }

        newCoordinates[xy] = this._private.moveable[xy] + pxToAdd;
      }

      // OVERSCROLLING IS NOT ALLOWED

      else {
        // check on axis start (left or top)
        if (newCoordinates[xy] > boundaries[xy].axisStart)
          newCoordinates[xy] = boundaries[xy].axisStart;
        // check on axis end (right or bottom)
        else if (newCoordinates[xy] < boundaries[xy].axisEnd)
          newCoordinates[xy] = boundaries[xy].axisEnd;
      }
    });

    this._updateCoords(newCoordinates);
  }


  _handleMomentum(event) {
    let momentum = event.data;
    console.log("_handleMomentum: nuthin' John Snu");
  }


  // OLD OLD OLD


  _onPositionChanged(event) {
    this._private.position.x = event.data.x;
    this._private.position.y = event.data.y;
    this._config.moveable.style.webkitTransform = 'translate3d(' + this._private.position.x + 'px, ' + this._private.position.y + 'px, 0px)';
  }


  _setWegbierPosition(position) {
    this._private.wegbier.scrollTo(position);
  }


  // ANIMATED SCROLLING


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
    let result = { x: 0, y: 0 };

    this._forXY((xy) => {
      if (position[xy] > 0) {
        result[xy] = 0;
      }
      else if (position[xy] < this._private.positionLimits[xy]) {
        result[xy] = this._private.positionLimits[xy];
      }
      else {
        result[xy] = position[xy];
      }
    });

    return result;
  }
};
