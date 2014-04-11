# TeamCity GitHub Status

GitHub commit status from TeamCity

## Set-up

Make sure you have the [TeamCity WebHooks plugin](http://netwolfuk.wordpress.com/teamcity-plugins/tcwebhooks/) set-up and working first.

Set-up environment variables for:

 - `TEAMCITY_USERNAME`
 - `TEAMCITY_PASSWORD`
 - `TEAMCITY_PROTOCOL`
 - `TEAMCITY_BASE_URL`
 - `GITHUB_TOKEN`

Start up the server with `npm start`

Set-up web hooks in TeamCity to point to where ever the server is running.
