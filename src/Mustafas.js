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
    lock: false
  },

  private: {
    wegbier: null,
    boundHandlers: {},
    axis: ['x', 'y']
  }
};

export default class Mustafas {
  constructor(config) {
    this._config = fUtils.cloneDeep(defaults.config);
    this._private = fUtils.cloneDeep(defaults.private);

    // NOTE there should always be a config, otherwise who passes the container?
    if (config) fUtils.mergeDeep(this._config, config);

    // we don't want to modify the "moveable" property of the config passed as parameter to the
    // constructor, so we create a separate config object
    let configWegbier = fUtils.cloneDeep(defaults.config);
    // NOTE there should always be a config, otherwise who passes the container?
    if (config) fUtils.mergeDeep(configWegbier, this._config);
    configWegbier.moveable = this._calculateMoveableSize();

    this._private.wegbier = new Wegbier(configWegbier);

    this._bindEvents();
  }


  // PUBLIC


  resize() {
    let configWegbier = {
      moveable: this._calculateMoveableSize()
    }
    this._private.wegbier.refresh(config);
  }


  destroy() {
    this._unbindEvents();
    this._private.wegbier.destroy();
    this._config.container = null;
    this._config.moveable = null;
  };


  // LIFECYCLE


  _calculateMoveableSize() {
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
    this._config.moveable.style.webkitTransform = 'translate3d(' + event.detail.x + 'px, ' + event.detail.y + 'px, 0px)';
  }
};
