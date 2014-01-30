'use strict';

var express = require('express');
var gitHub = require('octonode');

var tc = require('./team-city');
var Builds = require('./builds');

var app = express();

var client = gitHub.client(process.env.GITHUB_TOKEN);

app.configure(function () {
  app.use(express.bodyParser());
});

app.post('/api/events', function (req, res) {
  console.log('Build recieved');

  Builds.add(req.body)
    .then(function (buildEvent) {

      res.send(201, buildEvent);

      tc.getBuildInfo(buildEvent.build.buildId)
        .then(function (buildInfo) {
          var sha = buildInfo.revisions.revision[0].version;
          console.log('Updating status for:', sha);

          var state,
            description;

          switch (buildEvent.buildResult) {
            case 'running':
              state = 'pending';
              description = 'Build ' + buildEvent.buildNumber + ' in progress';
              break;

            case 'success':
              state = 'success';
              description = 'Build ' + buildEvent.buildNumber + ' successful';
              break;

            case 'fail': // TODO: Check?
              state = 'fail';
              description = 'Build ' + buildEvent.buildNumber + ' failed';
              break;

            default:
              state = 'success';
          }

          // Update GitHub commit status
          var repo = client.repo('skilitics/thrive');
          repo.status(sha, {
            state: state,
            'target_url': buildInfo.webUrl,
            description: description
          });

          // Post to Flowdock
        });

    }, function (err) {
      res.send(500, err);
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
