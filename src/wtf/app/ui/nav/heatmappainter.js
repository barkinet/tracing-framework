/**
 * Copyright 2012 Google, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @fileoverview Heatmap painter for the framebar control.
 *
 * @author benvanik@google.com (Ben Vanik)
 */

goog.provide('wtf.app.ui.nav.HeatmapPainter');

goog.require('goog.asserts');
goog.require('goog.async.Deferred');
goog.require('goog.async.DeferredList');
goog.require('wtf.math');
goog.require('wtf.ui.TimeRangePainter');



/**
 * Heatmap painter.
 * @param {!HTMLCanvasElement} canvas Canvas element.
 * @param {!wtf.analysis.db.EventDatabase} db Database.
 * @constructor
 * @extends {wtf.ui.TimeRangePainter}
 */
wtf.app.ui.nav.HeatmapPainter = function(canvas, db) {
  goog.base(this, canvas);

  /**
   * Database.
   * @type {!wtf.analysis.db.EventDatabase}
   * @private
   */
  this.db_ = db;

  /**
   * Frame event index.
   * Each event should indicate the start of a new frame.
   * Only valid once it has been created and the control readied.
   * @type {!Array.<!wtf.app.ui.nav.HeatmapPainter.Bar_>}
   * @private
   */
  this.bars_ = [];

  // TODO(benvanik): pull from profile
  this.bars_.push(new wtf.app.ui.nav.HeatmapPainter.Bar_(db, 'scopes', [
    'wtf.scope.leave'
  ]));
  this.bars_.push(new wtf.app.ui.nav.HeatmapPainter.Bar_(db, 'branches', [
    'wtf.flow.branch'
  ]));
  this.bars_.push(new wtf.app.ui.nav.HeatmapPainter.Bar_(db, 'GCs', [
    'javascript#gc'
  ]));

  var deferreds = [];
  for (var n = 0; n < this.bars_.length; n++) {
    var color = wtf.app.ui.nav.HeatmapPainter.BAR_COLORS_[n];
    deferreds.push(this.bars_[n].prepare(color));
  }

  this.setReady(false);
  new goog.async.DeferredList(deferreds).addCallbacks(
      function() {
        // Ready and redraw.
        this.setReady(true);
      },
      function(arg) {
        // Failued to create indices.
      }, this);
};
goog.inherits(wtf.app.ui.nav.HeatmapPainter, wtf.ui.TimeRangePainter);


/**
 * @override
 */
wtf.app.ui.nav.HeatmapPainter.prototype.repaintInternal = function(
    ctx, width, height) {
  var timeLeft = this.timeLeft;
  var timeRight = this.timeRight;
  if (!(timeRight - timeLeft)) {
    return;
  }

  var h = Math.floor(0.5 * (height - 16));
  var y = 16 + h;

  // Background.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(0, y, width, h);

  // Draw heatmap bars.
  var barY = y;
  var barHeight = h / this.bars_.length;
  for (var n = 0; n < this.bars_.length; n++) {
    var bar = this.bars_[n];
    bar.draw(
        ctx, width, height, barY, barHeight, timeLeft, timeRight);
    barY += barHeight;
  }
};


/**
 * Palette for bar colors.
 * @type {!Array.<string>}
 * @const
 * @private
 */
wtf.app.ui.nav.HeatmapPainter.BAR_COLORS_ = [
  // TODO(benvanik): prettier colors - these are from chrome://tracing
  'rgb(138,113,152)',
  'rgb(175,112,133)',
  'rgb(127,135,225)',
  'rgb(93,81,137)',
  'rgb(116,143,119)',
  'rgb(178,214,122)'
];



/**
 * Heatmap painter event bar.
 * @param {!wtf.analysis.db.EventDatabase} db Database.
 * @param {string} name Bar name, used in the overlay.
 * @param {!Array.<string>} eventTypes List of event type names.
 * @constructor
 * @private
 */
wtf.app.ui.nav.HeatmapPainter.Bar_ = function(db, name, eventTypes) {
  /**
   * Database.
   * @type {!wtf.analysis.db.EventDatabase}
   * @private
   */
  this.db_ = db;

  /**
   * Bar name.
   * @type {string}
   * @private
   */
  this.name_ = name;

  /**
   * Event types this bar displays.
   * @type {!Array.<string>}
   * @private
   */
  this.eventTypes_ = eventTypes;

  /**
   * Loaded indicies.
   * @type {!Array.<!wtf.analysis.db.EventIndex>}
   * @private
   */
  this.indicies_ = [];

  /**
   * Color used when drawing the bar.
   * @type {string}
   * @private
   */
  this.color_ = 'rgb(0,0,0)';

  /**
   * Cached buckets, in order.
   * This is used to prevent reallocating the list every frame. Whenever the
   * number of buckets changes it must be reallocated.
   * @type {!Float32Array}
   * @private
   */
  this.cachedBuckets_ = new Float32Array(0);
};


/**
 * Prepares the bar for use.
 * @param {string} color Color used to draw the bar.
 * @return {!goog.async.Deferred} A deferred fulfilled when the bar is ready
 *     to draw.
 */
wtf.app.ui.nav.HeatmapPainter.Bar_.prototype.prepare = function(color) {
  this.color_ = color;

  var deferreds = [];
  for (var n = 0; n < this.eventTypes_.length; n++) {
    deferreds.push(this.db_.createEventIndex(this.eventTypes_[n]));
  }

  var readyDeferred = new goog.async.Deferred();
  new goog.async.DeferredList(deferreds).addCallbacks(
      function() {
        for (var n = 0; n < this.eventTypes_.length; n++) {
          var index = this.db_.getEventIndex(this.eventTypes_[n]);
          goog.asserts.assert(index);
          this.indicies_.push(index);
        }
        readyDeferred.callback(null);
      },
      function(arg) {
        readyDeferred.errback(arg);
      }, this);
  return readyDeferred;
};


/**
 * Draws the bar.
 * @param {!CanvasRenderingContext2D} ctx Target canvas context.
 * @param {number} width Canvas width, in pixels.
 * @param {number} height Canvas height, in pixels.
 * @param {number} y Bar Y offset, in pixels.
 * @param {number} h Bar height, in pixels.
 * @param {number} timeLeft Left-most time.
 * @param {number} timeRight Right-most time.
 */
wtf.app.ui.nav.HeatmapPainter.Bar_.prototype.draw = function(
    ctx, width, height, y, h, timeLeft, timeRight) {
  // We use a bucket size that is an integral power of 2 in ms. So .5ms, 1ms,
  // 8ms, etc. We choose the power of 2 such that the screen size width of a
  // bucket is between 6 and 12 pixels. With this scheme we get relatively
  // smooth transitions during zoom since buckets cleanly split or join by
  // factors 2 instead having data slide between neighboring buckets (which
  // can flicker).
//  var pixelsPerMs = width / (timeRight - timeLeft);
//  var minBucketWidthPx = 6;
  // This is the bucket duration we would use for exactly 6px bucket
  // width.
//  var unsnappedBucketDuration = minBucketWidthPx / pixelsPerMs;
  // Now snap that to a greater of equal integral power of 2.
//  var log2 = Math.log(unsnappedBucketDuration) / Math.LN2;
//  var bucketDuration = Math.pow(2, Math.ceil(log2));
  var bucketWidth = 2; //bucketDuration * pixelsPerMs;

  var buckets = this.cachedBuckets_;
  var bucketCount = Math.ceil(width / bucketWidth) + 1;
  if (buckets.length != bucketCount) {
    buckets = this.cachedBuckets_ = new Float32Array(bucketCount);
  } else {
    for (var n = 0; n < buckets.length; n++) {
      buckets[n] = 0;
    }
  }

  var bucketTimeLeft = timeLeft; // - timeLeft % bucketDuration;
  var bucketTimeRight = timeRight; //bucketTimeLeft + bucketDuration * bucketCount;
  var bucketLeft = 0; //wtf.math.remap(
      //bucketTimeLeft, timeLeft, timeRight, 0, width);

  for (var n = 0; n < this.indicies_.length; n++) {
    var index = this.indicies_[n];
    index.forEach(bucketTimeLeft, bucketTimeRight, function(e) {
      var mid, weight;
      if (e.scope) {
        var start = e.scope.getEnterEvent().time;
        var end = e.scope.getLeaveEvent().time;
        mid = (start + end) / 2;
        weight = (end - start);
      } else {
        mid = e.time;
        weight = 1;
      }
  //    var bucketIndex = Math.floor((mid - bucketTimeLeft) / bucketDuration);
  var bucketIndex= Math.floor(wtf.math.remap(mid, timeLeft, timeRight, 0, width / bucketWidth));
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        var bucketValue = buckets[bucketIndex];
        bucketValue += weight;
        buckets[bucketIndex] = bucketValue;
      }
    }, this);
  }

  uniform_blur(buckets, new Array(7));
  uniform_blur(buckets, new Array(7));
  uniform_blur(buckets, new Array(7));

  var bucketMax = 0;
  for (var n = 0; n < buckets.length; n++) {
    if (buckets[n] > bucketMax) {
      bucketMax = buckets[n];
    }
  }

  //ctx.fillStyle = this.color_;
  var bucketTime = bucketTimeLeft;
  var rectLeft = wtf.math.remap(bucketTime, timeLeft, timeRight, 0, width);
  for (var n = 0; n < buckets.length; n++) {
    var value = buckets[n] / bucketMax;
    if (value) {
      var bx = rectLeft; //wtf.math.remap(bucketTime, timeLeft, timeRight, 0, width);
      //ctx.globalAlpha = value;
      ctx.fillStyle = heatmap_color(value);
      ctx.fillRect(bx, y, bucketWidth, h);
    }

    //bucketTime += bucketDuration;
    rectLeft += bucketWidth;
  }

  var nameHeight = 16;
  if (h > nameHeight + 4) {
    ctx.globalAlpha = 0.4;
    ctx.font = nameHeight + 'px bold verdana, sans-serif';
    var textSize = ctx.measureText(this.name_);
    ctx.fillStyle = '#000000';
    ctx.fillText(this.name_, 4, y + h - 4);
  }

  ctx.globalAlpha = 1;
};

// returns a color where:
//   0: transparent blue
//   .25: solid blue
//   .75: solid green
//   1: solid red
function heatmap_color(val) {
  if (val < .25) {
    return 'rgba(0,0,255,' + (val * 4) + ')';
  } else if (val < .75) {
    var g = Math.floor(255 * 2 * (val - .25));
    return 'rgba(0,' + g + ',' + (255 - g) + ',1)';
  } else {
    var r = Math.floor(255 * 4 * (val - .75));
    return 'rgba(' + r + ',' + (255 - r) + ',0,1)';
  }
}

function uniform_blur(A, b) {
  var aLen = A.length;
  var bLen = b.length;
  var mid = (bLen - 1) / 2;
  var sum = 0;
  for (var i = 0; i < aLen + mid; i++) {
    var j = i % bLen;
    var oldVal = (i >= bLen) ? b[j] : 0;
    var newVal = (i < aLen) ? A[i] : 0;
    sum -= oldVal;
    b[j] = newVal;
    sum += newVal;
    A[i - mid] = sum / bLen;
  }
  /*
  for (var i = 0; i < bLen; i++) {
    b[i] = 0;
  }
  for (var i = 0; i < mid; i++) {
    b[i] = A[i];
    sum += b[i];
  }
  for (var i = mid; i < aLen; i++) {
    var j = i % bLen;
    sum -= b[j];
    b[j] = A[i];
    sum += A[i];
    A[i - mid] = sum / bLen;
  }
  for (var i = aLen; i < aLen + mid; i++) {
    var j = i % bLen;
    sum -= b[j];
    A[i - mid] = sum / bLen;
  }
  */
}

