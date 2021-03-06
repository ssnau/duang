"use strict";
var fs   = require('fs');
var path = require('path');
var join = require('path').join;
var execSync = require('child_process').execSync;
var resolve = require('resolve');
var builtins = require('builtin-modules');
var rr      = require('./util').transform;
var obj_map = require('./util').obj_map;
var argv = require('argv-parse');

var requireREG = /require\s*\(/;

var args = argv({
  source: {
    type: 'string',
    alias: 's'
  },
  output: {
    type: 'string',
    alias: 'o'
  },
  pack: {
    type: 'boolean',
  },
  version: {
    type: 'boolean',
    alias: 'v'
  }
});

// if query for version
if (args.version) {
  console.log(require('./package.json').version);
  return;
}

var cwd = process.cwd();
var rcjson = readJSON(join(cwd, '.duangrc'));
var srcdir = args.source || rcjson.source || cwd;
var destdir = args.output || rcjson.output;
var pack = args.pack;

if (!destdir) {
  throw new Error('You must specify --output');
}
if (srcdir[0] !== '/') {
  srcdir = join(cwd, srcdir);
}
if (destdir[0] !== '/') {
  destdir = join(cwd, destdir);
}

rcjson.alias = obj_map(rcjson.alias || {"@ROOT": "."}, (key, val) => {
  if (val[0] === '/') return val;
  return join(destdir, val);
});


console.log('###start...');
compile(srcdir, destdir);

function compile(srcdir, destdir) {
  // 0. create destdir if not exists
  createFolder(destdir);
  // 1. copy every file into destdir
  for (let file of readDir(srcdir)) {
    if (file === destdir) continue;
    if (!pack && /node_modules$/.test(file)) continue;
    execSync(`cp -r ${file} ${destdir}/`);
  }
  // 1.1 compute total files
  var total = 0, count = 0, lasttime = Date.now();
  traverse(destdir, file => total++);
  // 2. walk every js file
  traverse(destdir, function (file) {
    count++;
    if (Date.now() - lasttime > 5000) {
      console.log('progress: ' + (count / total * 100).toFixed(2) + '%');
      lasttime = Date.now();
    }

    if (!/\.js$/.test(file)) return;
    if (fs.statSync(file).isDirectory()) return; // skip folder
    var content = readFile(file);
    if (!requireREG.test(content)) return;
    // more than 500 char in a single line, should not be source code.
    var lines = content.split("\n");
    if (lines.length > 5000 || lines.some(x => x.length  > 500)) return;
    safe(() => 
      writeFile(file, 
        rr(content, (name) => {
          if (name.charAt(0) === '.') return name;
          if (builtins.indexOf(name) > -1) return name;
          // deal with alias
          var alias = Object.keys(rcjson.alias).find(a => name.indexOf(a) === 0);
          if (alias) name = relative(destdir, name.replace(alias, rcjson.alias[alias]));

          if (!pack) return name;
          var dir = path.dirname(file);
          var depfile = resolve.sync(name, {basedir: dir});
          return relative(dir, depfile).replace(/node_modules/g, 'xnode_modules');
        }, {usePreset: file.indexOf('node_modules') == -1})
      )
    );
  });
  if (!pack) return;
  // 3. traverse and change node_modules => xnode_modules
  traverse(destdir, function (dir) {
    if (!fs.statSync(dir).isDirectory()) return;
    if (path.basename(dir) === 'node_modules') {
      var dname = dir.replace(/node_modules$/, 'xnode_modules');
      var cmd = `mv ${dir} ${dname}`
      execSync(cmd)
    }
  });
  // 4. remove deps
  var pjson = getPackageJSON(destdir);
  pjson.dependencies = {};
  writeFile(
    join(destdir, 'package.json'), 
    JSON.stringify(pjson, null, 2)
  );
}

function readDir(dir) {
  return fs.readdirSync(dir).map(x => join(dir, x));
}

function traverse(dir, cb) {
  readDir(dir).forEach(function (file) {
    if (fs.statSync(file).isDirectory()) traverse(file, cb);
    cb(file);
  });
}


function safe(fn) {
  try {
    return fn();
  } catch (e) {
  }
}

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeFile(file, content) {
  return fs.writeFileSync(file, content, 'utf8');
}

function readJSON(file) {
  try {
    return eval('(' + readFile(file) + ')');
  } catch (e) {
    return {}
  }
}

function getPackageJSON(dir) {
  return readJSON(join(dir, 'package.json'));
}

function createFolder(p) {
  return execSync(`mkdir -p ${p}`);
}
function relative(a, b) {
  var rp = path.relative(a, b);
  return rp[0] === '.' ? rp : ('./' + rp);
}

function noop(){}

