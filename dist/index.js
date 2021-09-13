// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles
parcelRequire = (function (modules, cache, entry, globalName) {
  // Save the require from previous bundle to this closure if any
  var previousRequire = typeof parcelRequire === 'function' && parcelRequire;
  var nodeRequire = typeof require === 'function' && require;

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire = typeof parcelRequire === 'function' && parcelRequire;
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        // Try the node require function if it exists.
        if (nodeRequire && typeof name === 'string') {
          return nodeRequire(name);
        }

        var err = new Error('Cannot find module \'' + name + '\'');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }

      localRequire.resolve = resolve;
      localRequire.cache = {};

      var module = cache[name] = new newRequire.Module(name);

      modules[name][0].call(module.exports, localRequire, module, module.exports, this);
    }

    return cache[name].exports;

    function localRequire(x){
      return newRequire(localRequire.resolve(x));
    }

    function resolve(x){
      return modules[name][1][x] || x;
    }
  }

  function Module(moduleName) {
    this.id = moduleName;
    this.bundle = newRequire;
    this.exports = {};
  }

  newRequire.isParcelRequire = true;
  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;
  newRequire.register = function (id, exports) {
    modules[id] = [function (require, module) {
      module.exports = exports;
    }, {}];
  };

  var error;
  for (var i = 0; i < entry.length; i++) {
    try {
      newRequire(entry[i]);
    } catch (e) {
      // Save first error but execute all entries
      if (!error) {
        error = e;
      }
    }
  }

  if (entry.length) {
    // Expose entry point to Node, AMD or browser globals
    // Based on https://github.com/ForbesLindesay/umd/blob/master/template.js
    var mainExports = newRequire(entry[entry.length - 1]);

    // CommonJS
    if (typeof exports === "object" && typeof module !== "undefined") {
      module.exports = mainExports;

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
     define(function () {
       return mainExports;
     });

    // <script>
    } else if (globalName) {
      this[globalName] = mainExports;
    }
  }

  // Override the current require with this new one
  parcelRequire = newRequire;

  if (error) {
    // throw error from earlier, _after updating parcelRequire_
    throw error;
  }

  return newRequire;
})({"app.js":[function(require,module,exports) {
const express = require('express');

const path = require('path');

const app = express();

const https = require('https');

const fs = require('fs');

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};
const server = https.createServer(options, app);

const io = require('socket.io')(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});
let clientCount = 0;
console.log("initing socket event handlers");
io.on('connection', socket => {
  console.log('new connection');
  socket.on('message', (message, roomId) => {
    socket.to(roomId).emit('message', message);
  });
  socket.on('message2', (message, roomId) => {
    socket.to(roomId).emit('message2', message);
  });
  socket.on('join-room', roomId => {
    console.log('new client joined room' + roomId);
    clientCount++;

    if (clientCount == 1) {
      console.log('creating room');
      socket.join(roomId);
      socket.emit('created', roomId);
    } else if (clientCount == 2) {
      console.log('2nd client joined');
      socket.to(roomId).emit('join', roomId);
      socket.join(roomId);
      socket.emit('joined', roomId);
    } else {
      console.log('Rejected a client, room full');
      socket.emit('full');
    }
  });
  socket.on('disconnect', () => {
    clientCount--;
    console.log(`a user disconnected, user remaining: ${clientCount}`);
  });
});
module.exports = server;
},{}],"index.js":[function(require,module,exports) {
const app = require('./app');

const port = '8888';
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is listening on port ${port}...`);
});
},{"./app":"app.js"}]},{},["index.js"], null)
//# sourceMappingURL=/index.js.map