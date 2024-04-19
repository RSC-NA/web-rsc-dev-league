const express = require('express');
const router = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

async function get_lobby(db,match_id) {
	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,
			reported_rsc_id,confirmed_rsc_id,home_mmr as tier,
			completed,cancelled 
		FROM combine_matches 
		WHERE id = ?
	`;
	const [results] = await db.query(active_query, [match_id]);
	const games = {};
	const game_ids = [];
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			game_ids.push(results[i].id);
			const game = results[i];
			game.tier = getTierFromMMR(Math.floor(game.tier / 3));
			console.log('Generated Tier for',match_id,'-', game.tier);
			game.home = [];
			game.away = [];
			games[results[i].id] = game;
		}
	}

	if ( game_ids && game_ids.length ) {
		const players_query = `
			SELECT 
				t.discord_id,p.rsc_id,p.match_id,p.team,t.name
			FROM combine_match_players AS p 
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id 
			WHERE p.match_id in (?)
		`;
		const [p_results] = await db.query(players_query, [game_ids]);
		if ( p_results && p_results.length ) {
			for ( let i = 0; i < p_results.length; ++i ) {
				const p = p_results[i];
				if ( p.team === 'home' ) {
					games[p.match_id].home.push(p);
				} else {
					games[p.match_id].away.push(p);
				}
			}
		}
	}

	return games;
}
async function get_active(db,match_id) {
	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,
			reported_rsc_id,confirmed_rsc_id,home_mmr as tier,
			completed,cancelled 
		FROM combine_matches 
		WHERE completed = 0 AND cancelled = 0 AND id = ?
	`;
	const [results] = await db.query(active_query, [match_id]);
	const games = {};
	const game_ids = [];
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			game_ids.push(results[i].id);
			const game = results[i];
			game.tier = getTierFromMMR(Math.floor(game.tier / 3));
			console.log('Generated Tier', game.tier);
			game.home = [];
			game.away = [];
			games[results[i].id] = game;
		}
	}

	if ( game_ids && game_ids.length ) {
		const players_query = `
			SELECT 
				t.discord_id,p.rsc_id,p.match_id,p.team,t.name
			FROM combine_match_players AS p 
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id 
			WHERE p.match_id in (?)
		`;
		const [p_results] = await db.query(players_query, [game_ids]);
		if ( p_results && p_results.length ) {
			for ( let i = 0; i < p_results.length; ++i ) {
				const p = p_results[i];
				if ( p.team === 'home' ) {
					games[p.match_id].home.push(p);
				} else {
					games[p.match_id].away.push(p);
				}
			}
		}
	}

	return games;
}

function writeApiError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.use(async (req, res, next) => {
	res.locals.discord_id = null;
	res.locals.checked_in = false;
	
	if ( req.method === 'GET') {
		res.locals.discord_id = req.query.discord_id;
	} else {
		res.locals.discord_id = req.body.discord_id;
	}

	try {

		console.log("\n", '--- COMBINES API ROUTE ---');
		res.locals.adb = await mysqlP.createPool({
			host: process.env.DB_HOST,
			user: process.env.DB_USER,
			password: process.env.DB_PASS,
			port: process.env.DB_PORT,
			database: process.env.DB_SCHEMA,
			waitForConnections: true,
			connectionLimit: 10,
			queueLimit: 0
		});

		if ( res.locals.discord_id ) {
			const [tm_results] = await res.locals.adb.query(
				'SELECT rsc_id,name,current_mmr FROM tiermaker WHERE discord_id = ? AND season = ?',
				[res.locals.discord_id, res.locals.combines.season]
			);

			if ( ! tm_results || ! tm_results.length ) {
					if ( req.originalUrl.includes('lobby') ) {
						return next();
					} else {
						return res.json({
							'status': 'error',
							'message': 'You are not a player in the tiermaker. ',
						});
					}
			}

			res.locals.rsc_id = tm_results[0].rsc_id;
			res.locals.name = tm_results[0].name;
			res.locals.current_mmr = tm_results[0].current_mmr;
			
			const query = `
			SELECT id,active,rostered FROM combine_signups 
			WHERE 
				discord_id = ? AND 
				season = ? AND signup_dtg > DATE_SUB(now(), INTERVAL 2 HOUR)
			ORDER BY id DESC 
			LIMIT 1
			`;

			const [signupResults] = await res.locals.adb.query(query, [ res.locals.discord_id, res.locals.combines.season ]);
			res.locals.checked_in = false;
			if ( signupResults && signupResults[0] ) {
				const signup = signupResults[0];
				if ( signup.rostered ) {
					res.locals.checked_in = false;
					res.locals.active_match = true;
				} else {
					res.locals.checked_in = true;
					res.locals.active_match = false;
				}
			}

			if ( res.locals.active_match ) { 
				console.log('This RSC ID', res.locals.rsc_id);
				const matchQuery = `
					SELECT 
						m.id, m.match_dtg, m.season, m.lobby_user, m.lobby_pass,
						m.home_wins, m.away_wins, m.reported_rsc_id, m.confirmed_rsc_id,
						m.completed, m.cancelled,
						mp.rsc_id,mp.team
					FROM combine_matches AS m 
					LEFT JOIN combine_match_players AS mp 
						ON m.id = mp.match_id 
					WHERE
						(m.completed = 0 AND m.cancelled = 0) AND
						mp.rsc_id = ?
				`;

				const [matchResults] = await res.locals.adb.query(matchQuery, [res.locals.rsc_id]);
				if ( matchResults && matchResults.length ) {
					res.locals.match = matchResults[0];
				}
			}

			next();

		} else {

			return res.json({
				'status': 'error',
				'message': 'You must provide a `discord_id`.',
			});

		}

	} catch(e) {
		const error = {
			location: 'middleware',
			e: e,
			discord_id: res.locals.discord_id,
			user: res.locals.user,
		};
		console.log(' ------------ ERROR -------------');	
		console.log(error);
		writeApiError(error);

		return res.json({
			'status': 'error',
			'message': `Unknown error!`,
		});
	}
});

router.get('/active', async(req,res) => {
	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,home_mmr,
			reported_rsc_id,confirmed_rsc_id,
			completed,cancelled 
		FROM combine_matches 
		WHERE completed = 0
	`;
	const [results] = await res.locals.adb.query(active_query);
	const games = {};
	const game_ids = [];
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			// TODO(erh): Add "getTierFromMMR()" for Nick
			game_ids.push(results[i].id);
			const game = results[i];
			game.tier = getTierFromMMR(game.home_mmr);
			game.home = [];
			game.away = [];
			games[results[i].id] = game;
		}
	}

	if ( game_ids && game_ids.length ) {
		const players_query = `
			SELECT 
				t.discord_id,p.rsc_id,p.match_id,p.team,t.name
			FROM combine_match_players AS p 
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id 
			WHERE p.match_id in (?)
		`;
		const [p_results] = await res.locals.adb.query(players_query, [game_ids]);
		if ( p_results && p_results.length ) {
			for ( let i = 0; i < p_results.length; ++i ) {
				const p = p_results[i];
				if ( p.team === 'home' ) {
					games[p.match_id].home.push(p);
				} else {
					games[p.match_id].away.push(p);
				}
			}
		}
	}

	res.locals.adb.end();

	res.json(games);
});


router.get('/lobby/:lobby_id', async (req, res) => {
	if ( ! req.params.lobby_id ) {
		return res.json({
			'status': 'error',
			'message': 'You must provide a lobby.',
		});
	}

	try { 

		lobby = await get_lobby(res.locals.adb, req.params.lobby_id);

		await res.locals.adb.end();

		if ( lobby ) {
			return res.json(lobby);
		} else {
			return res.json({
				'status': 'error',
				'message': 'This lobby does not exist.',
			});
		}
	} catch(e) {
		const error = {
			location: '/lobby',
			e: e,
			discord_id: res.locals.discord_id,
			user: res.locals.user,
		};
		console.log(' ------------ ERROR -------------');	
		console.log(error);
		writeApiError(error);

		return res.json({
			'status': 'error',
			'message': `Unknown error!`,
		});
	}
});

router.get('/lobby', async (req, res) => {
	if ( ! res.locals.match ) {
		return res.json({
			'status': 'error',
			'message': 'You are not in any lobbies.',
		});
	}

	try { 

		const active_query = `
			SELECT 
				m.id
			FROM combine_matches AS m  
			LEFT JOIN combine_match_players AS p 
			ON m.id = p.match_id 
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id
			WHERE m.completed = 0 AND m.cancelled = 0 AND t.discord_id = ?
		`;
		const [results] = await res.locals.adb.query(active_query,[res.locals.discord_id]);

		let lobby = {};
		if ( results && results.length ) {
			lobby = await get_active(res.locals.adb, results[0].id);
			console.log('lobby found');
			console.log(lobby);
		} else {
			lobby = {
				status: 'error',
				message: 'You are not in any lobbies.',
			};
		}

		await res.locals.adb.end();
		res.json(lobby);
	} catch(e) {
		const error = {
			location: '/lobby',
			e: e,
			discord_id: res.locals.discord_id,
			user: res.locals.user,
		};
		console.log(' ------------ ERROR -------------');	
		console.log(error);
		writeApiError(error);

		return res.json({
			'status': 'error',
			'message': `Unknown error!`,
		});
	}
});

router.get('/check_in', async (req, res) => {
	if ( res.locals.checked_in ) {
		return res.json({
			'status': 'error',
			'message': 'You are already checked in.',
		});
	}

	if ( res.locals.active_match ) {
		return res.json({
			'status': 'error',
			'message': 'You are currently in a match. You cannot check in until it is finished.',
		});
	}

	const combines = res.locals.combines;

	if ( ! combines.live ) {
		return res.json({
			'status': 'error',
			'message': 'Combines are not currently running. You can check in after 7:50PM ET on Combine Days (M/W/F)',
		});
	}

	try { 

		const query = `
			INSERT INTO combine_signups 
				(season,rsc_id,discord_id,current_mmr) 
			VALUES 
				(     ?,     ?,         ?,          ?)
		`;
		const [inserted] = await res.locals.adb.query(query, [
			res.locals.combines.season,
			res.locals.rsc_id,
			res.locals.discord_id,
			res.locals.current_mmr,
		]);

		await res.locals.adb.end();

		return res.json({
			'status': 'success',
			'message': 'You are checked in',
		});
	} catch(e) {
		const error = {
			location: '/check_in',
			e: e,
			discord_id: res.locals.discord_id,
			user: res.locals.user,
		};
		console.log(' ------------ ERROR -------------');	
		console.log(error);
		writeApiError(error);

		return res.json({
			'status': 'error',
			'message': `Unknown error!`,
		});

	}
});

router.get('/check_out', async (req, res) => {
	if ( ! res.locals.checked_in ) {
		return res.json({
			'status': 'error',
			'message': 'You are not checked in.',
		});
	}

	try { 

		const user = res.locals.user;
		const ucombines = user.combines;
		const combines = res.locals.combines;

		if ( ! combines.live ) {
			return res.json({
				'status': 'error',
				'message': 'Combines are not currently running. You can check in after 7:50PM ET on Combine Days (M/W/F)',
			});
		}

		const query = `
			DELETE FROM combine_signups 
			WHERE 
				season = ? AND 
				rsc_id = ? AND 
				discord_id = ? AND 
				rostered = 0 AND 
				signup_dtg > DATE_SUB(now(), INTERVAL 2 HOUR)
		`;

		const [deletedId] = await res.locals.adb.query(query, [
			res.locals.combines.season,
			res.locals.rsc_id,
			res.locals.discord_id
		]);

		await res.locals.adb.end();

		return res.json({
			'status': 'success',
			'message': 'You are checked out.',
		});

	} catch(e) {
		const error = {
			location: '/check_out',
			e: e,
			discord_id: res.locals.discord_id,
			user: res.locals.user,
		};
		console.log(' ------------ ERROR -------------');	
		console.log(error);
		writeApiError(error);

		return res.json({
			'status': 'error',
			'message': `Unknown error!`,
		});
	}
});

module.exports = router;
