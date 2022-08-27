const express = require('express');
const app = express();
const session = require('express-session');

const mysql = require('mysql2');

const btoa = require('btoa');
const atob = require('atob');
const e = require('express');

const { GoogleSpreadsheet } = require('google-spreadsheet');

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
	if ( req.session.discord_id && req.session.checked_in ) {
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

app.get('/import_contracts/:contract_sheet_id', async (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(req.params.contract_sheet_id);
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["Players"];
	const rows = await sheet.getRows();

	let players = {};

	for ( let i = 0; i < rows.length; i++ ) {
		if ( rows[i]['3v3 Active/ Returning'] == "TRUE" ) { 
			players[ rows[i]['RSC Unique ID'] ] = {
				'rsc_id': rows[i]['RSC Unique ID'],
				'name': rows[i]['Player Name'],
				'discord_id': rows[i]['Discord ID'],
			};
		}
	}

	const mmrSheet = doc.sheetsByTitle["Count/Keeper"];
	const mmrRows = await mmrSheet.getRows();

	for ( let i = 0; i < mmrRows.length; i++ ) {
		if ( mmrRows[i]['RSC ID'] in players ) {
			players[ mmrRows[i]['RSC ID'] ]['mmr'] = mmrRows[i]['Effective MMR'];
			players[ mmrRows[i]['RSC ID'] ]['tier'] = mmrRows[i]['Tier'];
		}
	}

	const contractSheet = doc.sheetsByTitle['Master Contracts'];
	const contractRows = await contractSheet.getRows();

	for ( let i = 0; i < contractRows.length; i++ ) {
		if ( contractRows[i]['RSC Unique ID'] in players ) {
			players[ contractRows[i]['RSC Unique ID'] ]['status'] = contractRows[i]['Contract Status'];
		}
	}

	connection.query('TRUNCATE TABLE contracts', (err,results) => {
		if ( err ) {  throw err; }
		
		let playersArray = [];
		for ( let rsc_id in players ) {
			let player = players[rsc_id];
			// discord_id, rsc_id, mmr, tier, status
			playersArray.push([ player['discord_id'], player['rsc_id'], player['mmr'], player['tier'], player['status'] ]);
		}

		connection.query(
			'INSERT INTO contracts (discord_id, rsc_id, mmr, tier, status) VALUES ?',
			[ playersArray ],
			(err, results) => {
				if (err) { throw err; }

				res.redirect('/manage_league');
		});
	});

});

app.get('/manage_league', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	let counts_query = 'select count(*) AS count,tier,status from contracts group by tier,status order by tier,status';
	connection.query(counts_query, (err, results) => {
		if ( err ) { throw err; }

		let tiers = {
			'all': { 'total': 0, 'fa': 0 },
		};
		for ( let i = 0; i < results.length; i++ ) {
			if ( ! (results[i]['tier'] in tiers) ) {
				tiers[ results[i]['tier'] ] = { total: 0, fa: 0 };
			}

			tiers[ results[i]['tier'] ]['total'] += results[i]['count'];
			tiers['all']['total'] += results[i]['count'];

			if ( results[i]['status'] == 'Free Agent' ) {
				tiers[ results[i]['tier'] ]['fa'] += results[i]['count'];
				tiers['all']['fa'] += results[i]['count'];
			}
		}

		let settings_query = `
		SELECT 
			id,season,contract_url,
			amateur,contender,prospect,challenger,rival,
			veteran,elite,master,premier
		FROM 
			league_settings 
		ORDER by id DESC 
		LIMIT 1
		`;
		connection.query(settings_query, (err, results) => { 
			if (err) { throw err; }
			let contract_sheet_id = results[0].contract_url.split('/')[5];
			res.render('manage', { tiers: tiers, settings: results[0], contract_sheet_id: contract_sheet_id });
		});

	});

});

app.post('/manage_league', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	let amateur    = "amateur"    in req.body ? 1 : 0;
	let contender  = "contender"  in req.body ? 1 : 0;
	let prospect   = "prospect"   in req.body ? 1 : 0;
	let challenger = "challenger" in req.body ? 1 : 0;
	let rival      = "rival"      in req.body ? 1 : 0;
	let veteran    = "veteran"    in req.body ? 1 : 0;
	let elite      = "elite"      in req.body ? 1 : 0;
	let master     = "master"     in req.body ? 1 : 0;
	let premier    = "premier"    in req.body ? 1 : 0;

	let settings_query = `
	INSERT INTO league_settings
		(
			season,contract_url,amateur,contender,prospect,challenger,
			rival,veteran,elite,master,premier
		)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	connection.query(
		settings_query,
		[
			req.body.season, req.body.contract_url, amateur, contender, prospect,
			challenger, rival, veteran, elite, master, premier
		],
		(err, results) => {
			if ( err ) { throw err; }
			res.redirect('/manage_league');
		}
	);
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