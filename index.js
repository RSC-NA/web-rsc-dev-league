const express = require('express');
const app = express();
const session = require('express-session');

const mysql = require('mysql2');

const DiscordOauth2 = require('discord-oauth2');
const oauth = new DiscordOauth2({
	clientId: process.env.DISCORD_CLIENT_ID,
	clientSecret: process.env.DISCORD_CLIENT_SECRET,
	redirectUri: 'https://rsc-devleague.herokuapp.com/oauth2'
});

const axios = require('axios');

const btoa = require('btoa');
const atob = require('atob');

require('dotenv').config();

app.use( express.urlencoded({ extended: true }) );

// set up session
app.use(session({
	secret: 'rsc-dev-league',
	resave: true,
	saveUninitialized: true
}));

app.use((req, res, next) => {
	res.locals.nickname = req.session.nickname;
	res.locals.discord_id = req.session.discord_id;

	next();
});

// express setup
app.use( express.static('static') ); 
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
	// TODO(load template)
	res.send('Hello RSC! <a href="https://discord.com/api/oauth2/authorize?client_id=1006600605265055876&redirect_uri=https%3A%2F%2Frsc-devleague.herokuapp.com%2Foauth2&response_type=token&scope=identify">Login With Discord</a>');
});

app.get('/process_login', (req, res) => {
	if ( ! req.query.rsc ) {
		res.redirect('/');
	}

	let token = atob(req.query.rsc).split(':');

	// 1. check DB for existing user, if it exists, create session and redirect
	let nickname = token[0] + '#' + token[1];
	let discord_id = token[2];

	res.send(nickname + ' - ' + discord_id);
	// 2. If it doesn't exist, create account, session, redirect
});

app.get('/login', (req, res) => {
	res.render('login');
});

app.get('/oauth2', async (req, res) => {
	res.render('login');
});

app.get('/callback', (req, res) => {
	res.json(req.body);
});

app.listen( process.env.PORT || 3000 );