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

  teamcity
    .build(buildId)
    .info(function (err, build) {
      if (err) {
        throw err;
      }

      var revision = build.revisions.revision[0];

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

          console.log('Updating (' + repoUrl + '/' + sha + ')');
          console.log('Build', state);
          console.log(description);

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

  console.log('Build %d received (GitHub)', buildEvent.build.buildId);

  handleEvent(buildEvent)
    .then(function (completeBuildEvent) {
      console.log('Build %d handled, pushing to GitHub', buildEvent.build.buildId);

      // Update GitHub commit status
      var repo = client.repo(completeBuildEvent.repoUrl);
      repo.status(completeBuildEvent.sha, {
        state: completeBuildEvent.state,
        'target_url': buildEvent.build.buildStatusUrl,
        description: completeBuildEvent.description
      }, function (err) {
        if (err) {
          console.log(err.red);
        } else {
          console.log('Build status sent to GitHub'.green);
        }
      });
    }, function (err) {
      console.log(err.red);
    });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
