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

var buildMessage = function (build) {
  var message = {};

  var buildResult = build.buildResult.toLowerCase();
  var notifyType = build.notifyType.toLowerCase();
  var buildNumber = build.buildNumber;
  var buildStatusText = build.buildStatus;

  // TeamCity has a rather complicated mixture of result and type to
  // determine state
  if (notifyType === 'buildstarted') {
    message.state = 'pending';
    message.description = 'Build #' + buildNumber + ' in progress';
  } else if (notifyType === 'buildinterrupted') {
    //error: interrupted
    message.state = 'error';
    message.description = 'Build #' + buildNumber + ' interrupted';

  } else if (notifyType === 'beforebuildfinish') {
    message.state = 'pending';
    message.description = 'Build #' + buildNumber + ' almost finished';

  } else if (notifyType === 'buildfinished') {
    // check status: success/failure
    if (buildResult === 'success') {
      message.state = 'success';
      message.description = 'Build #' + buildNumber + ' successful';
    } else if (buildResult === 'failure') {
      message.state = 'failure';
      message.description = 'Build #' + buildNumber + ' failed';
    } else {
      message.state = 'error';
      message.description = buildStatusText;
    }
  } else {
    message.state = 'error';
    message.description = buildStatusText;
  }

  return message;
};

var handleEvent = function (buildEvent) {
  var deferred = Q.defer();

  var buildId = buildEvent.build.buildId;
  var message = buildMessage(buildEvent.build);

  console.log('(%s:%s)   Message: %s'.black, buildId, buildEvent.build.notifyType, message.description);
  console.log('(%s:%s)   Requesting changes for build'.black, buildId, buildEvent.build.notifyType);

  teamcity
    .build(buildId)
    .info(function (err, buildInfo) {
      if (err) {
        deferred.reject(err);
        return;
      }

      if (!buildInfo.lastChanges || !buildInfo.lastChanges.count) {
        deferred.reject('No changes found');
        return;
      }

      console.log('(%s:%s)   Requesting change info'.black, buildId, buildEvent.build.notifyType);

      teamcity
        .change(buildInfo.lastChanges.change[0].id)
        .info(function (err, change) {
          if (err) {
            deferred.reject(err);
            return;
          }

          console.log('(%s:%s)   Getting VCS root info from change'.black, buildId, buildEvent.build.notifyType);

          teamcity
            .vcsRootInstance(change.vcsRootInstance.id)
            .info(function (err, vcsRootInstance) {
              if (err) {
                deferred.reject(err);
                return;
              }

              var url;
              vcsRootInstance.properties.property.forEach(function (p) {
                if (p.name === 'url') {
                  url = p.value;
                }
              });

              if (!url) {
                deferred.reject('Could not find GitHub URL in VCS root instance properties');
                return;
              }

              var repoUrl = url.match(/git@github.com:(.*).git/)[1];
              var sha = change.version;

              console.log('(%s:%s)   Found GitHub details: %s#%s'.black, buildId, buildEvent.build.notifyType, repoUrl, sha.substring(0, 7));

              deferred.resolve({
                repoUrl: repoUrl,
                sha: sha,
                state: message.state,
                description: message.description,
                buildEvent: buildEvent
              });
            });
        });
    });

  return deferred.promise;
};

app.post('/github', function (req, res) {
  res.send(201);

  var buildEvent = req.body;

  console.log('(%s:%s) Received TeamCity build event'.bold.white,
    buildEvent.build.buildId,
    buildEvent.build.notifyType);

  handleEvent(buildEvent)
    .then(function (completeBuildEvent) {
      console.log('(%s:%s)   Build info resolved: [%s] "%s"'.black,
        buildEvent.build.buildId,
        buildEvent.build.notifyType,
        completeBuildEvent.state,
        completeBuildEvent.description);

      // Update GitHub commit status
      var repo = client.repo(completeBuildEvent.repoUrl);
      repo.status(completeBuildEvent.sha, {
        state: completeBuildEvent.state,
        'target_url': buildEvent.build.buildStatusUrl,
        description: completeBuildEvent.description
      }, function (err) {
        if (err) {
          console.log('(%s:%s) ✘ %s'.bold.red, buildEvent.build.buildId, buildEvent.build.notifyType, err);
        } else {
          console.log('(%s:%s) ✔︎ Build status sent to GitHub'.bold.green,
            buildEvent.build.buildId,
            buildEvent.build.notifyType);
        }
      });
    }, function (err) {
      console.log('(%s:%s) ✘ %s'.bold.red, buildEvent.build.buildId, buildEvent.build.notifyType, err);
    });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
