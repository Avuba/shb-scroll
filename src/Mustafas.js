import { default as Wegbier } from '../node_modules/wegbier/dist/Wegbier.js';
import { default as fUtils } from './fUtils/index.js';
import { default as utils } from './utils.js';


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

    // speed for animated scrolling, in px/frame
    maxScrollPxPerFrame: 50,

    // the distance in px from the target position, at which animated scroll starts slowing down
    scrollToSlowingDistance: 300
  },

  private: {
    wegbier: null,
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
  }
};


export default class Mustafas {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    if (config) fUtils.mergeDeep(this._config, config);
    this._private.axis = this._config.axis.split('');

    // mustafa needs an actual DOMNode as moveable, whereas wegbier needs an area.
    let configWegbier = fUtils.cloneDeep(defaults.config);
    if (config) fUtils.mergeDeep(configWegbier, this._config);
    configWegbier.moveable = this._getMoveableSize();

    this._private.wegbier = new Wegbier(configWegbier);

    this._calculatePositionLimits();
    this._bindAnimatedScroll();
    this._bindEvents();
  }


  // PUBLIC


  resize() {
    this._calculatePositionLimits();

    let configWegbier = { moveable: this._getMoveableSize() };
    this._private.wegbier.refresh(configWegbier);
  }


  getScrollPosition() {
    return { left: this._private.position.x, top: this._private.position.y };
  }


  scrollTo(left, top, shouldAnimate, scrollSpeed) {
    console.log("scrollTo() " + left + "," + top);
    if (this._private.isScrollFrozen) return;

    if (this._private.animatedScroll.isAnimatedScrolling) {
      this._stopAnimatedScroll();
    }

    if (shouldAnimate) {
      this._startAnimatedScroll( { x: left, y: top }, scrollSpeed );
    }
    else {
      this._private.wegbier.scrollTo( { x: left, y: top } );
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
    this._private.wegbier.destroy();
    this._config.container = null;
    this._config.moveable = null;
  };


  // LIFECYCLE


  _calculatePositionLimits() {
    let boundaries = this._private.wegbier.getBoundaries();
    this._private.positionLimits.x = boundaries.x.axisEnd;
    this._private.positionLimits.y = boundaries.y.axisEnd;
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
    console.log("_startAnimatedScroll " + targetPosition.x + "," + targetPosition.y);
    let animatedScroll = this._private.animatedScroll;

    cancelAnimationFrame(this._private.currentFrame);

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
    if (distanceToTarget < 1) {
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
