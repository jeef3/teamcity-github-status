'use strict';

var express = require('express');
var mongo = require('mongoskin');

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/better-web-hooks';

var app = express();

var eventsCollection = function () {
  return mongo.db(mongoUri, {safe:true}).collection('events');
};

app.post('/api/events', function (req, res) {
  eventsCollection().insert(event, { strict: true }, function (err, doc) {
    if (err) {
      res.send(500);
      return;
    }

    res.send(doc);
  });
});

app.get('/api/events', function (req, res) {
  eventsCollection().find({}, function (err, cursor) {
    if (err) {
      res.send(500);
      return;
    }

    res.send(cursor);
  });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log('Listening on ' + port);
});
