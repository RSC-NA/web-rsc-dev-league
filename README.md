# web-rsc-dev-league
The RSC "Dev League" is an additional league run concurrently with the regular RSC season. This league gives Free Agents the opportunity to play and earn stats throughout the regular season while they await an opportunity to play on a roster.

## Installation

```console

$ cp dotenv .env
$ npm install
```

Edit the new .env file and make sure you supply all required credentials and configurations.

## Running the app in GNU Screen

This application currently is running inside GNU Screen in the `rscadmin` account on the VPS. If you need to restart the application,
reconnect to the screen session with `screen -R` and navigate to window 0 `Ctrl-a 0`. 