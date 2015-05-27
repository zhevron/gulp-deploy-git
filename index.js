var assign   = require('object-assign');
var async    = require('async');
var fs       = require('fs');
var gutil    = require('gulp-util');
var mkdirp   = require('mkdirp');
var path     = require('path');
var rimraf   = require('rimraf');
var spawn    = require('child_process').spawn;
var through  = require('through2');

module.exports = function(options) {
  options = assign({}, {
    prefix: '',
    message: '',
    repository: '',
    branches: ['master'],
    debug: false
  }, options);

  if (options.repository.length === 0) {
    return this.emit('error', new gutil.PluginError('gulp-deploy-git', ''));
  }

  var self = null;
  var branch = null;
  var files = [];
  var repoPath = path.normalize(path.join(process.cwd(), 'deploy-' + Date.now()));

  return through.obj(function(file, enc, callback) {
    self = this;
    var p = path.normalize(path.relative(file.cwd, file.path));
    if (options.prefix.length > 0) {
      p = path.normalize(path.relative(file.cwd + path.sep + options.prefix, file.path));
    }
    files.push({
      path: file.path,
      dest: path.join(repoPath, p)
    });
    callback(null);
  }, function(done) {
    async.waterfall([
      function checkBranch(callback) {
        if (process.env['GIT_BRANCH'] !== undefined) {
          cmdRevParse = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
          cmdRevParse.stderr.on('data', function(data) {
            if (options.debug) gutil.log(gutil.colors.magenta('git rev-parse: ') + data.toString().trim());
          });
          cmdRevParse.stdout.on('data', function(data) {
            if (options.debug) gutil.log(gutil.colors.magenta('git rev-parse: ') + data.toString().trim());
            branch = data.toString().trim();
            gutil.log(gutil.colors.yellow('Current branch: ' + branch));
          });
          cmdRevParse.on('exit', function(code) {
            if (code !== 0) {
              return callback(new gutil.PluginError('gulp-deploy-git', 'git rev-parse exited with code ' + code));
            }
            var found = false;
            options.branches.forEach(function (b) {
              if (branch === b) {
                found = true;
              }
            });
            if (!found) {
              return callback(new gutil.PluginError('gulp-deploy-git', 'branch ' + branch + ' is not configured to deploy'));
            }
            callback(null);
          });
        } else {
          branch = process.env['GIT_BRANCH'];
          var found = false;
          options.branches.forEach(function (b) {
            if (branch === b) {
              found = true;
            }
          });
          if (!found) {
            return callback(new gutil.PluginError('gulp-deploy-git', 'branch ' + branch + ' is not configured to deploy'));
          }
          callback(null);
        }
      },
      function gitClone(callback) {
        gutil.log(gutil.colors.yellow('Cloning remote deployment repository'));
        var cmdClone = spawn('git', ['clone', options.repository, repoPath]);
        cmdClone.on('data', function(data) { gutil.log(data.toString()); });
        cmdClone.stderr.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git clone: ') + data.toString().trim());
        });
        cmdClone.stdout.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git clone: ') + data.toString().trim());
        });
        cmdClone.on('close', function(code) {
          if (code !== 0) {
            return callback(new gutil.PluginError('gulp-deploy-git', 'git clone exited with code ' + code));
          }
          return callback(null);
        });
      },
      function removeFiles(callback) {
        gutil.log(gutil.colors.yellow('Cleaning deployment repository folder'));
        var clean = function(folder) {
          fs.readdirSync(folder).forEach(function(file) {
            var filePath = path.normalize(path.join(folder, file));
            stats = fs.lstatSync(filePath);
            if (stats.isDirectory()) {
              if (file !== '.git') {
                clean(filePath, callback);
              }
              return;
            }
            fs.unlinkSync(filePath);
          });
        }
        try {
          clean(repoPath);
          callback(null);
        } catch (err) {
          callback(err);
        }
      },
      function copySources(callback) {
        gutil.log(gutil.colors.yellow('Copying source files to deployment folder'));
        try {
          files.forEach(function(file) {
            mkdirp.sync(path.dirname(file.dest));
            fs.writeFileSync(file.dest, fs.readFileSync(file.path));
          })
          callback(null);
        } catch (err) {
          callback(err);
        }
      },
      function gitAdd(callback) {
        var cmdAdd = spawn('git', ['add', '--all', '.'], {cwd: repoPath});
        cmdAdd.stderr.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git add: ') + data.toString().trim());
        });
        cmdAdd.stdout.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git add: ') + data.toString().trim());
        });
        cmdAdd.on('exit', function(code) {
          if (code !== 0) {
            return callback(new gutil.PluginError('gulp-deploy-git', 'git add exited with code ' + code));
          }
          return callback(null);
        });
      },
      function gitLog(callback) {
        if (options.message.length === 0) {
          var cmdLog = spawn('git', ['log', '-1', '--oneline']);
          cmdLog.stderr.on('data', function(data) {
            if (options.debug) gutil.log(gutil.colors.magenta('git log: ') + data.toString().trim());
          });
          cmdLog.stdout.on('data', function(data) {
            if (options.debug) gutil.log(gutil.colors.magenta('git log: ') + data.toString().trim());
            message = data.toString().trim();
          });
          cmdLog.on('exit', function(code) {
            if (code !== 0) {
              return callback(new gutil.PluginError('gulp-deploy-git', 'git log exited with code ' + code));
            }
            callback(null);
          });
        } else {
          callback(null);
        }
      },
      function gitCommit(callback) {
        gutil.log(gutil.colors.yellow('Committing changes to deployment repository'));
        var cmdCommit = spawn('git', ['commit', '-m', options.message], {cwd: repoPath});
        cmdCommit.stderr.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git commit: ') + data.toString().trim());
        });
        cmdCommit.stdout.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git commit: ') + data.toString().trim());
        });
        cmdCommit.on('exit', function(code) {
          if (code !== 0) {
            return callback(new gutil.PluginError('gulp-deploy-git', 'git commit exited with code ' + code));
          }
          return callback(null);
        });
      },
      function gitPush(callback) {
        gutil.log(gutil.colors.yellow('Pushing to remote deployment repository'));
        var cmdPush = spawn('git', ['push'], {cwd: repoPath});
        cmdPush.stderr.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git push: ') + data.toString().trim());
        });
        cmdPush.stdout.on('data', function(data) {
          if (options.debug) gutil.log(gutil.colors.magenta('git push: ') + data.toString().trim());
        });
        cmdPush.on('exit', function(code) {
          if (code !== 0) {
            return callback(new gutil.PluginError('gulp-deploy-git', 'git push exited with code ' + code));
          }
          return callback(null);
        });
      },
      function removeRepository(callback) {
        gutil.log(gutil.colors.yellow('Removing local deployment folder'));
        rimraf(repoPath, function(err) {
          if (err) {
            return callback(new gutil.PluginError('gulp-deploy-git', err));
          }
          return callback(null);
        });
      }
    ], function(err) {
      if (err) {
        self.emit('error', err);
      }
      done(err);
    });
  });
}
