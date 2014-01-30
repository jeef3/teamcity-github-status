'use strict';

var express = require('express');
var gitHub = require('octonode');

var tc = require('./team-city');
var Builds = require('./builds');

var app = express();

var client = gitHub.client(process.env.GITHUB_TOKEN);
var noop = function () {};

app.configure(function () {
  app.use(express.bodyParser());
});

app.post('/api/events', function (req, res) {
  Builds.add(req.body)
    .then(function (buildEvent) {
      var buildId = buildEvent.build.buildId;
      console.log('Build', buildId, 'saved');

      res.send(201, buildEvent);

      tc.getBuild(buildId)
        .then(function (build) {
          var revision = build.revisions.revision[0];

          tc.getVscRootInstance(revision['vcs-root-instance'].id)
            .then(function (vcsRootInstance) {
              var sha = revision.version;
              console.log('Updating status for:', sha);

              var state,
                description;

              switch (build.status) {
                case 'RUNNING':
                  state = 'pending';
                  description = 'Build ' + build.number + ' in progress';
                  break;

                case 'SUCCESS':
                  state = 'success';
                  description = 'Build ' + build.number + ' successful';
                  break;

                case 'FAIL': // TODO: Check?
                  state = 'fail';
                  description = 'Build ' + build.number + ' failed';
                  break;

                default:
                  state = 'error';
                  description = 'I don\'t know what happened?';
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

              // Update GitHub commit status
              var repo = client.repo(repoUrl);
              repo.status(sha, {
                state: state,
                'target_url': build.webUrl,
                description: description
              }, noop);

              // Post to Flowdock
            });
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
