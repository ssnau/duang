"use strict";
var fs   = require('fs');
var path = require('path');
var join = require('path').join;
var execSync = require('child_process').execSync;
var resolve = require('resolve');
var builtins = require('builtin-modules');
var rr      = require('./transform');
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
});

var cwd = process.cwd();
var srcdir = args.source || cwd;
var destdir = args.output;
if (!destdir) {
  throw new Error('You must specify --ouput');
}
if (destdir[0] !== '/') {
  destdir = join(cwd, destdir);
}

compile(srcdir, destdir);

function compile(srcdir, destdir) {
  // 0. create destdir if not exists
  createFolder(destdir);
  // 1. copy every file into destdir
  for (let file of readDir(srcdir)) {
    if (file !== destdir) {
      execSync(`cp -r ${file} ${destdir}/`);
    }
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
          var dir = path.dirname(file);
          var depfile = resolve.sync(name, {basedir: dir});
          var rp = path.relative(dir, depfile).replace(/node_modules/g, 'xnode_modules');
          return rp[0] === '.' ? rp : ('./' + rp);
        })
      )
    );
  });
  // 3. traverse and change node_modules => xnode_modules
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

function getPackageJSON(dir) {
  return safe(() => 
    JSON.parse(readFile(join(dir, 'package.json')))
  ) || {};
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

function createFolder(p) {
  return execSync(`mkdir -p ${p}`);
}

function noop(){}

