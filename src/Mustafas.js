import { default as Wegbier } from '../node_modules/wegbier/dist/Wegbier.js';

export default class Mustafas {
  constructor(config) {
    this._private = {
      container: config.container,
      scrollable: config.scrollable
    };

    // TODO should make a member _config and modify that one
    config.moveable = {
      width: this._private.scrollable.clientWidth,
      height: this._private.scrollable.clientHeight
    };

    this._private.wegbier = new Wegbier(config);

    this._bindEvents();
  }


  // PUBLIC

  destroy() {
    this._unbindEvents();
    this._private.wegbier.destroy();
    this._private.container = null;
    this._private.scrollable = null;
  };

  // LIFECYCLE


  _bindEvents() {
    this._private.boundHandlers = {
      positionChanged: this._onPositionChanged.bind(this)
    };

    fUtils.forEach(this._private.boundHandlers, (handler, event) => {
      this._private.wegbier.addEventListener(event, handler);
    });
  }


  _unbindEvents() {
    fUtils.forEach(this._private.boundHandlers, (handler, event) => {
      this._private.scrollable.removeEventListener(event, handler);
    });
  }


  _onPositionChanged(event) {
    console.log("moveable pos: (" + event.detail.x + "," + event.detail.y + ")");
    this._private.scrollable.style.webkitTransform = 'translate3d(' + event.detail.x + 'px, ' + event.detail.y + 'px, 0px)';
  }
};
