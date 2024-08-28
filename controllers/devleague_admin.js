const express = require('express');
const router  = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange_3s, _mmrRange_2s, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

function get_rand_word_devleague() {
	const words = [
		'octane', 'gizmo', 'breakout', 'merc', 'hotshot', 'gizmo', 'backfire',
		'x-devil', 'paladin', 'hog', 'road', 'venom', 'dominus', 'luigi', 
		'mario', 'samus', 'sweet', 'tooth', 'aftershock', 'grog', 'esper', 
		'marauder', 'masamune', 'proteus', 'ripper', 'scarab', 'takumi',
		'triton', 'vulcan', 'zippy', 'backfire', 'paladin', 'hotshot', 'gizmo',
		'animus', 'centio', 'cyclone', 'endo', 'dominusgt', 'dingo', 'diestro',
		'fennec', 'fox', 'imperator', 'jager', 'mantis', 'nimbus', 'zsr', 
		'peregrine', 'twinzer', 'sentinal', 'samurai', 'tygris', 'werewolf',
		'ecto', 'ford', 'mustang', 'nascar', 'toyota', 'chevy', 'camaro',
		'subaru', 'wrx', 'sti', 'astonmartin', 'batmobile', 'tumbler',
		'reaper', 'fiero', 'fiesta', 'jeep', 'wrangler', 'cake', 'tehblister',
		'treefrog', 'monty', 'tr1ppn', 'snacktime', 'nickm', 'rscbot', 'tinsel',
		'anthage', 'limon', 'feet', 'crimetime',
	];
	return words[ Math.floor(Math.random() * words.length) ];
}

function calculate_mmrs_devleague(team) {
	console.log('team mmr calc',team);
	if ( ! team ) { return 0; }
	if ( ! team.length ) { return 0; }
	let mmr = 0;
	for ( let i = 0; i < team.length; ++i ) {
		if ( "mmr" in team[i] ) {
			mmr += team[i].mmr;
		}
	}

	return mmr;
}

async function make_lobby_devleague(db, lobby) {
	console.log('LOBBY MMRS');
	console.log('Home: ', lobby.home.mmr / 3);
	console.log('Away: ', lobby.away.mmr / 3);
	console.log(getTierFromMMR(lobby.home.mmr / 3), 3);
	const home_tier = getTierFromMMR(lobby.home.mmr / 3, 3);

	// create teams 
	const team_query = 'INSERT INTO teams (team_number, tier) VALUES (?, ?)';
	const [home_team_res] = await db.execute(team_query, [lobby.home_num, home_tier]);
	const [away_team_res] = await db.execute(team_query, [lobby.away_num, home_tier]);

	const home_team_id = home_team_res.insertId;
	const away_team_id = away_team_res.insertId;

	const match_query = `
		INSERT INTO matches 
			(season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass)
		VALUES 
			(     ?,         ?,            ?,            ?,          ?,          ?)
	`;
	const [match_res] = await db.execute(match_query, [
		lobby.season, 
		lobby.match_day,
		home_team_id,
		away_team_id,
		lobby.username,
		lobby.password
	])

	const match_id = match_res.insertId;

	const tp_query = `INSERT INTO team_players (team_id, player_id) VALUES (?, ?)`;
	const home_players = lobby.home.players;
	const away_players = lobby.away.players;

	const in_lobby = [];

	for ( let i = 0; i < home_players.length; ++i ) {
		await db.execute(tp_query, [home_team_id, home_players[i].id]);
		in_lobby.push(home_players[i].id);
	}
	for ( let i = 0; i < away_players.length; ++i ) {
		await db.execute(tp_query, [away_team_id, away_players[i].id]);
		in_lobby.push(away_players[i].id);
	}

	console.log(in_lobby);
	// set their signup status to "rostered"
	const rostered_query = `
		UPDATE signups 
		SET rostered = 1 
		WHERE 
			season = ? AND 
			match_day = ? AND 
			player_id in (?)
	`;
	await db.query(rostered_query, [lobby.season, lobby.match_day, in_lobby]);

	console.log('Everyone updated!');

	return true;

	// v2 player table, not yet implemented
	// const mp_query = `
	// 	INSERT INTO match_players 
	// 		(match_id, rsc_id, team)
	// 	VALUES 
	// 		(       ?,      ?,    ?)
	// `;

}


/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.get('/change_tier/:rsc_id/:new_tier', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const query = 'UPDATE contracts SET tier = ? WHERE rsc_id = ?';
	req.db.query(query, [ req.params.new_tier, req.params.rsc_id], (err, _results) => {
		if ( err ) { throw err; }

		return res.redirect('/process_gameday');
	});
});


router.get('/setup/devleague', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});


	const db_query = "SELECT p.id,c.status FROM players AS p LEFT JOIN contracts AS c ON p.discord_id = c.discord_id WHERE c.active_3s = 1 ORDER BY rand() LIMIT 100";

	const [ results ] = await db.execute(db_query);
	if ( results && results.length ) {
		const ins_query = 'INSERT INTO signups (player_id,season,match_day,status) VALUES (?, ?, ?, ?)';
		for ( let i = 0; i < results.length; ++i ) {
			await db.execute(ins_query, [ results[i].id, 19, 18, results[i].status ]);
		}
	}

	await db.end();
	
	res.json({'success': 'added 30 players'});
});

router.all('/generate_team/:tier', async (req, res) => {

	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

 	const tier = req.params.tier;

	let playersQuery = `
		SELECT 
			p.id,c.name,c.mmr,c.tier,c.rsc_id
		FROM signups AS s
		LEFT JOIN players AS p 
		ON p.id = s.player_id
		LEFT JOIN contracts AS c 
		ON p.discord_id = c.discord_id 
		WHERE 
			s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			s.active = 1 AND 
			s.rostered = 0 AND
			c.tier = ? 
		ORDER BY c.mmr DESC
	`;
	let tier_params = [tier];
	if ( tier === 'Premier' || tier === 'Contender' ) {
		console.log("OVERRIDE TIER!", tier);
		playersQuery = `
			SELECT 
				p.id,c.name,c.mmr,c.tier,c.rsc_id
			FROM signups AS s
			LEFT JOIN players AS p 
			ON p.id = s.player_id
			LEFT JOIN contracts AS c 
			ON p.discord_id = c.discord_id 
			WHERE 
				s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
				s.active = 1 AND 
				s.rostered = 0 AND
				(c.tier = ? OR c.tier = ?)
			ORDER BY c.mmr DESC
		`;
		if ( tier === 'Premier' ) {
			tier_params = ['Premier', 'Master'];
		} else if ( tier === 'Contender' ) {
			tier_params = ['Contender', 'Amateur'];
		}
	} else if ( tier === 'all' ) {
		playersQuery = `
			SELECT
				p.id,c.name,c.mmr,c.tier,c.rsc_id
			FROM signups AS s
			LEFT JOIN players AS p 
				ON p.id = s.player_id
			LEFT JOIN contracts AS c 
				ON p.discord_id = c.discord_id 
			WHERE 
				s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
				s.active = 1 AND 
				s.rostered = 0
			ORDER BY c.mmr DESC
		`;
		tier_params = null;
	}

	const [results] = await db.execute(playersQuery, tier_params);
	if ( results && results.length ) {
		if ( results.length % 6 !== 0 ) {
			results.blister = 'blister';
			return res.json(results);
			return res.redirect('/devleague?error=InvalidNumberOfPlayers');
		}

		const num_lobbies = results.length / 6;

		const lobbies = [];
		for ( let i = 0; i < num_lobbies; ++i ) {
			const lobby = {
				season: res.locals.settings.season,
				match_day: res.locals.match_day,
				username: get_rand_word_devleague(),
				password: get_rand_word_devleague(),
				home_num: ((i * 2) + 1),
				away_num: ((i * 2) + 2),
				home: { players: [], mmr: 0, },
				away: { players: [], mmr: 0, },
			};

			// snake-draft by MMR for balanced teams
			lobby.home.players.push(results.pop()); // 1st player
			lobby.away.players.push(results.pop()); // 2nd player
			lobby.away.players.push(results.pop()); // 3rd player
			lobby.home.players.push(results.pop());	// 4th player
			lobby.home.players.push(results.pop());	// 5th player
			lobby.away.players.push(results.pop()); // 6th player
	
			lobby.home.mmr = calculate_mmrs_devleague(lobby.home.players);
			lobby.away.mmr = calculate_mmrs_devleague(lobby.away.players);
			lobby.home.delta = lobby.home.mmr - lobby.away.mmr;
			lobby.away.delta = lobby.away.mmr - lobby.home.mmr;

			await make_lobby_devleague(db, lobby);

			lobbies.push(lobby);
		}

	}

	await db.end();

	res.redirect('/devleague');

});

router.get('/match/:team_id/confirm-sub/:player_id/:sub_player_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const team_id = parseInt(req.params.team_id);
	const player_id = parseInt(req.params.player_id);
	const sub_player_id = parseInt(req.params.sub_player_id);
	const output = {
		team_id: team_id,
		player_id: player_id,
		sub_player_id: sub_player_id,
	};
	console.log(output);
	//return res.json(output);

	const query = `
		UPDATE team_players SET player_id = ? 
		WHERE team_id = ? AND player_id = ?
	`;
	req.db.query(query, [sub_player_id, team_id, player_id], (err, results) => {
		if ( err ) { throw err; }

		const match_id_query = `SELECT id FROM matches WHERE home_team_id = ? OR away_team_id = ?`;
		req.db.query(match_id_query, [team_id, team_id], (err, results) => {
			if ( err ) { throw err; }

			if ( results && results.length ) {
				const id = results[0].id;
				res.redirect(`/match/${id}`);
			} else {
				res.redirect('/?error=WhatTheHeck');
			}
		});
	});
});

router.get('/match/:team_id/sub/:player_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const query = `
		SELECT 
			p.id,p.nickname,p.rsc_id,c.mmr,c.tier
		FROM players AS p 
		LEFT JOIN contracts AS c 
			ON p.rsc_id = c.rsc_id 
		WHERE c.active_3s = 1
		ORDER BY p.nickname
	`;

	const player_id = parseInt(req.params.player_id);
	req.db.query(query, (err, results) => {
		if ( err ) { throw err; }

		const template = {
			match_id: req.params.match_id,
			player: {},
			available: {},
		};
		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const p = results[i];
				if ( p.id === player_id ) {
					template.player = p;
				} else {
					template.available[p.id] = p;
				}
			}

			res.render('sub', {
				team_id: parseInt(req.params.team_id),
				available: template.available,
				player: template.player,
			});
		}
	});
});

router.get('/make_active/:signup_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const query = 'UPDATE signups SET active = 1 WHERE id = ?';
	req.db.query(query, [ req.params.signup_id ], () => {
		res.redirect('/process_gameday');
	});
});

router.get('/make_inactive/:signup_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const query = 'UPDATE signups SET active = 0 WHERE id = ?';
	req.db.query(query, [ req.params.signup_id ], () => {
		res.redirect('/process_gameday');
	});
});

router.get('/activate_everyone/:match_day', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	if ( ! req.params.match_day ) {
		return res.redirect('/');
	}

	const query = 'UPDATE signups SET active = 1 WHERE match_day = ? AND season = ?';
	req.db.query(query, [ req.params.match_day, res.locals.settings.season ], () => {
		return res.redirect('/process_gameday');
	});

});

async function get_stats(db, season) {
	console.log('in get_stats');
	const query = `
		SELECT
			m.id AS m_id, m.home_team_id, m.home_wins,
			m.away_team_id, m.away_wins
		FROM matches AS m
		WHERE season = ?
	`;
	const team_wins = {};
	const team_match_map = {};
	const team_ids = [0];
	const players = {};
	const [results] = await db.execute(query, [season]);

	for ( let i = 0; i < results.length; ++i ) {
		team_ids.push(results[i].home_team_id);
		team_ids.push(results[i].away_team_id);
		team_match_map[ results[i].home_team_id ] = results[i].id;
		team_match_map[ results[i].away_team_id ] = results[i].id;
		team_wins[ results[i].home_team_id ] = results[i].home_wins;
		team_wins[ results[i].away_team_id ] = results[i].away_wins;
	}

	const playerQuery = `
		SELECT
			c.name,c.rsc_id,c.discord_id,c.tier,c.status,c.mmr,
			tp.player_id,tp.team_id, p.nickname
		FROM team_players AS tp
		LEFT JOIN players AS p ON tp.player_id = p.id
		LEFT JOIN contracts AS c ON p.discord_id = c.discord_id
		WHERE tp.team_id IN (?)
	`;
	const [p_results] = await db.query(playerQuery, [team_ids]);
	for ( let i = 0; i < p_results.length; ++i ) {
		const player = p_results[i];

		// switch ( player.tier ) {
		// 	case 'Premier':
		// 	case 'Master':
		// 		player.tier = 'PreMaster';
		// 		break;
		// 	case 'Contender':
		// 	case 'Amateur':
		// 		player.tier = 'ContAmmy';
		// 		break;
		// }

		if ( ! (player.rsc_id in players) ) {
			players[ player.rsc_id ] = {
				id: player.player_id,
				name: player.name,
				rsc_id: player.rsc_id,
				discord_id: player.discord_id,
				tier: player.tier,
				status: player.status,
				points: 0,
				series: 0,
				wins: 0,
				losses: 0,
			};
		}

		players[ player.rsc_id ].points++;
		players[ player.rsc_id ].series++;
		players[ player.rsc_id ].wins += team_wins[ player.team_id ];
		const win_points = team_wins[ player.team_id ] * .5;
		players[ player.rsc_id ].points += win_points;
		players[ player.rsc_id ].losses += (4 - team_wins[ player.team_id ]);
	}

	return players;
}


router.all('/devleague/deactivate-last/:amount', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 
	
	const query = `
		UPDATE signups SET 
			active = 0
		WHERE 
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 1 AND
			rostered = 0 AND 
			status in ('Signed', 'Renewed', 'Mid-Contract', 'Rostered')
		ORDER BY signup_dtg DESC 
		LIMIT ?
	`;
	if ( ! req.params.amount || ! parseInt(req.params.amount) ) {
		console.log('WTF?', parseInt(req.params.amount) );
		return res.redirect('/devleague');
	}
	//return res.json({query: query, amount: parseInt(req.params.amount)});	
	req.db.query(query, [ parseInt(req.params.amount) ], (err,results) => {
		if ( err ) { throw err; }

		return res.redirect('/devleague');
	});
});

router.all('/devleague/deactivate/:player_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 
	
	const single_where = req.params.player_id !== 'all' ? "player_id = ? AND" : '';
	const query = `
		UPDATE signups SET 
			active = 0
		WHERE 
			${single_where}
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 1 AND
			rostered = 0
	`;
	
	if ( req.params.player_id !== 'all' ) {
		req.db.query(query, [ req.params.player_id ], (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/devleague');
		});
	} else {
		req.db.query(query, (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/devleague');
		});
	}
});

router.get('/devleague/activate/:player_id', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const single_where = req.params.player_id !== 'all' ? "player_id = ? AND" : '';
	const query = `
		UPDATE signups SET 
			active = 1
		WHERE 
			${single_where}
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 0 AND
			rostered = 0
	`;
	
	if ( req.params.player_id !== 'all' ) {
		req.db.query(query, [ req.params.player_id ], (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/devleague');
		});
	} else {
		req.db.query(query, (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/devleague');
		});
	}
});


router.get('/devleague', async (req, res) => {

	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `DevLeague Maker - ${res.locals.title}`;

	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

	const season = res.locals.settings.season;

	const players = await get_stats(db, season);

	const signups_query = `
	SELECT 
		s.id,s.player_id,s.season,s.match_day,s.active,s.rostered,
		s.signup_dtg,c.mmr,
		p.discord_id,c.rsc_id,c.name,c.mmr,c.tier,c.status
	FROM 
		signups AS s
	LEFT JOIN players AS p 
		ON s.player_id = p.id
	LEFT JOIN contracts AS c
		ON p.discord_id = c.discord_id
	WHERE 
	( 
		DATE(signup_dtg) = CURDATE() OR 
		DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() 
	) AND
	rostered = 0
	ORDER BY s.id ASC
	`; 

	const signups = {
		'games': [],
		'active': {},
		'waiting': {},
	};
	const [signup_results] = await db.query(signups_query);

	if ( signup_results.length ) {
		for ( let i = 0; i < signup_results.length; ++i ) {
			const s = signup_results[i];
			//const p = players[s.rsc_id];
			//console.log(s,p);
			s.mmr_delta = 0;
			s.win_percentage = 0;
			s.wins = 0;
			s.losses = 0;
			if ( s.rsc_id in players ) {
				const p = players[s.rsc_id];
				//console.log(p);
				s.win_percentage = p.series ? 
					parseFloat(((p.wins / (p.wins + p.losses)) * 100).toFixed(1)) : 
					0;
				s.wins = p.wins;
				s.losses = p.losses;
			}

			if ( s.active ) {
				signups.active[s.rsc_id] = s;
			} else {
				signups.waiting[s.rsc_id] = s;
			}
		}
	}

	const active_query = `
		SELECT 
			m.id,m.lobby_user,m.lobby_pass,t.tier 
		FROM matches AS m 
		LEFT JOIN teams AS t 
		ON m.home_team_id = t.id
		WHERE
			m.season = ? AND 
			m.match_day = ? AND
			(m.home_wins = 0 AND m.away_wins = 0)
		ORDER BY id DESC
	`;
	const [active_results] = await db.query(active_query, [
		res.locals.settings.season, res.locals.match_day
	]);
	let games = [];
	if ( active_results.length ) {
		games = active_results;
	}

	db.end();

	res.render('process_devleague', {
		signups: signups,
		games: games,
	});
});

router.get('/process_gameday', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Process Gameday - ${res.locals.title}`;

	// TODO(erh): think about resorting this by signup date, or perhaps just in the front-end?
	const signups_query = `
	SELECT 
		s.id,s.player_id,s.season,s.match_day,s.active,s.rostered,
		p.discord_id,c.rsc_id,c.name,c.mmr,c.tier,c.status
	FROM 
		signups AS s
	LEFT JOIN players AS p 
		ON s.player_id = p.id
	LEFT JOIN contracts AS c
		ON p.discord_id = c.discord_id
	WHERE ( 
		DATE(signup_dtg) = CURDATE() OR 
		DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() 
	)
	ORDER BY c.mmr DESC 
	`; 

	req.db.query(signups_query, (err, results) => {
		if ( err ) { throw err; }

		const signups = {};
		let match_day = null;
		for ( let i = 0; i < results.length; i++ ) {
			if ( results[i]['tier'] === 'Master' ) {
				results[i]['tier'] = 'Premier';
			} else if ( results[i]['tier'] === 'Amateur' ) {
				results[i]['tier'] = 'Contender';
			}

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

router.get('/fix_discord', async(req,res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	// 135E24RWpTJqBdFqwoD4dOU0O_hb0KALtsv_gBVBYNlo
	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

	const existing_query = `SELECT id,rsc_id,discord_id,name FROM tiermaker WHERE discord_id is null AND season = 21 AND league = 3`;
	const [p_results] = await db.query(existing_query);
	const existing = {};
	if ( p_results && p_results.length ) {
		for ( let i = 0; i < p_results.length; ++i ) {
			const p = p_results[i];
			existing[p.rsc_id] = p;
		}
	}

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet('135E24RWpTJqBdFqwoD4dOU0O_hb0KALtsv_gBVBYNlo');
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["Members"];
	const rows = await sheet.getRows();

	const players = {};
	console.log('Importing Players from Master Member Sheet...');
	if ( ! rows ) {
		return res.json({'error': 'Google rows was empty. :(', });
	}

	const updates = {};
	for ( let i = 0; i < rows.length; i++ ) {
		if ( ! rows[i]['Player Name'] || ! rows[i]['RSC ID'] || ! rows[i]['Discord ID'] ) {
			continue;
		}

		if ( rows[i]['RSC ID'] && existing[rows[i]['RSC ID']] ) {
			updates[rows[i]['RSC ID']] = rows[i]['Discord ID']; 
		}
	}

	console.log(`    Players found...${Object.keys(updates).length}`);

	const update_query = `UPDATE tiermaker SET discord_id = ? WHERE rsc_id = ?`;
	for ( const rsc_id in updates ) {
		const discord_id = updates[rsc_id];

		await db.query(update_query, [discord_id,rsc_id]);
	}

	db.end();

	
	console.log(updates);
	res.json(updates);

});
router.get('/import_players/:contract_sheet_id', async(req,res) => {
	const returnUrl = req.query.return ? `/${req.query.return}` : '/manage_league';

	if ( 
		! req.session.is_admin && ! req.session.is_devleague_admin 
		&& ! req.session.is_combines_admin && ! req.session.is_combines_admin_2s
	) {
		return res.redirect('/');
	}
	
	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

	const existing_query = `SELECT id,rsc_id,nickname,discord_id FROM players`;
	const [p_results] = await db.query(existing_query);
	const existing = {};
	if ( p_results && p_results.length ) {
		for ( let i = 0; i < p_results.length; ++i ) {
			const p = p_results[i];
			existing[p.discord_id] = p;
		}
	}

	// API master member sheet = 135E24RWpTJqBdFqwoD4dOU0O_hb0KALtsv_gBVBYNlo
	// 1. create google sheets object
	const doc = new GoogleSpreadsheet('135E24RWpTJqBdFqwoD4dOU0O_hb0KALtsv_gBVBYNlo');
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["Members"];
	const rows = await sheet.getRows();

	const players = {};
	console.log('Importing Players from API Master Members Sheet...');
	if ( ! rows ) {
		return res.json({'error': 'Google rows was empty. :(', });
	}
	for ( let i = 0; i < rows.length; i++ ) {
		if ( ! rows[i]['Player Name'] || ! rows[i]['RSC ID'] || ! rows[i]['Discord ID'] ) {
			continue;
		}

		players[ rows[i]['Discord ID'] ] = {
			'rsc_id': rows[i]['RSC ID'],
			'name': rows[i]['Player Name'],
			'discord_id': rows[i]['Discord ID'],
			'active_2s': false,
			'active_3s': rows[i]['3v3 Active/Returning'] === 'TRUE' ? true : false,
			'status': 'Non-playing',
		};
	}

	console.log(`    Players populated...${Object.keys(players).length}`);

	const new_query = `INSERT INTO players (rsc_id,nickname,discord_id) VALUES (?, ?, ?)`;
	const update_query = `UPDATE players SET rsc_id = ?, nickname = ? WHERE discord_id = ?`;
	let new_players = 0;
	let updated_players = 0;
	let skipped_players = 0;
	for ( const discord_id in players ) {
		const p = players[discord_id];

		if ( ! (discord_id in existing) ) {
			await db.query(new_query,[p.rsc_id,p.name,p.discord_id]);
			new_players++;
		} else {
			const e = existing[discord_id];
			if ( e.nickname != p.name || ! e.rsc_id ) {
				await db.query(update_query, [p.rsc_id,p.name,p.discord_id]);
				updated_players++;
			} else {
				skipped_players++;
			}
		}
	}

	db.end();

	const output = {
		'new': new_players,
		'updated': updated_players,
		'skipped': skipped_players,
	};
	
	console.log(output);

	return res.redirect(`${returnUrl}?new=${output.new}&updated=${output.updated}&skipped=${output.skipped}`);
});

router.get('/import_contracts/:contract_sheet_id', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

 	const tier = req.params.tier;
	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(req.params.contract_sheet_id);
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	//const sheet = doc.sheetsByTitle["Players"];
	//const rows = await sheet.getRows();

	const players = {};

	console.log('Importing Players from Players Table...');

	const players_query = `
		SELECT id,rsc_id,nickname,discord_id
		FROM players 
		WHERE rsc_id IS NOT null
		ORDER BY rsc_id ASC
	`;

	const [player_rows] = await db.execute(players_query);

	if ( player_rows && player_rows.length ) {
		for ( let i = 0; i < player_rows.length; i++ ) {
			const p = player_rows[i];
			players[ p.rsc_id ] = {
				'rsc_id': p.rsc_id,
				'name': p.nickname,
				'discord_id': p.discord_id,
				'active_2s': false,
				'active_3s': false,
				'status': 'Non-playing',
			};
		}
	}

	console.log(`    Players populated...${Object.keys(players).length}`);

	const mmrSheet = doc.sheetsByTitle["Count/Keeper"];
	const mmrRows = await mmrSheet.getRows();

	for ( let i = 0; i < mmrRows.length; i++ ) {
		if ( ! mmrRows[i]['active_3s'] ) {
			//console.log(mmrRows[i]);
			console.log('active_3s null', i, mmrRows[i]['RSC ID'] );
			delete(mmrRows[i]);
			continue;
		}

		if ( mmrRows[i]['RSC ID'] in players ) {
			//console.log('found', mmrRows[i]['RSC ID'], mmrRows[i]['Effective MMR'], mmrRows[i]['Tier']);
			players[ mmrRows[i]['RSC ID'] ]['mmr'] = mmrRows[i]['Effective MMR'];
			players[ mmrRows[i]['RSC ID'] ]['tier'] = mmrRows[i]['Tier'];
		} else {
			// console.log('skipped', mmrRiws[i]['RSC ID']);
		}
	}

	console.log(`     MMRs/tiers loaded`);

	const contractSheet = doc.sheetsByTitle['Master Contracts'];
	const contractRows = await contractSheet.getRows();

	for ( let i = 0; i < contractRows.length; i++ ) {
		if ( contractRows[i]['RSC ID'] in players ) {

			// perm FAs don't show up in Count/Keeper sheet. We need to 
			// calc their tier from MMR.
			if ( ! ('tier' in players[ contractRows[i]['RSC ID'] ]) ) {
				players[contractRows[i]['RSC ID']]['mmr'] = contractRows[i]['Current MMR'];
				players[contractRows[i]['RSC ID']]['tier'] = getTierFromMMR(parseInt(contractRows[i]['Current MMR']), 3);
			}

			players[ contractRows[i]['RSC ID'] ]['status'] = contractRows[i]['Contract Status'];
			players[ contractRows[i]['RSC ID'] ]['active_3s'] = contractRows[i]['Active'] === 'TRUE' ? true : false;

		}
	}
	
	console.log('import processing finished');
	// always add "tehblister" to the list in case he isn't playing
	// Added for development in S17 so that I could test things 
	// while non-playing.
	// let tehblister_id = 'RSC000302';
	// let tehblister_discord_id = '207266416355835904';
	// if ( ! (tehblister_id in players) ) {
	// 	players[tehblister_id] = {
	// 		'rsc_id': tehblister_id,
	// 		'name': 'tehblister',
	// 		'discord_id': tehblister_discord_id,
	// 		'mmr': 1450,
	// 		'tier': 'Elite',
	// 		'status': 'Free Agent',
	// 	};
	// }

	req.db.query('TRUNCATE TABLE contracts', (err) => {
		if ( err ) {  throw err; }
		console.log('truncate table');
		
		const playersArray = [];
		for ( const rsc_id in players ) {
			const player = players[rsc_id];
			console.log(rsc_id, player['name']);

			if ( player['status'] === 'Perm FA in Waiting.' ) {
				continue; 
			}

			if ( ! player['tier'] ) {
				player['tier'] = 'NONE';
			}

			if ( ! player['mmr'] ) {
				player['mmr'] = 0;
			}
			if ( ! player['status'] ) {
				player['status'] = 'Non-playing';
			}

			playersArray.push([ player['discord_id'], player['rsc_id'], player['name'], player['mmr'], player['tier'], player['status'], player['active_3s'], player['active_2s'] ]);
		}

		const insertQuery = `
			INSERT INTO contracts 
				(discord_id, rsc_id, name, mmr, tier, status, active_3s, active_2s) 
			VALUES ?
		`;
		req.db.query(
			insertQuery,
			[ playersArray ],
			(err, results) => {
				if (err) { /*throw err;*/ writeError(err.toString()); console.log('error!', err); }
				console.log(`Inserting records`, results);
				res.redirect('/manage_league');
		});
	});
});

router.get('/manage_league', (req, res) => { 
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Manage League - ${res.locals.title}`;

	const counts_query = `
		SELECT 
			count(*) AS count,tier,status 
		FROM contracts 
		WHERE 
			tier != "" AND 
			tier != "NONE" 
		GROUP BY tier,status 
		ORDER BY tier,status`;
	req.db.query(counts_query, (err, results) => {
		if ( err ) { throw err; }

		// hardcoded tier names so we can get correct sort order.
		const tiers = {
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

		const settings_query = `
		SELECT 
			id,season,contract_url,
			amateur,contender,prospect,challenger,rival,
			veteran,elite,master,premier
		FROM 
			league_settings 
		ORDER by id DESC 
		LIMIT 1
		`;
		req.db.query(settings_query, (err, results) => { 
			if (err) { throw err; }
			
			if ( results && results.length ) {
				const contract_sheet_id = results[0].contract_url.split('/')[5];
				res.render('manage', { 
					tiers: tiers, 
					settings: results[0], 
					contract_sheet_id: contract_sheet_id 
				});
			} else {
				res.render('manage', { 
					tiers: tiers, 
					settings: [], 
					contract_sheet_id: '',
				});
			}
		});

	});

});

router.post('/manage_league', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const amateur    = "amateur"    in req.body ? 1 : 0;
	const contender  = "contender"  in req.body ? 1 : 0;
	const prospect   = "prospect"   in req.body ? 1 : 0;
	const challenger = "challenger" in req.body ? 1 : 0;
	const rival      = "rival"      in req.body ? 1 : 0;
	const veteran    = "veteran"    in req.body ? 1 : 0;
	const elite      = "elite"      in req.body ? 1 : 0;
	const master     = "master"     in req.body ? 1 : 0;
	const premier    = "premier"    in req.body ? 1 : 0;

	const settings_query = `
	INSERT INTO league_settings
		(
			season,contract_url,amateur,contender,prospect,challenger,
			rival,veteran,elite,master,premier
		)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	req.db.query(
		settings_query,
		[
			req.body.season, req.body.contract_url, amateur, contender, prospect,
			challenger, rival, veteran, elite, master, premier
		],
		(err) => {
			if ( err ) { throw err; }
			res.redirect('/manage_league');
		}
	);
});

module.exports = router;
