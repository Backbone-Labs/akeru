/* global Module, command, UTF8ToString, HEAPU8, timer_callback: writable */
// eslint-disable-next-line no-unused-vars -- The compiled upstream loader reads this assigned callback.
/* global savefile_read_callback: writable */
/* Runs inside the compiled upstream frontend scope. No direct persistent storage. */
Module.postRun = [
  function () {
    var paused = false;
    window.tathamEngine = {
      key: function (keyName, shift) {
        if (paused) return;
        var code =
          {
            Enter: 13,
            ' ': 32,
            ArrowLeft: 37,
            ArrowUp: 38,
            ArrowRight: 39,
            ArrowDown: 40,
            Backspace: 8,
          }[keyName] || keyName.charCodeAt(0);
        Module.cwrap('key', 'boolean', [
          'number',
          'string',
          'string',
          'number',
          'number',
          'number',
        ])(code, keyName, keyName, 0, shift ? 1 : 0, 0);
      },
      pointer: function (kind, x, y, button) {
        if (!paused)
          Module.cwrap(kind, 'boolean', ['number', 'number', 'number'])(
            x,
            y,
            button,
          );
      },
      command: function (id) {
        if (!paused) command(id);
      },
      save: function () {
        var p = Module._get_save_file();
        var s = UTF8ToString(p);
        Module._free_save_file(p);
        return s;
      },
      load: function (text) {
        var bytes = new TextEncoder().encode(text),
          pos = 0;
        savefile_read_callback = function (buf, len) {
          if (pos + len > bytes.length) return false;
          HEAPU8.set(bytes.subarray(pos, pos + len), buf);
          pos += len;
          return true;
        };
        // The original synchronous loader reports validation failures through
        // its error-box callback. Convert those into host-visible failures so
        // corrupt progress cannot later be silently overwritten.
        var originalAlert = window.alert,
          loadError = null;
        window.alert = function (message) {
          loadError = String(message);
        };
        try {
          Module._load_game();
        } finally {
          savefile_read_callback = null;
          window.alert = originalAlert;
        }
        if (loadError !== null)
          throw new Error('Invalid upstream save: ' + loadError);
      },
      pause: function (value) {
        paused = value;
      },
      ready: true,
    };
    var originalTimer = timer_callback;
    timer_callback = function (elapsed) {
      if (!paused) originalTimer(elapsed);
    };
    dispatchEvent(new Event('tatham-ready'));
  },
];
