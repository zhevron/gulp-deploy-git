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
    remoteBranch: 'master',
    branches: ['master'],
    verbose: false,
    debug: false
  }, options);

  options.prefix = options.prefix.replace('/', path.sep);

  const PLUGIN_NAME = 'gulp-deploy-git';

  var branch = null;
  var files = [];
  var repoPath = path.normalize(path.join(process.cwd(), 'deploy-' + Date.now()));

  return through.obj(function(file, enc, callback) {
    if (file.isBuffer()) {
      return callback('Buffers are not supported');
    }
    var p = path.normalize(path.relative(file.cwd, file.path));
    if (options.debug) gutil.log(gutil.colors.magenta('processing file: ') + p);
    if (options.prefix.length > 0 && p.indexOf(options.prefix) === 0) {
      p = p.substr(options.prefix.length + 1);
      if (options.debug) gutil.log(gutil.colors.magenta('  stripped prefix to: ') + p);
    }
    files.push({
      path: file.path,
      dest: path.join(repoPath, p)
    });
    callback(null, file);
  }, function(done) {
    async.waterfall([
      function checkBranch(callback) {
        if (process.env['GIT_BRANCH'] === undefined) {
          cmdRevParse = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
          cmdRevParse.stderr.on('data', function(data) {
            if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git rev-parse: ') + data.toString().trim());
          });
          cmdRevParse.stdout.on('data', function(data) {
            if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git rev-parse: ') + data.toString().trim());
            branch = data.toString().trim();
            if (branch.indexOf('refs/heads/') > -1) {
              branch = branch.substr(branch.lastIndexOf('refs/heads/') + 1);
            }
            gutil.log(gutil.colors.yellow('Current branch: ' + branch));
          });
          cmdRevParse.on('close', function(code) {
            if (code !== 0) {
              return callback('git rev-parse exited with code ' + code);
            }
            var found = false;
            options.branches.forEach(function (b) {
              if (branch === b) {
                found = true;
              }
            });
            if (!found) {
              return callback('doNotDeployBranch');
            }
            callback(null);
          });
        } else {
          branch = process.env['GIT_BRANCH'];
          if (branch.indexOf('refs/heads/') > -1) {
            branch = branch.substr(branch.lastIndexOf('refs/heads/') + 11);
          }
          var found = false;
          options.branches.forEach(function (b) {
            if (branch === b) {
              found = true;
            }
          });
          if (!found) {
            return callback('doNotDeployBranch');
          }
          callback(null);
        }
      },
      function gitClone(callback) {
        gutil.log(gutil.colors.yellow('Cloning remote deployment repository'));
        var cmdClone = spawn('git', ['clone', '-b', options.remoteBranch, '--single-branch', options.repository, repoPath]);
        cmdClone.on('data', function(data) { gutil.log(data.toString()); });
        cmdClone.stderr.on('data', function(data) {
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git clone: ') + data.toString().trim());
        });
        cmdClone.stdout.on('data', function(data) {
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git clone: ') + data.toString().trim());
        });
        cmdClone.on('close', function(code) {
          if (code !== 0) {
            return callback('git clone exited with code ' + code);
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
            stats = fs.lstatSync(file.path);
            if (stats.isDirectory()) {
              if (options.verbose || options.debug) gutil.log('skipping: ' + gutil.colors.magenta(file.path));
              return;
            }
            if (options.verbose || options.debug) gutil.log('copying: ' + gutil.colors.magenta(file.path) + ' to ' + gutil.colors.magenta(file.dest));
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
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git add: ') + data.toString().trim());
        });
        cmdAdd.stdout.on('data', function(data) {
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git add: ') + data.toString().trim());
        });
        cmdAdd.on('close', function(code) {
          if (code !== 0) {
            return callback('git add exited with code ' + code);
          }
          return callback(null);
        });
      },
      function gitLog(callback) {
        if (options.message.length === 0) {
          var cmdLog = spawn('git', ['log', '-1', '--oneline']);
          cmdLog.stderr.on('data', function(data) {
            if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git log: ') + data.toString().trim());
          });
          cmdLog.stdout.on('data', function(data) {
            if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git log: ') + data.toString().trim());
            options.message = data.toString().trim();
          });
          cmdLog.on('close', function(code) {
            if (code !== 0) {
              return callback('git log exited with code ' + code);
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
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git commit: ') + data.toString().trim());
        });
        cmdCommit.stdout.on('data', function(data) {
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git commit: ') + data.toString().trim());
        });
        cmdCommit.on('close', function(code) {
          if (code === 1) {
            return callback('noChanges');
          }
          if (code !== 0) {
            return callback('git commit exited with code ' + code);
          }
          return callback(null);
        });
      },
      function gitPush(callback) {
        gutil.log(gutil.colors.yellow('Pushing to remote deployment repository'));
        var cmdPush = spawn('git', ['push', 'origin', options.remoteBranch], {cwd: repoPath});
        cmdPush.stderr.on('data', function(data) {
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git push: ') + data.toString().trim());
        });
        cmdPush.stdout.on('data', function(data) {
          if (options.verbose || options.debug) gutil.log(gutil.colors.magenta('git push: ') + data.toString().trim());
        });
        cmdPush.on('close', function(code) {
          if (code !== 0) {
            return callback('git push exited with code ' + code);
          }
          return callback(null);
        });
      }
  ], function(err) {
      try {
        var repoStat = fs.lstatSync(repoPath);
        if (repoStat.isDirectory()) {
          gutil.log(gutil.colors.yellow('Removing local deployment folder'));
          rimraf(repoPath, function(err) {
            if (err) {
              gutil.log(gutil.colors.red('Failed to remove local deployment folder'));
            }
          });
        }
      } catch (err) {
      }
      if (err) {
        switch (err) {
        case 'doNotDeployBranch':
          gutil.log(gutil.colors.magenta('Branch ' + branch + ' not configured to deploy, skipping'));
          break;
        case 'noChanges':
          gutil.log(gutil.colors.magenta('No changes to deployment files, skipping'));
          break;
        default:
          done(new gutil.PluginError(PLUGIN_NAME, err));
        }
      }
      done(null);
    });
  });
}
