const express = require('express');
const app = express();
const session = require('express-session');

const mysql = require('mysql2');

const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2();

require('dotenv').config();

app.use( express.urlencoded({ extended: true }) );

// set up session
app.use(session({
	secret: 'rsc-dev-league',
	resave: true,
	saveUninitialized: true
}));

app.use((req, res, next) => {
	res.locals.discordIdent = req.session.discordIdent;
	next();
});

// express setup
app.use( express.static('static') ); 
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
	res.send('Hello RSC! <a href="https://discord.com/api/oauth2/authorize?client_id=1006600605265055876&redirect_uri=https%3A%2F%2Frsc-devleague.herokuapp.com%2Foauth2&response_type=code&scope=identify">Login With Discord</a>');
});

app.get('/oauth2', (req, res) => {
	oauth.tokenRequest({
		clientId: process.env.DISCORD_CLIENT_ID,
		clientSecret: process.env.DISCORD_CLIENT_SECRET,
		code: req.query.code,
		scope: "identify",
		grantType: "authorization_code",
		redirectUrl: "https://rsc-devleague.herokuapp.com/callback",
	}).then(console.log);
});

app.get('/callback', (req, res) => {
	res.json(req.body);
});

app.listen( process.env.PORT || 3000 );