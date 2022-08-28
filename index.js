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
	res.locals.user = req.session.user || {};

	res.locals.checked_in = false;
	if ( req.session.user_id ) {
		connection.query(
			'SELECT id,active FROM signups WHERE player_id = ? AND DATE(signup_dtg) = CURDATE()',
			[ req.session.user_id ],
			(err, results) => {
				if ( results.length > 0 ) {
					req.session.checked_in = true;
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
		'SELECT p.id,p.admin,c.name,c.mmr,c.tier,c.status,c.rsc_id FROM players AS p LEFT JOIN contracts AS c on p.discord_id = c.discord_id WHERE p.discord_id = ?',
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

				let user = {
					user_id: results[0].id,
					nickname: nickname,
					name: results[0].name,
					mmr: results[0].mmr,
					tier: results[0].tier,
					status: results[0].status,
					rsc_id: results[0].rsc_id,
					discord_id: discord_id,
					is_admin: results[0].admin ? true: false,
				};

				req.session.user = user;
				console.log(user);

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

						connection.query(
							'SELECT p.id,p.admin,c.name,c.mmr,c.tier,c.status,c.rsc_id FROM players AS p LEFT JOIN contracts AS c on p.discord_id = c.discord_id WHERE p.discord_id = ?',
							[ discord_id ],
							(err, results) => {
								let user = {
									user_id: results[0].id,
									nickname: nickname,
									name: results[0].name,
									mmr: results[0].mmr,
									tier: results[0].tier,
									status: results[0].status,
									rsc_id: results[0].rsc_id,
									discord_id: discord_id,
									is_admin: results[0].admin ? true: false,
								};
				
								req.session.user = user;
								res.redirect('/');
						});
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
		let active = req.session.user['status'] == 'Free Agent' ? 1 : 0;
		connection.query(
			'INSERT INTO signups (player_id, season, match_day, active) VALUES (?, ?, ?, ?)',
			[ req.session.user_id, season, match_day, active],
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

app.post('/generate_team/:tier', (req, res) => {
	// TODO (err trapping with invalid values)
	let numPlayers = req.body.player_count;
	let numTeams = numPlayers / 3;
	let tier = req.params.tier;

	let players = [];
	let teams = {};

	for ( let i = 0; i < numPlayers; i++ ) {
		players.push(parseInt(req.body['player_id_' + i]));
	}

	for ( let i = 1; i <= numTeams; i++ ) {
		teams[tier + '_' + i] = {
			home: i % 2 ? false : true,
			away: i % 2 ? true : false,
			match_day: req.body.match_day,
			season: req.body.season,
			team_number: i,
			players: [],
			mmr: 0,
		};
	}

	let playersQuery = 'select p.id,c.name,c.mmr,c.tier from players as p left join contracts as c on p.discord_id = c.discord_id where p.id in (?) ORDER BY c.mmr DESC';
	connection.query(playersQuery, [ players ], (err, results) => {
		if ( err ) { throw err; }

		let playerList = [];
		for ( let i = 0; i < results.length; i++ ) {
			playerList.push(results[i]);
		}

		let curTeam = 1;
		let direction = 'up';

		while ( playerList.length ) {
			let player = playerList.pop();
			let mmr = player['mmr'];

			teams[tier + '_' + curTeam]['players'].push(player);
			teams[tier + '_' + curTeam]['mmr']+= mmr;

			if ( direction == 'up' ) {
				curTeam += 1;
				if ( curTeam == numTeams ) {
					direction = 'down';

					if ( playerList.length ) {
						let playerTwo = playerList.pop();
						let playerTwoMmr = playerTwo['mmr'];

						teams[tier + '_' + curTeam]['players'].push(playerTwo);
						teams[tier + '_' + curTeam]['mmr']+= playerTwoMmr;
					}
				}
			} else {
				curTeam -= 1;

				if ( curTeam == 1 ) {
					direction = 'up';

					if ( playerList.length ) {
						let playerTwo = playerList.pop();
						let playerTwoMmr = playerTwo['mmr'];

						teams[tier + '_' + curTeam]['players'].push(playerTwo);
						teams[tier + '_' + curTeam]['mmr']+= playerTwoMmr;
					}
				}
			}
		}

		// id, team_number, tier
		// ['Elite_1', 'Elite_2' ] => [ [1, 'Elite' ], [2, 'Elite'] ]
		let teamParams = Object.keys(teams).map(tierString => [ tierString.split('_')[1], tierString.split('_')[0] ] );
		let teamsQuery = 'INSERT INTO teams (team_number, tier) VALUES ?';
		connection.query(teamsQuery, [ teamParams ], (err, results) => {
			if ( err ) { throw err; }
			console.log(results);
			res.json(teams);
		});
		
		// id, team_id, player_id 

		//res.json(teams);

		// 1 -> 1,4,5
		// 2 -> 2,3,6

		// 1 -> 1, 8, 9
		// 2 -> 2, 7, 10
		// 3 -> 3, 6, 11
		// 4 -> 4, 5, 12
	

		// create teams
		// insert players into teams
	});
});

app.get('/make_active/:signup_id', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	let query = 'UPDATE signups SET active = 1 WHERE id = ?';
	connection.query(query, [ req.params.signup_id ], (err, results) => {
		res.redirect('/process_gameday');
	});
});

app.get('/make_inactive/:signup_id', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	let query = 'UPDATE signups SET active = 0 WHERE id = ?';
	connection.query(query, [ req.params.signup_id ], (err, results) => {
		res.redirect('/process_gameday');
	});
});

app.get('/process_gameday', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	let signups_query = `
	SELECT 
		s.id,s.player_id,s.active,p.discord_id,c.rsc_id,c.name,c.mmr,c.tier,c.status
	FROM 
		signups AS s
	LEFT JOIN players AS p 
		ON s.player_id = p.id
	LEFT JOIN contracts AS c
		ON p.discord_id = c.discord_id
	ORDER BY c.mmr DESC
	`; // WHERE DATE(s.signup_dtg) = CURDATE()

	connection.query(signups_query, (err, results) => {
		if ( err ) { throw err; }

		let signups = {};
		for ( let i = 0; i < results.length; i++ ) {
			if ( ! ( results[i]['tier'] in signups ) ) {
				signups[ results[i]['tier'] ] = {
					'fa': [],
					'sub': [],
				};
			}
			if ( results[i]['active'] == 1 ) {
				signups[ results[i]['tier'] ]['fa'].push(results[i]);
			} else {
				signups[ results[i]['tier'] ]['sub'].push(results[i]);
			}	
		}
		console.log(signups);
		res.render('process', { signups: signups });
	});

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
			playersArray.push([ player['discord_id'], player['rsc_id'], player['name'], player['mmr'], player['tier'], player['status'] ]);
		}

		connection.query(
			'INSERT INTO contracts (discord_id, rsc_id, name, mmr, tier, status) VALUES ?',
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

	let counts_query = 'select count(*) AS count,tier,status from contracts where tier != "" group by tier,status order by tier,status';
	connection.query(counts_query, (err, results) => {
		if ( err ) { throw err; }

		let tiers = {
			'all': { 'total': 0, 'fa': 0 },
			'Premier': { 'total': 0, 'fa': 0 },
			'Master': { 'total': 0, 'fa': 0 },
			'Elite': { 'total': 0, 'fa': 0 },
			'Veteran': { 'total': 0, 'fa': 0 },
			'Rival': { 'total': 0, 'fa': 0 },
			'Challenger': { 'total': 0, 'fa': 0 },
			'Prospect': { 'total': 0, 'fa': 0 },
			'Contender': { 'total': 0, 'fa': 0 },
			'Amateur': { 'total': 0, 'fa': 0 },
		};
		for ( let i = 0; i < results.length; i++ ) {
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