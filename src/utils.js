let _export = {};


/**
 * getting the absolute position relative to the DOCUMENT of a DOM NODE inside
 * another css transformed DOM NODE can be tricky. this method provides a simple
 * abstraction using WebKitCSSMatrix
 *
 * inspired by: http://stackoverflow.com/questions/4975727/how-do-i-get-the-position-of-an-element-after-css3-translation-in-javascript
 */
_export.getTranslatedNodePosition = function(domNode) {
  let nodeMatrix = new WebKitCSSMatrix(getComputedStyle(domNode).webkitTransform);

  return {
    x: domNode.offsetLeft + nodeMatrix.m41,
    y: domNode.offsetTop + nodeMatrix.m42
  }
};


/**
 * stops every form of event propagation
 */
_export.stopEvent = function(event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
};


/**
  * @param {Number} t : the current time
  * @param {Number} b : the start value
  * @param {Number} c : the change in value
  * @param {Number} d : the duration time
  */
_export.easeLinear = function(t, b, c, d) {
  return c*t/d + b;
};


export default _export;
