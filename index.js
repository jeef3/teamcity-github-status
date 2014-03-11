'use strict';

var express = require('express');
var Q = require('q');
var dot = require('dot');
var gitHub = require('octonode');
var Session = require('flowdock').Session;
require('colors');

var tc = require('./team-city');
var Builds = require('./builds');

var app = express();

var client = gitHub.client(process.env.GITHUB_TOKEN);
var flowdock = new Session(process.env.FLOWDOCK_TOKEN);

var dots = dot.process({ path: '.' });

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

  tc.getBuild(buildId)
    .then(function (build) {
      var revision = build.revisions.revision[0];

      tc.getVscRootInstance(revision['vcs-root-instance'].id)
        .then(function (vcsRootInstance) {
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

app.post('/flowdock', function (req, res) {
  res.send(201);

  var buildEvent = req.body;

  console.log('Build %d received (Flowdock)', buildEvent.build.buildId);

  handleEvent(buildEvent)
    .then(function (completeBuildEvent) {
      console.log('Build %d handled, sending to Flowdock', buildEvent.build.buildId);

      // Post to Flowdock
      flowdock.send('/v1/messages/team_inbox/' + process.env.FLOWDOCK_TOKEN,
        {

          source: 'better-webhooks',
          'from_address': 'mail+johnny@jeef3.com',
          subject: completeBuildEvent.description,
          content: dots.flowdock({
            build: completeBuildEvent.buildEvent.build,
            buildJSON: JSON.stringify(completeBuildEvent.buildEvent.build),
            description: completeBuildEvent.description
          }),
          'from_name': 'TeamCity',
          project: '',
          tags: [],
          link: completeBuildEvent.buildEvent.build.buildStatusUrl
        },
        function () {
          console.log('Message sent to Flowdock'.green);
        });

    }, function (err) {
      console.log(err.red);
    });
});

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

app.get('/api/events', function (req, res) {
  Builds.all()
    .then(function (builds) {
      res.send(builds);
    }, function (err) {
      res.send(500, err);
    });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
