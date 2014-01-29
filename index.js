'use strict';

var express = require('express');
var mongo = require('mongoskin');
var request = require('request');

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/better-web-hooks';

var app = express();

app.configure(function () {
  app.use(express.bodyParser());
});

var eventsCollection = function () {
  return mongo.db(mongoUri, {safe:true}).collection('events');
};

app.post('/api/events', function (req, res) {
  var buildEvent = req.body;

  eventsCollection().insert(buildEvent, function (err, result) {
    if (err) {
      res.send(500, { error: err });
      return;
    }

    res.send(201, result);

    var buildNumber = buildEvent.build.buildId;

    var url = 'http://' + process.env.TC_URL + '/app/rest/builds/' + buildNumber;

    var options = {
      url: url,
      headers: {
        'Accept': 'application/json'
      }
    };

    request.get(options, function (err, response, build) {
      if (!err && response.statusCode === 200) {
        build = JSON.parse(build);
        var sha = build.revisions.revision[0].version;
        console.log('SHA:', sha);
      }
    });
  });
});

app.get('/api/events', function (req, res) {
  eventsCollection().find().toArray(function (err, result) {
    if (err) {
      res.send(500);
      return;
    }

    res.send(result);
  });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
