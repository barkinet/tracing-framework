# Options

Options for the various components are specified in a key-value hash. Each
component uses a unique namespace that allows the same options store to be used
for all of them.

Users of each component can specify options when creating the component but are
not allowed to change them once the component is initialized. Some components
have the ability to change their options at runtime but this is an opt-in
behavior.

## Extensions

### wtf.extensions

An array of extension manifest URLs. These extensions will be either injected or
loaded at runtime and can provide tracing or visualization functionality.

## Tracing

Tracing options change the behavior of the core tracing library and
instrumentation providers. They can be specified as a value to the
`wtf.trace.start` method or by the global override object `wtf_trace_options`.

### wtf.trace.mode

The target mode for tracing.

* `snapshotting`: click to take a snapshot and open it in the UI or save to a
file.
* `streaming`: stream all events to the UI or a file.

### wtf.trace.target

A string value indicating the target for the tracing session.

Supported targets:

* `null`: used for testing, a black hole.
* `http[s]://host:port/path`: an HTTP(S) endpoint to receive POSTS.
* `file://filename_prefix`: a local saved file with the given prefix.
* Custom objects: see below.

#### Custom Objects

To programmatically receive written data you can pass an object. This object
must contain a `write` method and may optionally contain `flush` and `close`
methods.

* `write(Uint8Array|Array, length)`: write the given bytes up to the provided
  length (do not trust the array length).
* `flush()`: write any pending data, if required.
* `close()`: the stream is closed and no more data will be written.

### wtf.trace.session.bufferSize

Individual trace buffer size, in bytes. The larger the size the less overhead
there will be while recording traces but the larger the latency when writing
the data over the network.

### wtf.trace.session.maximumMemoryUsage

Maximum tracing buffer memory usage, in bytes. This, combined with
`wtf.trace.session.bufferSize`, is used to determine how many buffers will be
created. The larger the value the more events can be recorded and the less
likely it is that data will be dropped, at the cost of extra memory.

### wtf.trace.snapshotting.resetOnSnapshot

True to reset all buffer data when a snapshot occurs, otherwise data will be retained across snapshots. This can be used ensure only tracing data that
occurred since the last snapshot is written.

### wtf.trace.streaming.flushIntervalMs

The frequency, in milliseconds, to flush data buffers or 0 to prevent automatic
flushing.

### wtf.trace.provider.*

Each event provider can be toggled here to allow for the choice of which kind
of events to include in the stream or the fidelity of the events added.

#### wtf.trace.provider.javascript

Set `wtf.trace.provider.javascript` to 1+ to enable the events. This will
use a variety of means to attempt to gather javascript runtime events, such as
garbage collections, JIT activity, etc. This functionality relies on the
injector extension or custom builds of Chromium.

## HUD

HUD options pertain only to the overlay used in browser-based injected runs.
They can be specified as a value passed to `wtf.hud.show` or by the global
override object `wtf_hud_options`.

### wtf.hud.dock

Docking position of the HUD overlay. May be one of:

* `tl`: Top Left.
* `tr`: Top Right.
* `bl`: Bottom Left.
* `br`: Bottom Right.

### wtf.hud.app.mode/wtf.hud.app.endpoint

The mode used for communicating with the visualizer application. May be one of:

* `page`: If set, `wtf.hud.app.endpoint` is a URL to the page that will be
opened in a new window.
* `remote`: If set, `wtf.hud.app.endpoint` is a `host:port` of a target HTTP server that will listen for POSTs.

## App

App options are only used by the app UI. They can be specified to the
`wtf.app.ui.show` call or by the global override object `wtf_app_ui_options`.
