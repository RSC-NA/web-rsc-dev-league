const express = require('express');
const app = express();
const session = require('express-session');

const mysql = require('mysql2');

const btoa = require('btoa');
const atob = require('atob');
const e = require('express');

require('dotenv').config();

app.use( express.urlencoded({ extended: true }) );

// set up session
app.use(session({
	secret: 'rsc-dev-league',
	resave: true,
	saveUninitialized: true
}));

app.use((req, res, next) => {

	res.locals.user_id = req.session.user_id;
	res.locals.nickname = req.session.nickname;
	res.locals.discord_id = req.session.discord_id;
	res.locals.is_admin = req.session.is_admin;
	res.locals.checked_in = false;
	if ( req.session.user_id ) {
		connection.query(
			'SELECT id,active FROM signups WHERE player_id = ? AND DATE(signup_dtg) = CURDATE()',
			[ req.session.user_id ],
			(err, results) => {
				if ( results.length > 0 ) {
					req.session.checked_in = results[0].active;
					res.locals.checked_in = req.session.checked_in;
					next();
				} else {
					next();
				}
			}
		);
	} else {
		next();
	}
});

// express setup
app.use( express.static('static') ); 
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
	// TODO(load template)
	res.render('dashboard');
});

app.get('/process_login', (req, res) => {
	if ( ! req.query.rsc ) {
		res.redirect('/');
	}

	let token = atob(req.query.rsc).split(':');

	// 1. check DB for existing user, if it exists, create session and redirect
	let nickname = token[0] + '#' + token[1];
	let discord_id = token[2];

	connection.query(
		'SELECT id,admin FROM players WHERE discord_id = ?',
		[ discord_id ],
		function(err, results) {
			if ( err ) {
				console.error(err);
				throw err;
			}

			let exists = false;
			if ( results.length ) {
				exists = true;
				req.session.nickname = nickname;
				req.session.discord_id = discord_id;
				req.session.user_id = results[0].id;
				req.session.is_admin = results[0].admin ? true : false;
				res.redirect('/');
				//res.redirect('/player/' + discord_id);
			}

			// user doesn't exist, create the account.
			if ( ! exists ) {
				connection.query(
					'INSERT INTO players (nickname,discord_id) VALUES (?, ?)',
					[ nickname, discord_id ],
					function (err, results) {
						if (err) throw err;
						req.session.user_id = results.insertId;
						req.session.nickname = nickname;
						req.session.discord_id = discord_id;
						req.session.is_admin = false;
						res.redirect('/');
						//res.redirect('/player/' + discord_id);
					}
				);
			}
		}
	);
});

app.get('/check_in', (req, res) => {
	if ( req.session.discord_id && ! req.session.checked_in ) {
		// TODO(get season and match day from somewhere)
		let season = 15;
		let match_day = 1;
		connection.query(
			'INSERT INTO signups (player_id, season, match_day) VALUES (?, ?, ?)',
			[ req.session.user_id, season, match_day],
			function(err, results) {
				if ( err ) throw err;

				req.session.checked_in = true;

				res.redirect('/');
			}
		);
	} else {
		res.redirect('/');
	}
});

app.get('/check_out', (req, res) => {
	if ( req.session.discord_id && ! req.session.checked_in ) {
		// TODO(get season and match day from somewhere)
		let season = 15;
		let match_day = 1;
		connection.query(
			'DELETE FROM signups WHERE player_id = ? AND DATE(signup_dtg) = CURDATE()',
			[ req.session.user_id ],
			function(err, results) {
				if ( err ) throw err;

				req.session.checked_in = false;

				res.redirect('/');
			}
		);
	} else {
		res.redirect('/');
	}
});

app.get('/process_gameday', (req, res) => {
	res.render('template');
});

app.get('/manage_league', (req, res) => {
	res.render('manage');
});

app.get('/login', (req, res) => {
	res.render('login');
});

app.get('/logout', (req, res) => {
	if ( req.session ) {
		req.session.destroy(err => {
			if ( err ) {
				res.status(400).send('Unable to log out');
			} else {
				res.redirect('/');
			}
		});
	} else {
		res.redirect('/');
	}
});

app.get('/oauth2', async (req, res) => {
	res.render('login');
});

app.get('/callback', (req, res) => {
	res.json(req.body);
});

const connection = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	port: process.env.DB_PORT,
	database: process.env.DB_SCHEMA,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

app.listen( process.env.PORT || 3000 );