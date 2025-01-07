const express = require('express');
const router = express.Router();
const mysqlP = require('mysql2/promise');
const { mmrRange_3s, mmrRange_2s, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const guild_league = {
	'395806681994493964': 3, 
	'809939294331994113': 2,
};
const league_guild = {
	3: '395806681994493964',
	2: '809939294331994113',
};

async function get_lobby(db,match_id) {
	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,
			reported_rsc_id,confirmed_rsc_id,home_mmr as tier,
			completed,cancelled,league AS guild_id,
		FROM combine_matches 
		WHERE id = ?
	`;
	const [results] = await db.query(active_query, [match_id]);
	const games = {};
	const game_ids = [];
	let league = 3;
	let team_size = 3;
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			game_ids.push(results[i].id);
			const game = results[i];
			if ( game.guild_id === 3 ) {
				league = 3;
				team_size = 3;
			} else if ( game.guild_id === 2 ) {
				league = 2;
				team_size = 2;
			}
			game.guild_id = league_guild[game.guild_id];
			game.tier = getTierFromMMR(Math.floor(game.tier / team_size), league);
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
			LEFT JOIN combine_matches AS m 
			ON p.match_id = m.id 
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id AND m.season = t.season AND m.league = t.league
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
			completed,cancelled,league AS guild_id
		FROM combine_matches 
		WHERE completed = 0 AND cancelled = 0 AND id = ?
	`;
	const [results] = await db.query(active_query, [match_id]);
	const games = {};
	const game_ids = [];
	let league = 3;
	let team_size = 3;
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			game_ids.push(results[i].id);
			const game = results[i];
			if ( game.guild_id === 3 ) {
				league = 3;
				team_size = 3;
			} else if ( game.guild_id === 2 ) {
				league = 2;
				team_size = 2;
			}
			game.guild_id = league_guild[game.guild_id];
			game.tier = getTierFromMMR(Math.floor(game.tier / team_size), league);
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
			LEFT JOIN combine_matches AS m 
			ON p.match_id = m.id
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id AND m.league = t.league AND m.season = t.season
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
	res.locals.league = 3;
	res.locals.guild_id = league_guild[3];
	res.locals.discord_id = null;
	res.locals.checked_in = false;
	
	if ( req.method === 'GET') {
		res.locals.discord_id = req.query.discord_id;
		if ( 'guild_id' in req.query ) {
			if ( req.query.guild_id !== res.locals.guild_id ) {
				if ( req.query.guild_id in guild_league ) {
					res.locals.guild_id = req.query.guild_id;
					res.locals.league = guild_league[req.query.guild_id];
				}
			}
		}
	} else {
		res.locals.discord_id = req.body.discord_id;
		if ( 'guild_id' in req.body ) {
			if ( req.body.guild_id !== res.locals.guild_id ) {
				if ( req.query.guild_id in guild_league ) {
					res.locals.guild_id = req.body.guild_id;
					res.locals.league = guild_league[req.body.guild_id];
				}
			}
		}
	}
	res.locals.combines_season = res.locals.league === 3 ? res.locals.combines.season : res.locals.combines_2s.season;

	try {

		console.log(`\n--- COMBINES API ROUTE --- League: ${res.locals.league} - ${res.locals.guild_id}`);
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
			const tm_query = `
				SELECT 
					t.rsc_id,t.name,t.current_mmr,
					b.id AS ban_id, b.note AS ban_note,
					b.banned_by, b.created_dtg AS banned_on
					
				FROM tiermaker AS t 
				LEFT JOIN player_bans AS b 
					ON t.discord_id = b.discord_id
				WHERE t.discord_id = ? AND t.season = ? AND t.league = ?
			`
			const [tm_results] = await res.locals.adb.query(
				tm_query,
				[res.locals.discord_id, res.locals.combines_season, res.locals.league]
			);

			if ( ! tm_results || ! tm_results.length ) {
					if ( req.originalUrl.includes('lobby') || req.originalUrl.includes('games') ) {
						return next();
					} else {
						return res.json({
							'status': 'error',
							'message': 'You are not a player in the tiermaker. ',
						});
					}
			}

			if ( tm_results[0].ban_id ) {
				return res.json({
					'status': 'error',
					'message': "You are banned from participating in Combines. \n\n__**Reason**__:```" + tm_results[0].ban_note + "```",
				});
			}

			res.locals.rsc_id = tm_results[0].rsc_id;
			res.locals.name = tm_results[0].name;
			res.locals.current_mmr = tm_results[0].current_mmr;
			
			const query = `
			SELECT id,active,rostered FROM combine_signups 
			WHERE 
				discord_id = ? AND 
				season = ? AND league = ? AND signup_dtg > DATE_SUB(now(), INTERVAL 2 HOUR)
			ORDER BY id DESC 
			LIMIT 1
			`;

			const [signupResults] = await res.locals.adb.query(query, [ res.locals.discord_id, res.locals.combines_season , res.locals.league]);
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
			if ( req.originalUrl.includes('games') ) {
				next();
			} else {
				return res.json({
					'status': 'error',
					'message': 'You must provide a `discord_id`.',
				});
			}

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

router.get('/games', async(req,res) => {
	const players_query = `
		SELECT
			season,rsc_id,discord_id,name,tier,wins,losses,
			wins + losses AS games,((wins / (wins+losses)) *100) as win_pct
		FROM tiermaker 
		WHERE season = ? AND league = ? AND (losses > 0 OR wins > 0)
		ORDER BY rsc_id ASC  
	`;
	const [results] = await res.locals.adb.query(players_query, [res.locals.combines_season, res.locals.league]);

	await res.locals.adb.end();

	return res.json(results);
});

router.get('/games/:rsc_id_or_discord_id', async(req,res) => {
	const players_query = `
		SELECT
			season,rsc_id,discord_id,name,tier,wins,losses,
			wins + losses AS games,((wins / (wins+losses)) * 100) as win_pct
		FROM tiermaker 
		WHERE season = ? AND league = ? AND (rsc_id = ? OR discord_id = ?) AND (losses > 0 OR wins > 0)
		ORDER BY rsc_id ASC  
	`;
	const [results] = await res.locals.adb.query(players_query, [
		res.locals.combines_season,
		res.locals.league,
		req.params.rsc_id_or_discord_id,
		req.params.rsc_id_or_discord_id,
	]);

	await res.locals.adb.end();

	return res.json(results);
});

router.get('/active', async(req,res) => {
	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,home_mmr,
			reported_rsc_id,confirmed_rsc_id,
			completed,cancelled,
			league AS guild_id
		FROM combine_matches 
		WHERE completed = 0 AND cancelled = 0 AND league = ? AND season = ?
	`;
	const [results] = await res.locals.adb.query(active_query, [res.locals.league, res.locals.combines_season]);
	const games = {};
	const game_ids = [];
	let league = 3;
	let team_size = 3;
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			// TODO(erh): Add "getTierFromMMR()" for Nick
			game_ids.push(results[i].id);
			const game = results[i];
			if ( game.guild_id === 3 ) {
				league = 3;
				team_size = 3;
			} else if ( game.guild_id === 2 ) {
				league = 2;
				team_size = 2;
			}
			game.guild_id = league_guild[game.guild_id];
			game.tier = getTierFromMMR(game.home_mmr/team_size, league);
			delete(game.home_mmr);
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
			LEFT JOIN combine_matches AS m 
			ON p.match_id = m.id
			LEFT JOIN tiermaker AS t 
			ON p.rsc_id = t.rsc_id AND m.league = t.league AND m.season = t.season
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
			ON p.rsc_id = t.rsc_id AND m.season = t.season AND m.league = t.league
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
				(season,league,rsc_id,discord_id,current_mmr) 
			VALUES 
				(     ?,     ?,     ?,         ?,          ?)
		`;
		const [inserted] = await res.locals.adb.query(query, [
			res.locals.combines_season,
			res.locals.league,
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
		const combines = res.locals.league === 3 ? res.locals.combines : res.locals.combines_2s;

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
				league = ? AND 
				rsc_id = ? AND 
				discord_id = ? AND 
				rostered = 0 AND 
				signup_dtg > DATE_SUB(now(), INTERVAL 2 HOUR)
		`;

		const [deletedId] = await res.locals.adb.query(query, [
			res.locals.combines_season,
			res.locals.league,
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
