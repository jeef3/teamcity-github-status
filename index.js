'use strict';

var express = require('express');
var Q = require('q');
var dotenv = require('dotenv');
var nconf = require('nconf');

require('colors');

dotenv.load();
nconf
  .argv()
  .env();

var app = express();
var client = require('octonode').client(nconf.get('GITHUB_TOKEN'));
var teamcity = require('teamcity').client({
  username: nconf.get('TEAMCITY_USERNAME'),
  password: nconf.get('TEAMCITY_PASSWORD'),
  protocol: nconf.get('TEAMCITY_PROTOCOL'),
  baseUrl: nconf.get('TEAMCITY_BASE_URL')
});

app.configure(function () {
  app.use(express.bodyParser());
});

var handleEvent = function (buildEvent) {
  var deferred = Q.defer();

  var buildId = buildEvent.build.buildId;
  var buildResult = buildEvent.build.buildResult.toLowerCase();
  var notifyType = buildEvent.build.notifyType.toLowerCase();
  var buildNumber = buildEvent.build.buildNumber;
  var buildStatusText = buildEvent.build.buildStatus;

  var state,
    description;

  // TeamCity has a rather complicated mixture of result and type to
  // determine state
  if (notifyType === 'buildstarted') {
    state = 'pending';
    description = 'Build #' + buildNumber + ' in progress';
  } else if (notifyType === 'buildinterrupted') {
    //error: interrupted
    state = 'error';
    description = 'Build #' + buildNumber + ' interrupted';

  } else if (notifyType === 'beforebuildfinish') {
    state = 'pending';
    description = 'Build #' + buildNumber + ' almost finished';

  } else if (notifyType === 'buildfinished') {
    // check status: success/failure
    if (buildResult === 'success') {
      state = 'success';
      description = 'Build #' + buildNumber + ' successful';
    } else if (buildResult === 'failure') {
      state = 'failure';
      description = 'Build #' + buildNumber + ' failed';
    } else {
      state = 'error';
      description = buildStatusText;
    }
  } else {
    state = 'error';
    description = buildStatusText;
  }

  console.log('(%s:%s) %s', buildId, buildEvent.build.notifyType, description);

  teamcity
    .build(buildId)
    .info(function (err, build) {
      if (err) {
        throw err;
      }

      console.log('(%s:%s) Received build info from TeamCity', buildId, buildEvent.build.notifyType);

      if (!build.revisions ||
          !build.revisions.revision ||
          !build.revisions.revision.length) {
        deferred.reject('No revisions found');
        console.log(build);
        return;
      }

      var revision = build.revisions.revision[0];

      console.log('(%s:%s) Getting VCS info', buildId, buildEvent.build.notifyType);

      teamcity
        .vcsRootInstance(revision['vcs-root-instance'].id)
        .info(function (err, vcsRootInstance) {
          if (err) {
            throw err;
          }

          var url;
          vcsRootInstance.properties.property.forEach(function (p) {
            if (p.name === 'url') {
              url = p.value;
            }
          });

          if (!url) {
            throw new Error('Could not find VCS root instance GitHub URL');
          }

          var repoUrl = url.match(/git@github.com:(.*).git/)[1];
          var sha = revision.version;

          console.log('(%s:%s) Found VCS (%s/%s)', buildId, buildEvent.build.notifyType, repoUrl, sha);

          deferred.resolve({
            repoUrl: repoUrl,
            sha: sha,
            state: state,
            description: description,
            buildEvent: buildEvent
          });
        });
    });

  return deferred.promise;
};

app.post('/github', function (req, res) {
  res.send(201);

  var buildEvent = req.body;

  console.log('(%s:%s) Webhook received', buildEvent.build.buildId, buildEvent.build.notifyType);

  handleEvent(buildEvent)
    .then(function (completeBuildEvent) {
      console.log('(%s:%s) Status handled, pushing to GitHub', buildEvent.build.buildId, buildEvent.build.notifyType);

      // Update GitHub commit status
      var repo = client.repo(completeBuildEvent.repoUrl);
      repo.status(completeBuildEvent.sha, {
        state: completeBuildEvent.state,
        'target_url': buildEvent.build.buildStatusUrl,
        description: completeBuildEvent.description
      }, function (err) {
        if (err) {
          console.log('(%s:%s) %s'.red, buildEvent.build.buildId, buildEvent.build.notifyType, err);
        } else {
          console.log('(%s:%s) Build status sent to GitHub'.green, buildEvent.build.buildId, buildEvent.build.notifyType);
        }
      });
    }, function (err) {
      console.log('(%s:%s) %s'.red, buildEvent.build.buildId, buildEvent.build.notifyType, err);
    });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
