'use strict';

var express = require('express');
var mongo = require('mongoskin');

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/better-web-hooks';

var app = express();

app.configure(function () {
  app.use(express.bodyParser());
  // app.use(express.methodOverride());
});

var eventsCollection = function () {
  return mongo.db(mongoUri, {safe:true}).collection('events');
};

app.post('/api/events', function (req, res) {
  var buildEvent = req.body;

  console.log('inserting', buildEvent);

  eventsCollection().insert(buildEvent, function (err, result) {
    if (err) {
      res.send(500, { error: err });
      return;
    }

    res.send(201, result);
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
