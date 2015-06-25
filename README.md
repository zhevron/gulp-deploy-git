# gulp-deploy-git
[![Downloads per Month](http://img.shields.io/npm/dm/gulp-deploy-git.svg?style=flat)](https://www.npmjs.org/package/gulp-deploy-git)
[![Version](http://img.shields.io/npm/v/gulp-deploy-git.svg?style=flat)](https://www.npmjs.org/package/gulp-deploy-git)

> Deploy Git projects to remote Git repositories.

## Installation

Install the package with npm and add it to your development dependencies:

`npm install --save-dev gulp-deploy-git`

## Usage

### Single deployment target

```javascript
var deploy = require('gulp-deploy-git');

gulp.task('deploy', function() {
  return gulp.src('dist/**/*')
    .pipe(deploy({
      repository: 'https://github.com/zhevron/gulp-deploy-git.git'
    }));
});
```

### Multiple deployment targets

```javascript
var deploy = require('gulp-deploy-git');

gulp.task('deploy', function() {
  return gulp.src('dist/**/*')
    .pipe(deploy({
      repository: 'https://username@github.com/username/my-repo.git',
      branches:   ['master']
    }))
    .pipe(deploy({
      repository: 'https://username@github.com/username/my-staging-repo.git',
      branches:   ['staging']
    }));
});
```

## Options

- `prefix`

  Prefix to strip from the relative path names when copying source files.

- `message`

  The commit message to use when pushing to the remote deployment repository.
  If omitted, Git will be used to determine the last commit message and use that.

- `repository`

	The remote Git repository to push to.

- `remoteBranch`

  The remote branch to clone and push to. Defaults to `master`.

- `branches`

	Only trigger deployment on the following branch(es). Defaults to `master`.

- `verbose`

  Verbose mode. Will show output from all git commands run. Defaults to `false`.

- `debug`

  Debugging mode. A lot of extra output to debug deployment issues.
  Implies `verbose`. Defaults to `false`.

## Errors

**gulp-deploy-git** emits an 'error' event if it is unable to commit to the
remote repository.

To handle errors across your entire pipeline, see the
[gulp](https://github.com/gulpjs/gulp/blob/master/docs/recipes/combining-streams-to-handle-errors.md#combining-streams-to-handle-errors) documentation.

## License

**gulp-deploy-git** is licensed under the [MIT license](http://opensource.org/licenses/MIT).  
For the full license, see the `LICENSE.md` file.
