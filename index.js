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

var args = argv({
  source: {
    type: 'string',
    alias: 's'
  },
  output: {
    type: 'string',
    alias: 'o'
  },
  nopack: {
    type: 'boolean',
  }
});

var cwd = process.cwd();
var rcjson = readJSON(join(cwd, '.duangrc'));

var srcdir = args.source || cwd;
var destdir = args.output || rcjson.out;
var nopack = args.nopack;
console.log('nopack is', nopack);

if (!destdir) {
  throw new Error('You must specify --ouput');
}
if (destdir[0] !== '/') {
  destdir = join(cwd, destdir);
}

rcjson.alias = obj_map(rcjson.alias || {"@ROOT": "."}, (key, val) => {
  if (val[0] === '/') return val;
  return join(destdir, val);
});
console.log(rcjson);

compile(srcdir, destdir);

function compile(srcdir, destdir) {
  // 0. create destdir if not exists
  createFolder(destdir);
  // 1. copy every file into destdir
  for (let file of readDir(srcdir)) {
    if (file === destdir) continue;
    if (nopack && /node_modules$/.test(file)) continue;
    execSync(`cp -r ${file} ${destdir}/`);
  }
  // 2. walk every js file
  traverse(destdir, function (file) {
    if (!/\.js$/.test(file)) return;
    if (fs.statSync(file).isDirectory()) return; // skip folder
    var content = readFile(file);
    safe(() => 
      writeFile(file, 
        rr(content, (name) => {
          if (name.charAt(0) === '.') return name;
          if (builtins.indexOf(name) > -1) return name;
          // deal with alias
          var alias = Object.keys(rcjson.alias).find(a => name.indexOf(a) === 0);
          if (alias) name = relative(destdir, name.replace(alias, rcjson.alias[alias]));

          if (nopack) return name;
          var dir = path.dirname(file);
          var depfile = resolve.sync(name, {basedir: dir});
          return relative(dir, depfile).replace(/node_modules/g, 'xnode_modules');
        })
      )
    );
  });
  // 3. traverse and change node_modules => xnode_modules
  if (nopack) return;
  traverse(destdir, function (dir) {
    if (!fs.statSync(dir).isDirectory()) return;
    if (path.basename(dir) === 'node_modules') {
      var dname = dir.replace(/node_modules$/, 'xnode_modules');
      var cmd = `mv ${dir} ${dname}`
      console.log('executing ' + cmd);
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
    return JSON.parse(readFile(file));
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

