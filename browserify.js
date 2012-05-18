var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

if (!process.env) process.env = {};
if (!process.argv) process.argv = [];

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("events", function (require, module, exports, __dirname, __filename) {
if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = list.indexOf(listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("util", function (require, module, exports, __dirname, __filename) {
var events = require('events');

exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

});

require.define("/color.js", function (require, module, exports, __dirname, __filename) {
Color = function(r, g, b) {
	this.r = r ? Color.clipComponent(r) : 0;
	this.g = g ? Color.clipComponent(g) : 0;
	this.b = b ? Color.clipComponent(b) : 0;
}
var rand = function(min, max) { return min + (max - min) * Math.random(); }

//Mutating methods
Color.prototype.randomize = function(range) {
	this.r = rand(Color.clipComponent(this.r - range), Color.clipComponent(this.r + range));
	this.g = rand(Color.clipComponent(this.g - range), Color.clipComponent(this.g + range));
	this.b = rand(Color.clipComponent(this.b - range), Color.clipComponent(this.b + range));
	return this;
};
Color.prototype.lerp = function(that, x) {
	var y = 1 - x;
	this.r = this.r*y + that.r*x;
	this.g = this.g*y + that.g*x;
	this.b = this.b*y + that.b*x;
	return this;
};
Color.prototype.invert = function() {
	this.r = 255-this.r;
	this.g = 255-this.g;
	this.b = 255-this.b;
	return this;
}
Color.prototype.set = function(r, g, b) {
	this.r = Color.clipComponent(r);
	this.g = Color.clipComponent(g);
	this.b = Color.clipComponent(b);
	return this;
}

//Non-mutating versions
Color.prototype.inverted   = function()        { return this.clone().invert();      }
Color.prototype.lerped     = function(that, x) { return this.clone().lerp(that, x); }
Color.prototype.randomized = function(x)       { return this.clone().randomize(x);  }

Color.prototype.toString = function() {
	return 'rgb(' + Math.round(this.r) + ', ' + Math.round(this.g) + ', ' + Math.round(this.b) + ')';
};
Color.prototype.toHexString = function() {
	return '#' + this.toInt().toString(16);
};
Color.prototype.toInt = function(rgb) {
	return Math.round(this.r) << 16 | Math.round(this.g) << 8 | Math.round(this.b);
};
Object.defineProperty(String.prototype, 'colored', {
	value: function(c) {
		var r = Math.round(c.r * 5 / 255);
		var g = Math.round(c.g * 5 / 255);
		var b = Math.round(c.b * 5 / 255);
		return '\033[38;5;' + (16 + r*36 + g*6 + b) + 'm' + this + '\033[0m';
	},
	enumerable: false
});
Color.fromInt = function(rgb) {
	var b = rgb & 0xff;
	var g = (rgb >>= 8) & 0xff;
	var r = (rgb >>= 8) & 0xff;
	return new Color(r, g, b);
}
Color.prototype.clone = function() {
	var c = new Color;
	c.r = this.r, c.b = this.b, c.g = this.g
	return c;
}
Color.random = function(r, g, b, range) {
	return new Color(r || 128, g || 128, b || 128).randomize(range || 128);
}
Color.clipComponent = function(x) {
	return x > 255 ? 255 : x < 0 ? 0 : x;
}
Color.ify = function(data) {
	if(typeof data == "number")
		return Color.fromInt(data);
	else if(data instanceof Object)
		return new Color(data.r, data.g, data.b);
}
Color.niceColor = function(a) {
	a *= 6;
	var b = (a % 1) * 128 - 64;
	// var a = Math.random() * 6;
	// var b = Math.random() * 128 - 64;

	if(a < 1)
		return new Color(255, 64 + b, 64 - b); //yellow-magenta face
	else if(a < 2)
		return new Color(64 - b, 255, 64 + b); //magenta-cyan face
	else if(a < 3)
		return new Color(64 + b, 64 - b, 255); //cyan-yellow face
	else if(a < 4)
		return new Color(0, 192 + b, 192 - b); //green-blue face
	else if(a < 5)
		return new Color(192 - b, 0, 192 + b); //blue-red face
	else
		return new Color(192 + b, 192 - b, 0); //red-green face
}

//Primaries
Color.red     = function() { return new Color(255, 0, 0); }
Color.green   = function() { return new Color(0, 255, 0); }
Color.blue    = function() { return new Color(0, 0, 255); }

//secondaries
Color.yellow  = function() { return new Color(255, 255, 0); }
Color.cyan    = function() { return new Color(0, 255, 255); }
Color.magenta = function() { return new Color(255, 0, 255); }

//grayscale
Color.white   = function() { return new Color(255, 255, 255); }
Color.gray    = function() { return new Color(128, 128, 128); }
Color.black   = function() { return new Color(  0,   0,   0); }
});

require.define("/snake.js", function (require, module, exports, __dirname, __filename) {
require('./util');
var util = require('util');
var events = require('events');

Snake = function Snake(length, color, pos, world) {
    events.EventEmitter.call(this);
	this.onHeadHit = Snake.onHeadHit.bind(this);

	var ballSize = 10;
	this.color = color;
	this.balls = [];
	this.world = world;
	this.balls[0] = this.head = new Ball(pos, ballSize, color.randomized(16))
	this.maxMass = this.head.mass;
	for (var i = 1; i < length; i++) {
		this.addBall(new Ball(new Vector(), ballSize, color.randomized(16)));
	};
	this.balls.forEach(function(b) {
		this.world.addEntity(b);
	}, this);
}
util.inherits(Snake, events.EventEmitter);

Snake.onHeadHit = function(thing, cancelled) {
	if(cancelled()) return;

	var that = thing.ownerSnake;
	if(that == undefined) {
		if(this.eat(thing)) {
			this.emit('eat.free', thing);

			cancelled(true); //prevent balls interacting
		}
	}
	else if(that != this) {
		if(thing == that.head) {
			if(that.length == 1 && this.head.mass > that.head.mass*2) {
				this.emit('eat.head', thing);
				this.eat(thing);
				that.balls = [];
				that.destroy();

				that.emit('death', this); //THIS MUST GO BEFORE.destroy()!!!

				cancelled(true);
			}
		}
		else if(this.canEat(thing)) {
			this.emit('eat.tail', thing);
			that.eatenAt(thing);
			this.eat(thing);

			cancelled(true);
		}
	}
}

Object.defineProperty(Snake.prototype, 'tail', {
	get: function() { return this.balls[this.balls.length - 1]; }
});
Object.defineProperty(Snake.prototype, 'head', {
	get: function() { return this._head; },
	set: function(h) {
		var current = this.head;
		if(h != current) {
			var force = Vector.zero
			if(current) {
				force  = current.forces.player;
				current.removeListener('interaction', this.onHeadHit);
				delete current.forces.player;
			} 
			if(h) {
				var snake = this;
				h.forces.player = force
				h.on('interaction', this.onHeadHit);
				h.ownerSnake = this;
			}
			this._head = h;
		}
	}
});
Object.defineProperty(Snake.prototype, 'mass', {
	get: function() { return this.balls.reduce(function(sum, x) { return sum + x.mass }, 0); }
});
Object.defineProperty(Snake.prototype, 'length', {
	get: function() { return this.balls.length; }
});
Snake.prototype.drawTo = function(ctx) {
	ctx.save();
	ctx.fillStyle = "white";
	ctx.beginPath();
	ctx.arc(this.head.position.x, this.head.position.y, 5, 0, Math.PI * 2, false);
	ctx.fill();
	ctx.restore();
	return this;
};
Snake.prototype.addBall = function(ball) {
	ball.clearForces();
	ball.velocity.set(0, 0);
	ball.ownerSnake = this;

	var pos = this.tail.position
	var dist = ball.radius + this.tail.radius;
	for(var j = 0; j < 100; j++) {
		var p = Vector.fromPolarCoords(dist, Math.random() * Math.PI * 2)
		ball.position = p.plusEquals(pos);
		var collides = this.balls.some(function(b) {b.touches(ball)});
		if(collides) break;
	}
	this.balls.push(ball);
}
//Respond to being eaten
Snake.prototype.eatenAt = function(ball) {
	var index = this.balls.indexOf(ball);
	if(index > 0) {
		var removed = this.balls.splice(index);
		removed.shift();
		var removedMass = removed.reduce(function(sum, b) {return sum + b.mass}, 0);
		var remainingMass = this.mass;
		//Reverse the snake if too much was taken off
		if(removedMass > remainingMass) {
			var r = this.balls;
			this.balls = removed.reverse();
			this.head = this.balls[0];
			removed = r;
		}
		removed.forEach(function(b) {
			delete b.ownerSnake;
			b.clearForces();
		});
	}
}
Snake.prototype.canEat = function(ball) {
	if(this.balls.contains(ball)) return false;
	if(this.maxMass * 2 < ball.mass) return false;
	return true;
}
Snake.prototype.eat = function(ball) {
	if(!this.canEat(ball)) return false;

	this.maxMass *= 1.05;
	this.addBall(ball);
	return true;
}
Snake.prototype.destroy = function() {
	this.balls.forEach(function(b) {
		this.world.removeEntity(b);
		delete b.ownerSnake;
	}, this);
	this.balls = [];
	this.head = null;
}
var balls = [];
Snake.prototype.update = function(dt) {
	//Shortening
	this.balls.forAdjacentPairs(function(a, b, ai, bi) {
		var rate = 50;// + 5*(this.length - ai);
		var aMass = a.mass;
		var diff = aMass - this.maxMass;
		if(diff > rate) {
			a.mass = aMass - rate;
			b.mass += rate;
		} else if(diff < -rate) {
			var bMass = b.mass;
			if(bMass < rate) {
				b.mass = 0;
				a.mass = aMass + bMass;
			} else {
				a.mass = aMass + rate;
				b.mass = bMass - rate;
			}
		} else {
			a.mass = this.maxMass;
			b.mass += diff;
		}
	}, this);
	var last = this.tail;
	if(!(last.mass > 0)) { //NaNs
		this.balls.pop();
		this.world.removeEntity(last);
	}
	
	//Update ball colors
	this.balls.forEach(function(b) {
		b.color.lerp(this.color, 0.05);
	}, this);

	//Force them into a line
	this.balls.forAdjacentPairs(function(b1, b2) {
		b2.follow(b1);
	}, this);
};
});

require.define("/util.js", function (require, module, exports, __dirname, __filename) {
Object.values = function(obj) {
	var values = [];
	Object.forEach(obj, function(v) { values.push(v) });
	return values;
}
Object.reduce = function(obj, f, start, thisPtr) {
	current = start || 0;
	for(var k in obj) {
		if(obj.hasOwnProperty(k)) {
			current = f.call(thisPtr, current, obj[k], k, obj)
		}
	}
	return current;
};

Array.prototype.contains = function(x) { return this.indexOf(x) != -1; };
Array.prototype.pluck = function(prop) { return this.map(function(x) { return x[prop]; }); };

Array.prototype.forEveryPair = function(callback, thisPtr) {
	var l = this.length;
	for(var i = 0; i < l; i++) {
		for(var j = i + 1; j < l; j++) {
			var ti = this[i], tj = this[j];
			if(ti !== undefined && tj !== undefined)
				callback.call(thisPtr, ti, tj, i, j, this);
		}
	}
};

Array.prototype.remove = function(element) {
	var l = this.length;
	for(var i = 0; i < l; i++) {
		if(this[i] == element) {
			this.splice(i, 1);
			return true;
		}
	}
	return false;
}
Object.forEach = function(obj, f, thisPtr) {
	for(var i in obj) {
		var oi = obj[i];
		if(oi !== undefined) {
			f.call(thisPtr, oi, i, obj);
		}
	}
}
Object.some = function(obj, f, thisPtr) {
	for(var i in obj) {
		var oi = obj[i];
		if(oi !== undefined && f.call(thisPtr, oi, i, obj) === true) {
			return true;
		}
	}
	return false;
}
Object.every = function(obj, f, thisPtr) {
	for(var i in obj) {
		var oi = obj[i];
		if(oi !== undefined && f.call(thisPtr, oi, i, obj) !== true) {
			return false;
		}
	}
	return true;
}
Object.forEachPair = function(obj, f, thisPtr) {
	for(var i in obj) {
		for(var j in obj) {
			var oi = obj[i], oj = obj[j];
			if(i < j && oi !== undefined && oj !== undefined) {
				f.call(thisPtr, oi, oj, i, j, obj);
			}
		}
	}
}
Array.prototype.forAdjacentPairs = function(callback, thisPtr) {
	var l = this.length;
	for (var i = 0, j = 1; j < l; i = j++) {
		var ti = this[i], tj = this[j];
		if(ti !== undefined && tj !== undefined)
			callback.call(thisPtr, ti, tj, i, j, this);
	}
};
Array.prototype.pluck = function(property) {
	return this.map(function(x) {return x[property]; });
};
Object.isEmpty = function(obj) {
	for (var prop in obj) if (obj.hasOwnProperty(prop)) return false;
	return true;
}
});

require.define("/vector.js", function (require, module, exports, __dirname, __filename) {
Vector = function Vector(x, y) {
	this.x = x;
	this.y = y;
}
Vector.fromPolarCoords = function(r, theta) {
	if(theta === undefined)
		theta = r, r = 1;
	return new Vector(r*Math.cos(theta), r*Math.sin(theta));
}
Vector.fromString = function(string) {
	var components = string.split(',');
	var x = parseFloat(components[0].replace(/[^\d\.-]/g, ''));
	var y = parseFloat(components[1].replace(/[^\d\.-]/g, ''));
	
	if(isNaN(x) || isNaN(y))
		return null;
	else
		return new Vector(x, y);
}
Vector.ify = function(data) {
	if(data instanceof Object && 'x' in data && 'y' in data)
		return new Vector(data.x, data.y);
	else if(typeof data == "string") {
		return Vector.fromString(data);
	}
}
Vector.prototype = {
	set: function(x, y) {
		this.x = x;
		this.y = y;
		return this;
	},
	isFinite: function() {
		return isFinite(this.x) && isFinite(this.y);
	},
	get length() {
		return Math.sqrt(this.lengthSquared);
	},
	set length(x) {
		this.overEquals(x/this.length);
	},
	get lengthSquared() {
		return this.dot(this);
	},
	set lengthSquared(x) {
		this.overEquals(Math.sqrt(x/this.lengthSquared));
	},
	angle: function() {
		return Math.atan2(this.x, this.y);
	},
	forceMaxLength: function(f) {
		var l = this.length;
		if(!isFinite(l)) this.set(0, 0);
		else if(f < l) this.overEquals(f / l);
	},
	normalized: function() {
		return this.over(this.length);
	},
	normalize: function() {
		return this.overEquals(this.length);
	},
	plus: function(that) {
		return new Vector(this.x + that.x, this.y + that.y);
	},
	plusEquals: function(that) {
		this.x += that.x;
		this.y += that.y;
		return this;
	},
	minus: function(that) {
		return new Vector(this.x - that.x, this.y - that.y);
	},
	minusEquals: function(that) {
		this.x -= that.x;
		this.y -= that.y;
		return this;
	},
	times: function(factor) {
		if(factor instanceof Vector)
			return new Vector(this.x * factor.x, this.y * factor.y);
		else
			return new Vector(this.x * factor, this.y * factor);
	},
	timesEquals: function(factor) {
		if(factor instanceof Vector) {
			this.x *= factor.x;
			this.y *= factor.y;
		} else {
			this.x *= factor;
			this.y *= factor;
		}
		return this;
	},
	over: function(factor) {
		return new Vector(this.x / factor, this.y / factor);
	},
	overEquals: function(factor) {
		if(factor instanceof Vector) {
			this.x /= factor.x;
			this.y /= factor.y;
		} else {
			this.x /= factor;
			this.y /= factor;
		}
		return this;
	},
	negated: function() {
		return new Vector(-this.x, -this.y);
	},
	negate: function() {
		this.x = -this.x;
		this.y = -this.y;
		return this;
	},
	dot: function(that) {
		return this.x * that.x + this.y * that.y;
	},
	distanceTo: function(that, squared) {
		var dx = this.x - that.x;
		var dy = this.y - that.y;
		var d = dx*dx + dy*dy;
		return squared ? d : Math.sqrt(d);
	},
	angleTo: function(that) {
		return Math.acos(this.dot(that) / Math.sqrt(this.lengthSquared * that.lengthSquared))
	},
	lerp: function(that, t) {
		return that.times(t).plus(this.times(1 - t));
	},
	perp: function() {
		return new Vector(-this.y, this.x);
	},
	toDiagonalMatrix: function() {
		return new Matrix(this.x, 0, 0, this.y);
	},
	toString: function() {
		return '(' + this.x + ',' + this.y + ')';
	},
	toFixed: function(precision) {
		return '(' + this.x.toFixed(precision) + ',' + this.y.toFixed(precision) + ')';
	},
	clone: function() {
		return new Vector(this.x, this.y);
	}
};

Object.defineProperties(Vector, {
	zero: {get: function() { return new Vector(0, 0)     } },
	i:    {get: function() { return new Vector(1, 0)     } },
	j:    {get: function() { return new Vector(0, 1)     } },
	NaN:  {get: function() { return new Vector(NaN, NaN) } }
});

Vector.prototype['+'] = Vector.prototype.plus
Vector.prototype['-'] = Vector.prototype.minus
Vector.prototype['*'] = Vector.prototype.times
Vector.prototype['/'] = Vector.prototype.over

Vector.prototype['+='] = Vector.prototype.plusEquals
Vector.prototype['-='] = Vector.prototype.minusEquals
Vector.prototype['*='] = Vector.prototype.timesEquals
Vector.prototype['/='] = Vector.prototype.overEquals
});

require.define("/ball.js", function (require, module, exports, __dirname, __filename) {
require('./entity');
require('./vector');
require('./util');

var util = require('util');

Ball = function Ball(pos, radius, color) {
	Entity.call(this, pos)
	this.radius = radius;
	this.color = color || 'red';

	this.forces.contact = {};
}
util.inherits(Ball, Entity);

Object.defineProperty(Ball.prototype, 'mass', {
	get: function() {
		return Math.PI*this.radius*this.radius;
	},
	set: function(m) {
		this.radius = Math.sqrt(m / Math.PI);
	}
});
Object.defineProperty(Ball.prototype, 'id', {
	get: function() { return 'b' + this._id; }
});

Ball.prototype.update = function(dt) {
	//resistance = k * A * v^2
	this.forces.resistance = this.velocity.times(0.05*-this.velocity.length*this.radius*2);
	
	Entity.prototype.update.call(this, dt);
	this.forces.contact = {};
	this.forces.following = {};

	return this;
};

Ball.prototype.touches = function(that) {
	return this.position.minus(that.position).length <= this.radius + that.radius;
};

Ball.prototype.bounceOffWalls = function(width, height) {
	if(this.position.x < this.radius) {
		this.velocity.x = Math.abs(this.velocity.x);
		this.position.x = this.radius;
	} else if(this.position.x > width - this.radius) {
		this.velocity.x = -Math.abs(this.velocity.x);
		this.position.x = width - this.radius;
	}

	if(this.position.y < this.radius) {
		this.velocity.y = Math.abs(this.velocity.y);
		this.position.y = this.radius;
	} else if(this.position.y > height - this.radius) {
		this.velocity.y = -Math.abs(this.velocity.y);
		this.position.y = height - this.radius;
	}
	return this;
};

Ball.prototype.interactWith = function(that) {
	if(this.following == that || that.following == this) return false;
	else {
		var diff = this.position.minus(that.position);
		var dist = diff.length;
		diff.overEquals(dist);

		var overlap = this.radius + that.radius - dist;
		if(overlap > 0 && dist != 0 && Entity.allowInteraction(this, that)) {
			var meanmass = 1 / ((1 / this.mass) + (1 / that.mass));

			overlap *= meanmass;
			this.forces.contact[that.id] = diff.times(overlap*200);
			that.forces.contact[this.id] = diff.times(-overlap*200);
			return true;
		}
	}

	return false;
}

Ball.prototype.clearForces = function() {
	Entity.prototype.clearForces.call(this);
	this.forces.contact = {};
	this.forces.following = {};
}

Ball.prototype.drawTo = function(ctx) {
	ctx.save();
	ctx.fillStyle = this.color.toString();
	ctx.beginPath();
	ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2, false);
	ctx.fill();
	ctx.restore();
	return this;
};

Ball.prototype.follow = function(that) {
	this.following = that

	target = this.position.minus(that.position)
		.normalize()
		.timesEquals(this.radius + that.radius)
		.plusEquals(that.position);

	if(target.isFinite()) {
		this.forces.following[that.id] = target.minus(this.position).times(this.mass);
		that.forces.following[this.id] = target.minus(this.position).times(-that.mass);
		this.position = target
	}
	return this;
};
});

require.define("/entity.js", function (require, module, exports, __dirname, __filename) {
var util = require('util');
var events = require('events');

Entity = function Entity(position, velocity) {
    events.EventEmitter.call(this);
	this.position = position || Vector.zero;
	this.velocity = velocity || Vector.zero;
	this.forces = {};
	this._id = -1;
};
util.inherits(Entity, events.EventEmitter);

Entity.allowInteraction = function(a, b) {
	var allow = true;
	var cancelled = function(x) { if(x) allow = false; else return !allow; }
	a.emit('interaction', b, cancelled)
	b.emit('interaction', a, cancelled)
	return allow;
}

Object.defineProperty(Entity.prototype, 'id', {
	get: function() { return 'e' + this._id; }
});
Object.defineProperty(Entity.prototype, 'acceleration', {
	get: function() {
		return Object.reduce(this.forces, function sumVectors(total, current) {
			if(current instanceof Vector)
				return current.isFinite() ? total.plusEquals(current) : total;
			else if(current instanceof Array)
				return current.reduce(sumVectors, total);
			else if(current instanceof Object)
				return Object.reduce(current, sumVectors, total);
			else
				return total;
		}, Vector.zero).overEquals(this.mass);
	}
});
Entity.prototype.update = function(dt) {
	this.velocity.plusEquals(this.acceleration.times(dt))
	this.velocity.forceMaxLength(1000);
	this.position.plusEquals(this.velocity.times(dt))
	return this;
};
Entity.prototype.clearForces = function(dt) {
	this.forces = {}
}
Entity.prototype.mass = 1;
Entity.prototype.touches = function() { return false; };
});

require.define("/world.js", function (require, module, exports, __dirname, __filename) {
var util = require('util');
var events = require('events');
require('./vector');
World = function World(width, height) {
    events.EventEmitter.call(this);
	this.entities = [];
	this.width = width || 0;
	this.height = height || 0;
}
util.inherits(World, events.EventEmitter);

World.prototype.update = function(dt) {
	this.entities.forEveryPair(function(e1, e2) {
		e1.interactWith(e2)
	});
	this.entities.forEach(function(e) {
		e.update(dt);
		e.bounceOffWalls(this.width, this.height);
	}, this);
	this.emit('update');
	return this;
};
World.prototype.clear = function(e) {
	this.entities = [];
};
World.prototype.addEntity = function(e) {
	var i = 0;
	while(this.entities[i] !== undefined)
		i++;
	e._id = i;

	this.entities[i] = e;
	this.emit('entity.add', e);
	return this;
};
World.prototype.removeEntity = function(e) {
	if(e && e._id in this.entities) {
		this.emit('entity.remove', e);
		delete this.entities[e._id];
	}
	return this;
};
World.prototype.randomPosition = function() {
	return new Vector(Math.random()*this.width, Math.random()*this.height);
},
World.prototype.entityById = function(id) {
	for(i in this.entities) {
		var e = this.entities[i]
		if(e._id == id) return e;
	}
};
Object.defineProperty(World.prototype, 'totalMass', {get: function() {
	return this.entities.reduce(function(sum, e) { return e.mass + sum; }, 0);
}});
});