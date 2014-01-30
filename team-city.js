'use strict';

var request = require('request');
var Q = require('q');

module.exports = {
  getBuild: function (buildNumber) {
    var deferred = Q.defer();

    console.log('Getting build info for build', buildNumber);

    var options = {
      url: 'http://' + process.env.TC_URL + '/app/rest/builds/' + buildNumber,
      headers: {
        'Accept': 'application/json'
      }
    };

    request.get(options, function (err, response, buildInfo) {
      if (err || response.statusCode !== 200) {
        deferred.reject(err);
      }

      deferred.resolve(JSON.parse(buildInfo));
    });

    return deferred.promise;
  }
};
