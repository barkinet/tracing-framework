/**
 * Copyright 2012 Google, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @fileoverview Base control.
 *
 * @author benvanik@google.com (Ben Vanik)
 */

goog.provide('wtf.ui.Control');

goog.require('goog.asserts');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.events.EventHandler');
goog.require('goog.events.EventType');
goog.require('goog.style');
goog.require('wtf.events.EventEmitter');
/** @suppress {extraRequire} */
goog.require('wtf.ui.Tooltip');
goog.require('wtf.util.canvas');



/**
 * Base control.
 *
 * @param {!Element} parentElement Element to display in.
 * @param {goog.dom.DomHelper=} opt_dom DOM helper.
 * @constructor
 * @extends {wtf.events.EventEmitter}
 */
wtf.ui.Control = function(parentElement, opt_dom) {
  goog.base(this);

  /**
   * DOM helper.
   * @type {!goog.dom.DomHelper}
   * @private
   */
  this.dom_ = opt_dom || goog.dom.getDomHelper(parentElement);

  /**
   * Element that the control is displayed inside.
   * @type {!Element}
   * @private
   */
  this.parentElement_ = parentElement;

  /**
   * Root control UI.
   * @type {!Element}
   * @private
   */
  this.rootElement_ = this.createDom(this.dom_);
  goog.style.setUnselectable(this.rootElement_, true);

  /**
   * DOM elements that should be removed when this control is removed.
   * @type {!Array.<!Element>}
   * @private
   */
  this.relatedElements_ = [];

  /**
   * Event handler.
   * Lazily initialized.
   * @type {goog.events.EventHandler}
   * @private
   */
  this.eh_ = null;

  /**
   * Input event handler.
   * Makes it easier to rebind things.
   * @type {goog.events.EventHandler}
   * @private
   */
  this.inputEventHandler_ = null;

  /**
   * Tooltip set on this control, if any.
   * @type {wtf.ui.Tooltip}
   * @private
   */
  this.tooltip_ = null;

  /**
   * Root paint context, if created.
   * @type {wtf.ui.Painter}
   * @private
   */
  this.paintContext_ = null;

  // Add to page.
  this.enterDocument(this.parentElement_);
};
goog.inherits(wtf.ui.Control, wtf.events.EventEmitter);


/**
 * @override
 */
wtf.ui.Control.prototype.disposeInternal = function() {
  goog.dispose(this.inputEventHandler_);
  goog.dispose(this.tooltip_);
  for (var n = 0; n < this.relatedElements_.length; n++) {
    this.dom_.removeNode(this.relatedElements_[n]);
  }
  this.dom_.removeNode(this.rootElement_);
  goog.base(this, 'disposeInternal');
};


/**
 * Gets the DOM helper.
 * @return {!goog.dom.DomHelper} DOM helper.
 */
wtf.ui.Control.prototype.getDom = function() {
  return this.dom_;
};


/**
 * Gets the parent element.
 * @return {!Element} Element the control is displayed within.
 */
wtf.ui.Control.prototype.getParentElement = function() {
  return this.parentElement_;
};


/**
 * Gets the root element of the control.
 * @return {!Element} Root element of the control.
 */
wtf.ui.Control.prototype.getRootElement = function() {
  return this.rootElement_;
};


/**
 * Gets the first child element with the given class name.
 * @param {string} className CSS class name.
 * @return {!Element} Element.
 * @protected
 */
wtf.ui.Control.prototype.getChildElement = function(className) {
  var value = this.dom_.getElementByClass(className, this.rootElement_);
  goog.asserts.assert(value);
  return /** @type {!Element} */ (value);
};


/**
 * Registers a related DOM element that will be removed from the DOM when
 * this control is disposed.
 * @param {!Element} el Element to remove.
 * @protected
 */
wtf.ui.Control.prototype.addRelatedElement = function(el) {
  this.relatedElements_.push(el);
};


/**
 * Gets the event handler targetting this control.
 * @return {!goog.events.EventHandler} Event handler.
 */
wtf.ui.Control.prototype.getHandler = function() {
  if (!this.eh_) {
    this.eh_ = new goog.events.EventHandler(this);
    this.registerDisposable(this.eh_);
  }
  return this.eh_;
};


/**
 * Creates the control UI DOM.
 * @param {!goog.dom.DomHelper} dom DOM helper.
 * @return {!Element} Control UI.
 * @protected
 */
wtf.ui.Control.prototype.createDom = goog.abstractMethod;


/**
 * Adds the DOM tree into the document.
 * @param {!Element} parentElement Parent DOM element.
 * @protected
 */
wtf.ui.Control.prototype.enterDocument = function(parentElement) {
  this.dom_.appendChild(this.parentElement_, this.rootElement_);
};


/**
 * Toggles a button enabled or disabled.
 * @param {string} cssName CSS name of the button.
 * @param {boolean} enabled Whether the button is enabled.
 * @protected
 */
wtf.ui.Control.prototype.toggleButton = function(cssName, enabled) {
  var el = this.dom_.getElementByClass(cssName, this.getRootElement());
  if (el) {
    goog.dom.classes.enable(el, goog.getCssName('kDisabled'), !enabled);
  }
};


/**
 * Toggles input events on the control root, dispatching tooltip and paint
 * events.
 * @param {boolean} value True to enable events.
 * @private
 */
wtf.ui.Control.prototype.toggleInputEvents_ = function(value) {
  if (value == !!this.inputEventHandler_) {
    return;
  }
  if (!value) {
    goog.dispose(this.inputEventHandler_);
    this.inputEventHandler_ = null;
  }

  if (!this.paintContext_) {
    return;
  }
  this.inputEventHandler_ = new goog.events.EventHandler(this);
  var canvas = this.paintContext_.getCanvas();
  var eh = this.inputEventHandler_;

  var delta = 0;
  var lastX = 0;
  var lastY = 0;

  eh.listen(
      canvas,
      goog.events.EventType.MOUSEDOWN,
      function(e) {
        lastX = lastY = delta = 0;
      });

  eh.listen(
      canvas,
      goog.events.EventType.MOUSEMOVE,
      function(e) {
        var x = e.offsetX;
        var y = e.offsetY;
        delta += Math.abs(lastX - x) + Math.abs(lastY - y);
        if (!this.paintContext_.onMouseMove(x, y) &&
            this.tooltip_) {
          var infoString = this.paintContext_.getInfoString(x, y);
          if (infoString) {
            this.tooltip_.show(e.clientX, e.clientY, infoString);
          } else {
            this.tooltip_.hide();
          }
        }
      });

  eh.listen(
      canvas,
      goog.events.EventType.MOUSEUP,
      function(e) {
        var x = e.offsetX;
        var y = e.offsetY;
        if (!e.shiftKey && delta < 4) {
          this.paintContext_.onClick(x, y);
        }
        lastX = lastY = delta = 0;
      });

  eh.listen(
      canvas,
      goog.events.EventType.MOUSEOUT,
      function(e) {
        lastX = lastY = delta = 0;
        if (this.tooltip_) {
          this.tooltip_.hide();
        }
        this.paintContext_.onMouseOut();
      });
};


/**
 * Gets the tooltip set on the control, if any.
 * @return {wtf.ui.Tooltip} Tooltip.
 */
wtf.ui.Control.prototype.getTooltip = function() {
  return this.tooltip_;
};


/**
 * Sets (or clears) the tooltip on the control.
 * @param {wtf.ui.Tooltip} value Tooltip.
 */
wtf.ui.Control.prototype.setTooltip = function(value) {
  if (value == this.tooltip_) {
    return;
  }
  goog.dispose(this.tooltip_);
  this.tooltip_ = value;
};


/**
 * Gets the root paint context, if any.
 * @return {wtf.ui.Painter} Paint context, if any.
 */
wtf.ui.Control.prototype.getPaintContext = function() {
  return this.paintContext_;
};


/**
 * Sets the root paint context.
 * This can only be called once.
 * @param {!wtf.ui.Painter} value New paint context.
 */
wtf.ui.Control.prototype.setPaintContext = function(value) {
  goog.asserts.assert(!this.paintContext_);
  if (this.paintContext_) {
    return;
  }
  this.paintContext_ = value;
  this.registerDisposable(this.paintContext_);
  this.requestRepaint();

  this.toggleInputEvents_(!!value);
};


/**
 * Requests a repaint of the control on the next rAF.
 * This should be used instead of repainting inline in JS callbacks to help
 * the browser draw things optimally. Only call repaint directly if the results
 * *must* be displayed immediately, such as in the case of a resize.
 * @protected
 */
wtf.ui.Control.prototype.requestRepaint = function() {
  if (this.paintContext_) {
    this.paintContext_.requestRepaint();
  }
};


/**
 * Repaints the control contents.
 */
wtf.ui.Control.prototype.repaint = function() {
  if (this.paintContext_) {
    this.paintContext_.repaint();
  }
};


/**
 * Updates the layout of the control.
 */
wtf.ui.Control.prototype.layout = function() {
  // Reshape the canvas.
  if (this.paintContext_) {
    var canvas = this.paintContext_.getCanvas();
    var ctx = this.paintContext_.getCanvasContext2d();
    var currentSize = goog.style.getSize(goog.dom.getParentElement(canvas));
    wtf.util.canvas.reshape(
        canvas, ctx, currentSize.width, currentSize.height);
  }

  // Custom layout logic.
  this.layoutInternal();

  // Repaint immediately to prevent flicker.
  this.repaint();
};


/**
 * Updates custom layout of the control.
 * @protected
 */
wtf.ui.Control.prototype.layoutInternal = goog.nullFunction;
