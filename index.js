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
	const requestToken = req.query.code;
	const tokenUrl = 'https://discord.com/api/v10/oauth2/token';
	let url = encodeURIComponent('https://rsc-devleague.herokuapp.com/callback');
	let data = `grant_type=authorization_code&client_id=${process.env.DISCORD_CLIENT_ID}&client_secret=${process.env.DISCORD_CLIENT_SECRET}&code=${requestToken}&redirect_uri=${url}&scope=identify`;
	let headers = {
		'Content-type': 'application/x-www-form-urlencoded',
	};

	axios.post(tokenUrl, data, {
		headers: headers
	}).then((response) => {
		res.send(response);
	}).catch(error => {
		res.send(error);
	});


	//res.send(requestToken);
	// axios.post(tokenUrl, {
	// 	"grant_type": "authorization_code", 
	// 	"client_id": process.env.DISCORD_CLIENT_ID,
	// 	"client_secret": process.env.DISCORD_CLIENT_SECRET,
	// 	"code": requestToken,
	// 	"redirect_uri": "https://rsc-devleague.herokuapp.com/oauth2",
	// 	"scope": "identify",
	// }).then((data) => {
	// 	res.send(data);
	// })
	// // 	{
	// // 	method: 'post',
	// // 	url: tokenUrl,
	// // 	data: `grant_type=authorization_code&client_id=${process.env.DISCORD_CLIENT_ID}&client_secret=${process.env.DISCORD_CLIENT_SECRET}&code=${requestToken}&redirect_uri=https://rsc-devleague.herokuapp.com/callback&scope=identify`,
	// // 	data: {
	// // 		"grant_type": "authorization_code", 
	// // 		"client_id": process.env.DISCORD_CLIENT_ID,
	// // 		"client_secret": process.env.DISCORD_CLIENT_SECRET,
	// // 		"code": requestToken,
	// // 		"redirect_uri": "https://rsc-devleague.herokuapp.com/oauth2",
	// // 		"scope": "identify",
	// // 	},
	// // 	headers: {
	// // 		accept: "application/json",
	// // 	}
	// // }).then((response) => {

	// // 	oauth.getUser(response.data.access_token).then((discord_response) => {
	// // 		res.json(discord_response.data);
	// // 	});

	// // 	// axios({
	// // 	// 	method: 'get',
	// // 	// 	url: 'https://discord.com/api/v10/users/@me',
	// // 	// 	data: {
				
	// // 	// 	}
	// // 	// });

	// 	//res.json(res.data);
	// .catch((error) => {
	// 	console.log(error);
	// 	res.send(error);
	// });
});
//grant_type=authorization_code&client_id=1006600605265055876&client_secret=ZS_VzAka7l8JreNB8K-1JL7gdbA6yka3&code=KAPTOFh5g1G5fv9RRM0hF7x6qIiQ8t
app.get('/callback', (req, res) => {
	res.json(req.body);
});

app.listen( process.env.PORT || 3000 );