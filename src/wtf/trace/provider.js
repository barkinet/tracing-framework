/**
 * Copyright 2012 Google, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @fileoverview Recording session event provider extension.
 *
 * @author benvanik@google.com (Ben Vanik)
 */

goog.provide('wtf.trace.Provider');

goog.require('goog.Disposable');



/**
 * Abstract provider type for extensions to add events to the stream.
 *
 * @constructor
 * @extends {goog.Disposable}
 */
wtf.trace.Provider = function() {
  goog.base(this);

  /**
   * A list of injections performed by this provider.
   * Used to restore injections to their previous values.
   * @type {!Array.<{target:!Object, name:string, original:!Function}>}
   * @private
   */
  this.injections_ = [];
};
goog.inherits(wtf.trace.Provider, goog.Disposable);


/**
 * @override
 */
wtf.trace.Provider.prototype.disposeInternal = function() {
  // Restore all injections.
  for (var n = 0; n < this.injections_.length; n++) {
    var injection = this.injections_[n];
    injection.target[injection.name] = injection.original;
  }

  goog.base(this, 'disposeInternal');
};


/**
 * Injects a new function in place of an old one.
 * @param {!Object} target Target object.
 * @param {string} name Member name.
 * @param {!Function} value New value.
 * @protected
 */
wtf.trace.Provider.prototype.injectFunction = function(target, name, value) {
  var original = target[name];
  this.injections_.push({
    target: target,
    name: name,
    original: original
  });
  target[name] = value;
  value['raw'] = original;
};
