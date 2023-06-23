const express = require('express');
const app = express();
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');


const mysql  = require('mysql2');
const mysqlP = require('mysql2/promise');

const btoa = require('btoa');
const atob = require('atob');
const e = require('express');

function writeError(error) {
	fs.writeFileSync('./errors.log', error, { flag: 'a+' });
}

const { GoogleSpreadsheet } = require('google-spreadsheet');

require('dotenv').config();

app.use( express.urlencoded({ extended: true }) );

let title = 'RSC Development League';

const matchDays = {
	//'2023-05-03': 'holiday', // nice - end of season blowout
	'2023-05-15': 1,
	'2023-05-17': 2,
	'2023-05-22': 3,
	'2023-05-24': 4,
	'2022-05-29': 'holiday',
	'2023-05-31': 5,
	'2023-06-05': 6,
	'2023-06-07': 7,
	'2023-06-12': 8,
	'2023-06-14': 9,
	'2023-06-19': 10,
	'2023-06-21': 11,
	'2023-06-26': 12,
	'2023-06-28': 13,
	'2022-07-03': 'holiday',
	'2022-07-05': 'holiday',
	'2023-07-10': 14,
	'2023-07-12': 15,
	'2023-07-17': 16,
};

const mmrRange = {
	'Premier': { 
		'max': 2010,
		'min': 1750,
	},
	'Master': { 
		'max': 1745,
		'min': 1650,
	},
	'Elite': { 
		'max': 1645,
		'min': 1505,
	},
	'Veteran': { 
		'max': 1500,
		'min': 1415,
	},
	'Rival': { 
		'max': 1410,
		'min': 1300,
	},
	'Challenger': { 
		'max': 1295,
		'min': 1170,
	},
	'Prospect': { 
		'max': 1165,
		'min': 1050,
	},
	'Contender': { 
		'max': 1045,
		'min': 920,
	},
	'Amateur': { 
		'max': 915,
		'min': 500,
	},
};

function getTierFromMMR(mmr) {
	for ( let tier in mmrRange ) {
		if ( mmr >= mmrRange[tier]['min'] && mmr <= mmrRange[tier]['max'] ) {
			return tier;
		}
	}
}

// set up session
app.use(session({
	secret: 'rsc-dev-league',
	resave: true,
	saveUninitialized: true
}));

app.use(cors({
	origin: '*'
}));

app.use((req, res, next) => {

	let host = req.headers.host;
	if ( ! (host == 'devleague.rscstream.com' || host == 'api.rscstream.com') ) {
		return res.redirect('https://devleague.rscstream.com');
	}

	//console.log(`${host} - ${req.path}`);

	res.locals.callbackUrl = encodeURIComponent('https://devleague.rscstream.com/oauth2');

	res.locals.user_id = req.session.user_id;
	res.locals.nickname = req.session.nickname;
	res.locals.discord_id = req.session.discord_id;
	res.locals.is_admin = req.session.is_admin;
	res.locals.user = req.session.user || {};
	res.locals.rostered = req.session.rostered;

	res.locals.title = title;

	res.locals.checked_in = false;

	let settings = {
		season: 17,
		premier: false,
		master: false,
		elite: false,
		veteran: false,
		rival: false,
		challenger: false,
		prospect: false,
		contender: false,
		amateur: false
	};

	res.locals.settings = settings;

	let tiersQuery = 'SELECT season,amateur,contender,prospect,challenger,rival,veteran,elite,master,premier FROM league_settings ORDER BY id DESC LIMIT 1';
	connection.query(tiersQuery, (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			res.locals.settings = {
				season: results[0].season,
				amateur: results[0].amateur, 
				contender: results[0].contender,
				prospect: results[0].prospect,
				challenger: results[0].challenger,
				rival: results[0].rival,
				veteran: results[0].veteran,
				elite: results[0].elite,
				master: results[0].master,
				premier: results[0].premier,
			};
		}

		if ( req.session.user_id ) {
			connection.query(
				'SELECT id,active,rostered FROM signups WHERE player_id = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
				[ req.session.user_id ],
				(err, results) => {
					if ( results && results.length > 0 ) {
						req.session.checked_in = true;
						req.session.rostered = results[0].rostered;
						res.locals.checked_in = req.session.checked_in;
						res.locals.rostered = req.session.rostered;
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
});

// express setup
app.use( express.static('static') ); 
app.set('view engine', 'ejs');

app.use(bodyParser.json());

/*******************************************************
 ******************** Player Views *********************
 ******************************************************/
app.get('/', (req, res) => {
	// TODO(load template)
	let date = new Date(new Date().setHours(12)).toISOString().split('T')[0];
	let match_day = false;
	if ( date in matchDays ) {
		match_day = matchDays[date];
	}

	res.render('dashboard', { today: date, match_day: match_day, match_days: matchDays, server: req.headers });
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

app.get('/check_in/:match_day', (req, res) => {
	if ( req.session.discord_id && ! req.session.checked_in ) {
		// TODO(get season and match day from somewhere)
		let season = res.locals.settings.season;
		let match_day = req.params.match_day;
		let active = req.session.user['status'] == 'Free Agent' ? 1 : 0;
		let status = req.session.user['status'];
		connection.query(
			'INSERT INTO signups (player_id, signup_dtg, season, match_day, active, status) VALUES (?, ?, ?, ?, ?, ?)',
			[ req.session.user_id, new Date(), season, match_day, active, status],
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

app.get('/check_out/:match_day', (req, res) => {
	if ( req.session.discord_id && req.session.checked_in ) {
		// TODO(get season and match day from somewhere)
		let season = res.locals.settings.season;
		let match_day = req.params.match_day;
		connection.query(
			'DELETE FROM signups WHERE player_id = ? AND match_day = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
			[ req.session.user_id, match_day ],
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

app.get('/match', (req, res) => {
	let player_id = req.session.user_id;

	if ( ! player_id  ) {
		return res.redirect('/');
	}

	if ( ! res.locals.rostered ) {
		return res.redirect('/');
	}

	res.locals.title = 'Your Match Info - ' + res.locals.title;

	let matchQuery = `
		SELECT 
			m.id, m.season, m.match_day, m.lobby_user, m.lobby_pass, 
			tp.team_id, tp.player_id, c.name, c.mmr
		FROM
			matches AS m
		LEFT JOIN
			team_players AS tp
			ON ( m.home_team_id = tp.team_id OR m.away_team_id = tp.team_id )
		LEFT JOIN
			players AS p 
			ON tp.player_id = p.id
		LEFT JOIN 
			contracts AS c
			ON p.discord_id = c.discord_id
		WHERE 
			(
				DATE(m.match_dtg) = CURDATE() OR
				DATE_ADD(DATE(m.match_dtg), INTERVAL 1 DAY) = CURDATE()
			)
			AND
			m.id = (
				SELECT id FROM matches 
				where home_team_id = (SELECT team_id FROM team_players WHERE player_id = ? ORDER BY id DESC LIMIT 1) OR 
				away_team_id = (SELECT team_id FROM team_players WHERE player_id = ? ORDER BY id DESC LIMIT 1)
			)
		ORDER BY tp.team_id ASC, c.mmr DESC
	`;

	connection.query(matchQuery, [ player_id, player_id ], (err, results) => {
		if ( err ) { throw err; }

		res.render('match', { 
			season: results[0].season, 
			match_day: results[0].match_day, 
			lobby_user: results[0].lobby_user, 
			lobby_pass: results[0].lobby_pass, 
			players: results 
		});
	});
});

app.get('/match/:match_id', (req, res) => {

	res.locals.title = `Match ${req.params.match_id} Info - ${res.locals.title}`;

	let matchQuery = `
		SELECT 
			m.id, m.season, m.match_day, m.lobby_user, m.lobby_pass, 
			tp.team_id, tp.player_id, c.name, c.mmr
		FROM
			matches AS m
		LEFT JOIN
			team_players AS tp
			ON ( m.home_team_id = tp.team_id OR m.away_team_id = tp.team_id )
		LEFT JOIN
			players AS p 
			ON tp.player_id = p.id
		LEFT JOIN 
			contracts AS c
			ON p.discord_id = c.discord_id
		WHERE 
			m.id = ?
		ORDER BY tp.team_id ASC, c.mmr DESC
	`;

	connection.query(matchQuery, [ req.params.match_id ], (err, results) => {
		if ( err ) { throw err; }

		res.render('match', { 
			season: results[0].season, 
			match_day: results[0].match_day, 
			lobby_user: results[0].lobby_user, 
			lobby_pass: results[0].lobby_pass, 
			players: results 
		});
	});

});

app.get('/matches', (req, res) => {
	res.locals.title = `Season ${res.locals.settings.season} Matches - ${res.locals.title}`;

	let matchesQuery = 'SELECT m.id,m.match_day,m.lobby_user,m.lobby_pass,t.tier FROM matches AS m LEFT JOIN teams AS t ON m.home_team_id = t.id WHERE m.season = ? ORDER BY m.match_day DESC';
	connection.query(matchesQuery, [ res.locals.settings.season ], (err, results) => {
		if ( err ) { throw err; }

		res.render('matches', { matches: results });
	});
});

/********************************************************
 ********************** API Views ***********************
 *******************************************************/
app.get('/store_trackers', (req, res) => {
	// if ( ! req.session.is_admin ) {
	// 	return res.redirect('/');
	// } 

	// fetch all active players from contracts
	let active_players = {};
	let contractsQuery = 'SELECT rsc_id,name FROM contracts';
	console.log('store trackers!');
	connection.query(contractsQuery, async (err, results) => {
		if ( err ) { throw err; }

		for ( let i = 0; i < results.length; ++i ) {
			active_players[ results[i].rsc_id ] = results[i].name;
		}

		// 1. create google sheets object
		const doc = new GoogleSpreadsheet('1HLd_2yMGh_lX3adMLxQglWPIfRuiSiv587ABYnQX-0s');
		// 2. authenticate
		doc.useApiKey(process.env.GOOGLE_API_KEY);

		// 3. pull all relevant fields
		await doc.loadInfo();

		const sheet = doc.sheetsByTitle["Link List"];
		const rows = await sheet.getRows();
		//await sheet.loadCells('A:C');

		let trackers = [];

		for ( let i = 0; i < rows.length; i++ ) {
			let rsc_id = rows[i]._rawData[0];
			let player_name = rows[i]._rawData[1];
			let tracker = rows[i]._rawData[2];

			if ( ! (rsc_id in active_players) ) {
				continue;
			}

			trackers.push([ rsc_id, player_name, tracker ]);
		}

		connection.query('TRUNCATE trackers', (err, results) => {
			if ( err ) { throw err; }

			console.log('Inserting trackers', trackers.length);
			connection.query('INSERT INTO trackers (rsc_id, name, tracker_link) VALUES ?', [trackers], (err,results) => {
				if ( err ) {
					console.error('Error inserting:',err);
				}
				res.redirect('/');
			});
		});

	});
});

app.post('/save_mmr', (req, res) => {
	const d = req.body;
	console.log(d);

	connection.query('SELECT rsc_id,name FROM trackers WHERE tracker_link like "%?%"', [ `${d.platform}/${d.user_id}` ], (err, results) => {
		if ( err ) { console.error('ERROR', err); throw err; }

		if ( results && results.length ) {
/*

CREATE TABLE tracker_data (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`psyonix_season` INT UNSIGNED NOT NULL,
	`tracker_link` VARCHAR(255) NOT NULL,
	`rsc_id` VARCHAR(10) NOT NULL,
	`threes_games_played` INT UNSIGNED,
	`threes_rating` INT UNSIGNED,
	`threes_season_peak` INT UNSIGNED,
	`twos_games_played` INT UNSIGNED,
	`twos_rating` INT UNSIGNED,
	`twos_season_peak` INT UNSIGNED,
	`ones_games_played` INT UNSIGNED,
	`ones_rating` INT UNSIGNED,
	`ones_season_peak` INT UNSIGNED,
	`date_pulled` DATETIME NOT NULL DEFAULT now(),
	`pulled_by` VARCHAR(50) NOT NULL DEFAULT '',
	`sent_to_api` tinyint(1) not null default 0,
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
*/

			let query = `
			INSERT INTO tracker_data 
				(psyonix_season,tracker_link,rsc_id,threes_games_played,threes_rating,threes_season_peak,
				twos_games_played,twos_rating,twos_season_peak,ones_games_played,ones_rating,ones_season_peak)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`;
			connection.query(
				query, 
				[ d.psyonix_season, d.tracker_link.link, results[0].rsc_id, d.threes_games_played, d.threes_rating, d.threes_season_peak,
				d.twos_games_played, d.twos_rating, d.twos_season_peak, d.ones_games_played, d.ones_rating, d.ones_season_peak ],
				(err, results) => {
					if ( err ) { console.error('Insert error:', err); throw err; }

					res.json({ success: true });
			});
		} else {
			res.json({ success: false, 'error': 'This tracker is not attached to an RSC player.' });
		}
	});

});

app.get('/teams', (req, res) => {
	let isTwos = req.get('league');
	let tableName = 'StreamTeamStats';
	if ( isTwos ) {
		tableName = 'StreamTeamStats2';
	}

	let query = `SELECT id, season, franchise, teamName, tier, wins, loss, winPct, \`rank\`, gm, conference, division, gamesPlayed, shotPct, points, goals, assists, saves, shots, goalDiff, oppShotPct, oppPoints, oppGoals, oppAssists, oppSaves, oppShots FROM ${tableName} ORDER BY teamName`;
	connection.query(query, (err, results) => {
		if (err) { 
			res.json(err);
		}
		res.json(results);
	});
});
app.get('/teams/:tier', (req, res) => {
	let isTwos = req.get('league');
	let tableName = 'StreamTeamStats';
	if ( isTwos ) {
		tableName = 'StreamTeamStats2';
	}

	let query = `SELECT id, season, franchise, teamName, tier, wins, loss, winPct, \`rank\`, gm, conference, division, gamesPlayed, shotPct, points, goals, assists, saves, shots, goalDiff, oppShotPct, oppPoints, oppGoals, oppAssists, oppSaves, oppShots FROM ${tableName} WHERE tier = ? ORDER BY teamName`;
	connection.query(query, [req.params.tier], (err, results) => {
		if (err) { 
			res.json(err);
		}
		res.json(results);
	});

});
app.get('/players', (req, res) => {
	let isTwos = req.get('league');
	let tableName = 'StreamPlayerStats';
	if ( isTwos ) {
		tableName = 'StreamPlayerStats2';
	}

	let query = `SELECT id, season, tier, teamName, playerName, gp, gw, gl, wPct, mvPs, pts, goals, assists, saves, shots, shotPct, ppg, gpg, apg, svPG, soPG, cycles, hatTricks, playmakers, saviors FROM ${tableName} ORDER BY playerName`;
	connection.query(query, (err, results) => {
		res.json(results);
	});
});
app.get('/players/:teamName', (req, res) => {
	let isTwos = req.get('league');
	let tableName = 'StreamPlayerStats';
	if ( isTwos ) {
		tableName = 'StreamPlayerStats2';
	}

	let query = `SELECT id, season, tier, teamName, playerName, gp, gw, gl, wPct, mvPs, pts, goals, assists, saves, shots, shotPct, ppg, gpg, apg, svPG, soPG, cycles, hatTricks, playmakers, saviors FROM ${tableName} WHERE teamName = ? ORDER BY playerName`;
	connection.query(query, [req.params.teamName], (err, results) => {
		res.json(results);
	});
});
app.get('/tiers', (req, res) => {
	let isTwos = req.get('league');
	let tiers = [ 'Premier', 'Master', 'Elite', 'Veteran', 'Rival', 'Challenger', 'Prospect', 'Contender', 'Amateur'];
	if ( isTwos ) {
		tiers = [ 'Premier', 'Elite', 'Veteran', 'Rival', 'Challenger', 'Prospect', 'Contender'];
	}
	res.json( tiers.map(el => { return {'name': el} }) );
});

app.get('/pull_stats', pull_stats);
app.get('/pull_stats_2', pull_stats);

function forceInt(val) {
	if ( parseInt(val) == NaN ) {
		return 0;
	}

	return parseInt(val);
}

async function pull_stats(req, res) {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	let sheetId          = '1qulf-2ehBrZ8A2-E6kQsezSQ4V_2fQ9IHCm7RWlRXwA';
	let teamStatsTable   = 'StreamTeamStats';
	let playerStatsTable = 'StreamPlayerStats';
	if ( req.route.path == '/pull_stats_2' ) {
		teamStatsTable   = 'StreamTeamStats2';
		playerStatsTable = 'StreamPlayerStats2';
		sheetId = '1CzIjrTdc7e7qK0blwl1rudhJxaCIxSI6WIiycHzMurY';
	}
	let output = [];

	const conn2 = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(sheetId);

	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	// sheets = Team List, Team Stats, Player Stats, Team Standings, Variables
	const TeamSheet = doc.sheetsByTitle["Team List"];
	const TeamRows = await TeamSheet.getRows();

	let teams = [];
	let franchiseByTeam = {};
	let tierByTeam = {};
	// Team Name, Franchise, Tier
	// StreamTeamStats, StreamTeamStats2
	// SELECT Id, Season, Franchise, TeamName, Tier, Wins, Loss, WinPct, `Rank`, GM, Conference, Division, GamesPlayed, ShotPct, Points, Goals, Assists, Saves, Shots, GoalDiff, OppShotPct, OppPoints, OppGoals, OppAssists, OppSaves, OppShots FROM {teamStatsTable} ORDER BY TeamName
	for ( let i = 0; i < TeamRows.length; i++ ) {
		teams.push({ name: TeamRows[i]['Team Name'], franchise: TeamRows[i]['Franchise'], tier: TeamRows[i]['Tier'] });
		franchiseByTeam[ TeamRows[i]['Team Name'] ]  = TeamRows[i]['Franchise'];
		tierByTeam[ TeamRows[i]['Team Name'] ]       = TeamRows[i]['Tier'];
	}
	// log tiers
	console.log(tierByTeam);

	const StandingsSheet = doc.sheetsByTitle['Team Standings'];
	const StandingsRows  = await StandingsSheet.getRows();
	const dataRows = StandingsRows.slice(1);
	let divisionsByTeam = {};
	let ranksByTeam =  {};
	for ( let i = 0; i < dataRows.length; i++ ) {
		let team     = dataRows[i]._rawData[1];
		let division = dataRows[i]._rawData[3];
		let rank     = dataRows[i]._rawData[4];
		//console.log(team, division, rank);
		divisionsByTeam[ team ] = division;
		ranksByTeam[ team ] = rank;
	}

	// log divisions
	//console.log(divisionsByTeam);

	let teamStats = [];
	const TeamStatsSheet = doc.sheetsByTitle['Team Stats'];
	const TeamStatsRows  = await TeamStatsSheet.getRows();
	for ( let i = 0; i < TeamStatsRows.length; i++ ) {
		teamStats.push({
			'Season'     : res.locals.settings.season,// external
			'Franchise'  : franchiseByTeam[ TeamStatsRows[i]['Team'] ] ?? '',
			'TeamName'   : TeamStatsRows[i]['Team'] ?? '',
			'Tier'       : tierByTeam[ TeamStatsRows[i]['Team'] ] ?? '',
			'Wins'       : TeamStatsRows[i]['W'] ?? 0,
			'Loss'       : TeamStatsRows[i]['L'] ?? 0,
			'WinPct'     : TeamStatsRows[i]['W%'].replace(/\%/,'') ?? 0,
			'Rank'       : ranksByTeam[ TeamStatsRows[i]['Team'] ] ?? 0, 
			'GM'         : TeamStatsRows[i]['GM'] ?? '',
			'Conference' : TeamStatsRows[i]['Conference'] ?? '',
			'Division'   : divisionsByTeam[ TeamStatsRows[i]['Team'] ] ?? '', 
			'GamesPlayed': TeamStatsRows[i]['GP'] ?? 0,
			'ShotPct'    : TeamStatsRows[i]['Shot %'].replace(/\%/,'') ?? 0,
			'Points'     : TeamStatsRows[i]['Points'] ?? 0,
			'Goals'      : TeamStatsRows[i]['Goals'] ?? 0,
			'Assists'    : TeamStatsRows[i]['Assists'] ?? 0,
			'Saves'      : TeamStatsRows[i]['Saves'] ?? 0,
			'Shots'      : TeamStatsRows[i]['Shots'] ?? 0,
			'GoalDiff'   : TeamStatsRows[i]['Goal Dif.'] ?? 0,
			'OppShotPct' : TeamStatsRows[i]['Opp. Shot %'].replace(/\%/,'') ?? 0,
			'OppPoints'  : TeamStatsRows[i]['Opp. Points'] ?? 0,
			'OppGoals'   : TeamStatsRows[i]['Opp. Goals'] ?? 0,
			'OppAssists' : TeamStatsRows[i]['Opp. Assists'] ?? 0,
			'OppSaves'   : TeamStatsRows[i]['Opp. Saves'] ?? 0,
			'OppShots'   : TeamStatsRows[i]['Opp. Shots'] ?? 0,
		});
	}

	// clear our tables
	await conn2.execute(`TRUNCATE ${teamStatsTable}`);
	output.push({ 'process': `Truncating ${teamStatsTable}`});

	// insert into ${teamStatsTable}
	let keys = Object.keys(teamStats[0]).map(el => '`' + el + '`').join(', ');
	let placeholders = Object.keys(teamStats[0]).map(el => '?').join(', ');
	let teamStatsQuery = `INSERT INTO ${teamStatsTable} (${keys}) VALUES (${placeholders})`;
	console.log(teamStatsQuery);
	for ( let i = 0; i < teamStats.length; i++ ) {
		//console.log(Object.values(teamStats[i]));
		await conn2.execute(teamStatsQuery, Object.values(teamStats[i]));
	}

	const PlayerStatsSheet = doc.sheetsByTitle['Player Stats'];
	const PlayerStatsRows  = await PlayerStatsSheet.getRows();
	// SELECT 
	let playerStats = [];
	//res.write(' ');
	for ( let i = 0; i < PlayerStatsRows.length; i++ ) {
		let row = PlayerStatsRows[i];
		if ( row['Name'] === '' || row['Name'] === undefined ) { // skip empty records
			continue;
		}
		let shotPct = row['Shot Pct'].replace(/\%/, '');
		playerStats.push({
			Season: res.locals.settings.season, 
			Tier: tierByTeam[ row['Team'] ] ?? '',
			TeamName: row['Team'] ?? '', 
			PlayerName: row['Name'] ?? '', 
			GP: forceInt(row['GP']), 
			GW: forceInt(row['GW']), 
			GL: forceInt(row['GL']), 
			WPct: row['W%'].replace(/\%/,''), 
			MVPs: forceInt(row['MVPs']), 
			Pts: forceInt(row['Pts']), 
			Goals: forceInt(row['Goals']), 
			Assists: forceInt(row['Assists']), 
			Saves: forceInt(row['Saves']),
			Shots: forceInt(row['Shots']),
			ShotPct: shotPct != '' ? shotPct : 0.0, 
			PPG: row['PPG'] ?? 0, 
			GPG: row['GPG'] ?? 0, 
			APG: row['APG'] ?? 0, 
			SvPG: row['SvPG'] ?? 0, 
			SoPG: row['SoPG'] ?? 0, 
			Cycles: forceInt(row['Cycles']),
			HatTricks: forceInt(row['Hat Tricks']), 
			Playmakers: forceInt(row['Playmakers']),
			Saviors: forceInt(row['Saviors']),
		});
	}

	await conn2.execute(`TRUNCATE ${playerStatsTable}`);
	output.push({ 'process': `Truncating ${playerStatsTable}`});

	// insert into ${playerStatsTable}
	let playerKeys = Object.keys(playerStats[0]).map(el => '`' + el + '`').join(', ');
	let playerPlaceholders = Object.keys(playerStats[0]).map(el => '?').join(', ');
	let playerStatsQuery = `INSERT INTO ${playerStatsTable} (${playerKeys}) VALUES (${playerPlaceholders})`;
	console.log(playerStatsQuery);
	console.log(playerStats.length);
	console.log(playerStats[4]);
	for ( let i = 0; i < playerStats.length; i++ ) {
		if ( i % 100 == 0 ) { console.log(`Keepalive ping ${i}`); /*res.write(' ');*/ } // make sure we keep our connection through heroku alive
		await conn2.execute(playerStatsQuery, Object.values(playerStats[i]));
	}

	output.push({ 'process': 'Done!' });

	res.send('<pre>' + JSON.stringify(output) + '</pre>');
}

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
app.post('/generate_team/:tier', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

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
			home: i % 2 ? true : false,
			away: i % 2 ? false : true,
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
						teams[tier + '_' + curTeam]['mmr'] += playerTwoMmr;
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
						teams[tier + '_' + curTeam]['mmr'] += playerTwoMmr;
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
			let insertId = results.insertId;

			let playerParams = [];

			let matchParams = [];
			let matchInfo = [];

			for ( let team in teams ) {
				teams[ team ]['team_id'] = insertId;

				// set up match params for home team, finish it for away
				let matchDate = new Date();
				if ( teams[ team ].home ) {
					matchInfo = [
						matchDate,
						teams[ team ].season,
						teams[ team ].match_day,
						insertId,
						null,
						'fa_' + team,
						null
					];
				} else if ( teams[ team ].away ) {
					matchInfo[4] = insertId;
					matchInfo[6] = 'fa_' + team;
					matchParams.push(matchInfo);
				}
				
				for ( let i = 0; i < teams[team].players.length; i++ ) {
					playerParams.push([insertId, teams[team].players[i].id ]);
				}

				// move to next team
				insertId++;
			}

			let playersQuery = 'INSERT INTO team_players (team_id, player_id) VALUES ?';
			connection.query(playersQuery, [ playerParams ], (err, results) => {
				if ( err ) { throw err; }

				// season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass
				let matchQuery = 'INSERT INTO matches (match_dtg, season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass) VALUES ?';
				connection.query(matchQuery, [ matchParams ], (err, results) => {
					if ( err ) { throw err; }

					// finally, mark all selected players as "rostered"
					connection.query('UPDATE signups SET rostered = 1 WHERE ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() ) AND player_id IN (?)', [players], (err, results) => {
						if ( err ) { throw err; }

						res.redirect('/process_gameday');
					}); // final query, update players as rostered
				}); // end query to create match details
			}); // end query to insert players onto team roster
			//res.json(teams);
		}); // end query to generate team	
	}); // end query to select players from provided list.
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

app.get('/activate_everyone/:match_day', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	if ( ! req.params.match_day ) {
		return res.redirect('/');
	}

	let query = 'UPDATE signups SET active = 1 WHERE match_day = ? AND season = ?';
	connection.query(query, [ req.params.match_day, res.locals.settings.season ], (err, results) => {
		return res.redirect('/process_gameday');
	});

});

app.get('/process_gameday', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Process Gameday - ${res.locals.title}`;

	// TODO(erh): think about resorting this by signup date, or perhaps just in the front-end?
	let signups_query = `
	SELECT 
		s.id,s.player_id,s.season,s.match_day,s.active,s.rostered,p.discord_id,c.rsc_id,c.name,c.mmr,c.tier,c.status
	FROM 
		signups AS s
	LEFT JOIN players AS p 
		ON s.player_id = p.id
	LEFT JOIN contracts AS c
		ON p.discord_id = c.discord_id
	WHERE ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )
	ORDER BY s.id ASC
	`; 

	connection.query(signups_query, (err, results) => {
		if ( err ) { throw err; }

		let signups = {};
		let match_day = null;
		for ( let i = 0; i < results.length; i++ ) {
			if ( ! ( results[i]['tier'] in signups ) ) {
				match_day = results[i]['match_day'];
				signups[ results[i]['tier'] ] = {
					'season': results[i]['season'],
					'match_day': results[i]['match_day'],
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
		res.render('process', { signups: signups, match_day: match_day });
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

			// perm FAs don't show up in Count/Keeper sheet. We need to 
			// calc their tier from MMR.
			if ( ! ('tier' in players[ contractRows[i]['RSC Unique ID'] ]) ) {
				players[contractRows[i]['RSC Unique ID']]['mmr'] = contractRows[i]['Current MMR'];
				players[contractRows[i]['RSC Unique ID']]['tier'] = getTierFromMMR(parseInt(contractRows[i]['Current MMR']));
			}

			players[ contractRows[i]['RSC Unique ID'] ]['status'] = contractRows[i]['Contract Status'];

		}
	}

	// always add "tehblister" to the list in case he isn't playing
	// Added for development in S17 so that I could test things 
	// while non-playing.
	let tehblister_id = 'RSC000302';
	let tehblister_discord_id = '207266416355835904';
	if ( ! (tehblister_id in players) ) {
		players[tehblister_id] = {
			'rsc_id': tehblister_id,
			'name': 'tehblister',
			'discord_id': tehblister_discord_id,
			'mmr': 1550,
			'tier': 'Elite',
			'status': 'Free Agent',
		};
	}

	let domino_id = 'RSC000945';
	let domino_discord_id = '500092285120282635';
	if ( ! ( domino_id in players ) ) {
		players[domino_id] = {
			'rsc_id': domino_id,
			'name': 'Domino',
			'discord_id': domino_discord_id,
			'mmr': 1415,
			'tier': 'Veteran',
			'status': 'Free Agent',
		};
	}

	connection.query('TRUNCATE TABLE contracts', (err,results) => {
		if ( err ) {  throw err; }
		
		let playersArray = [];
		for ( let rsc_id in players ) {
			let player = players[rsc_id];

			if ( ! player['tier'] ) {
				continue;
			}

			// discord_id, rsc_id, mmr, tier, status
			if ( player['tier'] == 'Master' ) {
				player['tier'] = 'Premier';
			} else if ( player['tier'] == 'Amateur' ) {
				player['tier'] = 'Contender';
			}
			if ( ! player['mmr'] ) {
				player['mmr'] = 0;
			}
			playersArray.push([ player['discord_id'], player['rsc_id'], player['name'], player['mmr'], player['tier'], player['status'] ]);
		}

		connection.query(
			'INSERT INTO contracts (discord_id, rsc_id, name, mmr, tier, status) VALUES ?',
			[ playersArray ],
			(err, results) => {
				if (err) { /*throw err;*/writeError(err.toString()); console.log('error!'); }

				res.redirect('/manage_league');
		});
	});
});

app.get('/manage_league', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Manage League - ${res.locals.title}`;

	let counts_query = 'select count(*) AS count,tier,status from contracts where tier != "" group by tier,status order by tier,status';
	connection.query(counts_query, (err, results) => {
		if ( err ) { throw err; }

		// hardcoded tier names so we can get correct sort order.
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

app.get('/test', (req, res) => {
	connection.query(
		'INSERT INTO test (server_date) VALUES (?)',
		[ new Date() ],
		(err, results) => {
			res.send('record inserted on ' + new Date(new Date().setHours(12)).toISOString());
		}
	)
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

app.listen( process.env.PORT || 3000 , () => console.log("Server running..."));