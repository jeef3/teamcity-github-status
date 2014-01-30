'use strict';

var mongo = require('mongoskin');
var Q = require('q');

var mongoUri = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
  'mongodb://localhost/better-web-hooks';

var eventsCollection = function () {
  return mongo.db(mongoUri, {safe:true}).collection('events');
};

module.exports = {
  add: function (buildEvent) {
    var deferred = Q.defer();

    eventsCollection().insert(buildEvent, function (err, result) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(result[0]);
      }
    });

    return deferred.promise;
  },
  all: function () {
    var deferred = Q.defer();

    eventsCollection().find().toArray(function (err, result) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(result);
      }
    });

    return deferred.promise;
  }
};
