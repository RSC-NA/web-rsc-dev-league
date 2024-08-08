const express = require('express');
const router  = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { stringify } = require('csv-stringify');

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

function get_rand_word(suffix='') {
	const words = [
		'octane', 'gizmo', 'breakout', 'merc', 'hotshot', 'gizmo', 'backfire',
		'xdevil', 'paladin', 'hog', 'road', 'venom', 'dominus', 'luigi', 
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
	return `${words[ Math.floor(Math.random() * words.length) ]}${suffix}`;
}

/**
 * lobby {
 *	username: string, password: string,
 *	home: { players: [], mmr: number, delta: number }
 *	away: { players: [], mmr: number, delta: number }
 * }
 */
async function make_lobby(db, lobby) {
	const league = lobby.league;
	const TEAM_SIZE = lobby.league === 2 ? 2 : 3;
	const match_query = `
		INSERT INTO combine_matches
			(season, league, lobby_user, lobby_pass, home_mmr, away_mmr)
		VALUES 
			(     ?,      ?,          ?,          ?,        ?,        ?)
	`;
	const params = [
		lobby.season,
		lobby.league,
		lobby.username,
		lobby.password,
		lobby.home.mmr,
		lobby.away.mmr,
	];
	const [results] = await db.execute(match_query, params);
	const match_id = results.insertId;

	const username_query = 'UPDATE combine_matches SET lobby_user = ? WHERE id = ?';
	await db.execute(username_query, [ `RSC${match_id}`, match_id ]);

	const home = [];
	const away = [];
	console.log(lobby);
	for ( let i = 0; i < TEAM_SIZE; ++i ) {
		home.push([match_id,lobby.home.players[i].rsc_id,'home',lobby.home.players[i].current_mmr]);
		away.push([match_id,lobby.away.players[i].rsc_id,'away',lobby.away.players[i].current_mmr]);
	}

	console.log(home, away);

	const players_query = `
		INSERT INTO combine_match_players 
			(match_id,rsc_id,team,start_mmr) 
		VALUES ?
	`;	
	const players = home.concat(away);
	const [player_results] = await db.query(players_query, [players]);

}

function calculate_mmrs(team) {
	if ( ! team ) { return 0; }
	if ( ! team.length ) { return 0; }
	let mmr = 0;
	for ( let i = 0; i < team.length; ++i ) {
		if ( "current_mmr" in team[i] ) {
			mmr += team[i].current_mmr;
		}
	}

	return mmr;
}

// games is an array of games with winner
// [ 'home', 'home', 'away', 'home' ]
function game_outcome(home_mmr, away_mmr, games) {
	const outcome = {
		home: { start: home_mmr, end: home_mmr, w: 0, l: 0, },
		away: { start: away_mmr, end: away_mmr, w: 0, l: 0, },
		delta: [],
	};

	for ( let i = 0; i < games.length; ++i ) {
		if ( games[i] === 'home' ) {
			outcome.home.w += 1;
			outcome.away.l += 1;
		} else {
			outcome.home.l += 1;
			outcome.away.w += 1;
		}
	}

	const delta = rating_delta_series(home_mmr, away_mmr, { home: outcome.home.w, away: outcome.away.w });

	outcome.delta = delta;
	outcome.home.end = delta.home.end;
	outcome.away.end = delta.away.end;

	return outcome;
}

function rating_delta_series(home_mmr, away_mmr, scores, k_factor = 32) {
	const home_win_chance = 1 / ( 1 + Math.pow(10, (away_mmr - home_mmr) / 400));
	const away_win_chance = 1 / ( 1 + Math.pow(10, (home_mmr - away_mmr) / 400));

	const home_result = scores.home / 3;
	const away_result = scores.away / 3;

	const home_delta = Math.round(k_factor * (home_result - home_win_chance));
	const away_delta = Math.round(k_factor * (away_result - away_win_chance));

	const results = { 
		home: {
			start: home_mmr,
			delta: home_delta,
			end: home_mmr + home_delta,
		},
		away: {
			start: away_mmr,
			delta: away_delta,
			end: away_mmr + away_delta,
		},
	};

	return results;
}

// winner can be "home" or "away"
function rating_delta(home_mmr, away_mmr, winner, k_factor = 32) {
	const home_win_chance = 1 / ( 1 + Math.pow(10, (away_mmr - home_mmr) / 400));
	const away_win_chance = 1 / ( 1 + Math.pow(10, (home_mmr - away_mmr) / 400));

	const home_result = winner === 'home' ? 1 : 0; 
	const away_result = winner === 'home' ? 0 : 1;

	const home_delta = Math.round(k_factor * (home_result - home_win_chance));
	const away_delta = Math.round(k_factor * (away_result - away_win_chance));

	const results = { 
		home: {
			start: home_mmr,
			delta: home_delta,
			final: home_mmr + home_delta,
		},
		away: {
			start: away_mmr,
			delta: away_delta,
			final: away_mmr + away_delta,
		},
	};

	return results;
}

async function send_bot_message(actor, status, message_type, message, match={}) {
	console.log(`[BOT-${status}:${match?.id || null}] ${actor.nickname} did "${message}"`);
	const outbound = {
		actor: actor,
		status: status,
		message_type: message_type,
		message: message,
		match_id: match?.id || null,
	};
	try {
		await fetch('http://localhost:8008/combines_event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Api-Key ${process.env.RSC_API_KEY}`,
			},
			body: JSON.stringify(outbound)
		});
	} catch(e) { 
		console.error('ERROR SENDING TO THE BOT', e);
	}
}


async function notify_bot(db, league, season) {
	console.log(`SENDING THE STUFF TO THE BOT FOR ${league}s League`);
	const games = await get_active(db, league, season);
	if ( games && Object.keys(games).length ) {

		try {
			await fetch('http://localhost:8008/combines_match', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Api-Key ${process.env.RSC_API_KEY}`,
				},
				body: JSON.stringify(games)
			});
		} catch(e) { 
			console.error('ERROR SENDING TO THE BOT', e);
		}
	}

	console.log('SENDING STUFF TO THE BOT CMPLETE');
}

async function get_active(db, league, season) {
	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,
			reported_rsc_id,confirmed_rsc_id,home_mmr as tier,
			completed,cancelled 
		FROM combine_matches 
		WHERE completed = 0 AND cancelled = 0 AND league = ?
	`;
	const [results] = await db.query(active_query, [league]);
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
			ON p.rsc_id = t.rsc_id AND t.season = ? AND t.league = ?
			WHERE p.match_id in (?)
		`;
		const [p_results] = await db.query(players_query, [season, league, game_ids]);
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

function rating_delta_series_overload(home_mmr, away_mmr, scores, k_factor=48) {
	home_mmr = home_mmr / 3;
	away_mmr = away_mmr / 3;
	const home_win_chance = 1 / ( 1 + Math.pow(10, (away_mmr - home_mmr) / 400));
	const away_win_chance = 1 / ( 1 + Math.pow(10, (home_mmr - away_mmr) / 400));

	const home_result = scores.home / 3;
	const away_result = scores.away / 3;

	const home_delta = Math.round(k_factor * (home_result - home_win_chance));
	const away_delta = Math.round(k_factor * (away_result - away_win_chance));

	const results = { 
		home: {
			start: parseInt(home_mmr),
			delta: home_delta,
			end: parseInt(home_mmr) + home_delta,
		},
		away: {
			start: parseInt(away_mmr),
			delta: away_delta,
			end: parseInt(away_mmr) + away_delta,
		},
	};

	return results;
}

// const match_query = `
// 	SELECT 
// 		id, match_dtg, season, league, lobby_user, lobby_pass, home_mmr, away_mmr,
// 		home_wins, away_wins, reported_rsc_id, confirmed_rsc_id, 
// 		completed, cancelled 
// 	FROM 
// 		combine_matches 
// 	WHERE id = ?
// `;
// const players_query = `
// 	SELECT 
// 		p.id, p.rsc_id, p.team, p.start_mmr, p.end_mmr,
// 		t.name,t.effective_mmr,t.wins,t.losses
// 	FROM combine_match_players AS p
// 	LEFT JOIN tiermaker AS t ON p.rsc_id = t.rsc_id AND t.league = ?
// 	WHERE p.match_id = ?
// `;
async function remove_previous_wins_overload(db, match, home_wins, away_wins, league, season) {
	const tiermaker_query = `
		UPDATE tiermaker set wins = ?, losses = ? WHERE rsc_id = ? AND league = ?
	`;

	//console.log('update wins');
	//console.log(match, home_wins, away_wins);

	for ( const rsc_id in match.players ) {
		const p = match.players[rsc_id];
		const home_wins = match.home_wins;
		const away_wins = match.away_wins;

		const new_wins   = p.wins   - (p.team === 'home' ? match.home_wins : match.away_wins);
		const new_losses = p.losses - (p.team === 'home' ? match.away_wins : match.home_wins);
		console.log(`Updating: [${p.team}] ${p.name}, ${rsc_id}: ${p.wins}-${p.losses} -> ${new_wins}-${new_losses}`);
		await db.execute(tiermaker_query, [new_wins,new_losses,rsc_id,match.league]);
	}

	return true;
}

async function update_mmrs_overload(db, match, new_home_wins, new_away_wins, k_factor=48, league, season) {
	const scores = { home: new_home_wins, away: new_away_wins };
	const delta = rating_delta_series_overload(match.home_mmr, match.away_mmr, scores, k_factor);

	const player_query = `
		UPDATE combine_match_players SET end_mmr = ? WHERE match_id = ? AND rsc_id =?
	`;
	const tiermaker_query = `
		UPDATE tiermaker set current_mmr = ?, wins = ?, losses = ? WHERE rsc_id = ? AND league = ? AND season = ?
	`;

	console.log(scores);
	console.log(delta);

	for ( const rsc_id in match.players ) {
		const p = match.players[rsc_id];
		
		let new_p_wins = 0;
		let new_p_losses = 0;
		if ( p.team === 'home' ) {
			new_p_wins   = p.wins - match.home_wins;
			new_p_losses = p.losses - match.away_wins;
			new_p_wins += new_home_wins;
			new_p_losses += new_away_wins;
		} else {
			new_p_wins   = p.wins - match.away_wins;
			new_p_losses = p.losses - match.home_wins;
			new_p_wins += new_away_wins;
			new_p_losses += new_home_wins;
		}

		console.log(`Updating: [${p.team}] ${p.name}, ${rsc_id}: ${p.wins}-${p.losses} -> ${new_p_wins}-${new_p_losses}`);

		const new_mmr = p.start_mmr + delta[p.team].delta;
		await db.execute(player_query, [new_mmr, match.id, rsc_id]);
		await db.execute(tiermaker_query, [new_mmr,new_p_wins,new_p_losses,rsc_id,match.league,season]);
	}

	match.delta = delta;
	return match;
}
/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
// this route takes a game that is completed and "rescores" the MMRs of everyone in the lobby.
/*
async function (db, match, k_factor=48, league, season) {
	const scores = { home: match.home_wins, away: match.away_wins };
	const delta = rating_delta_series(match.home_mmr, match.away_mmr, scores, k_factor);

	const player_query = `
		UPDATE combine_match_players SET end_mmr = ? WHERE match_id = ? AND rsc_id =?
	`;
	const tiermaker_query = `
		UPDATE tiermaker set current_mmr = ?, wins = ?, losses = ? WHERE rsc_id = ? AND league = ? AND season = ?
	`;

	for ( const rsc_id in match.players ) {
		console.log('Updating...',rsc_id);
		const p = match.players[rsc_id];
		const new_mmr = p.start_mmr + delta[p.team].delta;
		const new_wins = p.wins + scores[p.team];
		const new_losses = p.losses + (3 - scores[p.team]);
		await db.execute(player_query, [new_mmr, match.id, rsc_id]);
		await db.execute(tiermaker_query, [new_mmr,new_wins,new_losses,rsc_id,league,season]);
	}

	match.delta = delta;
	return match;
}
*/

router.get('/fix_discord_ids/:league/:season', async (req, res) => {
	const league = parseInt(req.params.league);
	const season = parseInt(req.params.season);
	
	const DO_UPDATE = req.query.update ? req.query.update : false;

	const query = `
		SELECT 
			p.rsc_id as p_rsc_id,p.discord_id as p_discord_id,p.nickname,
			t.rsc_id as t_rsc_id,t.discord_id as t_discord_id,t.name 
		FROM players AS p 
		LEFT JOIN tiermaker as t 
		ON t.season = ? AND t.league = ? AND p.rsc_id = t.rsc_id
		WHERE t.discord_id is null
	`;
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

	const [broken] = await db.execute(query, [season, league]);

	const update_query = 'UPDATE tiermaker SET discord_id = ? WHERE season = ? AND league = ? AND rsc_id = ?';
	if ( broken && broken.length ) {
		for ( let i = 0; i < broken.length; ++i ) {
			if ( broken[i].p_discord_id ) {
				if ( DO_UPDATE ) {
					const updated = [broken[i].p_discord_id, season, league, broken[i].p_rsc_id];
					await db.execute(update_query, updated);
					updates.push(updated);
				} else {
					const updated = [broken[i].p_discord_id, season, league, broken[i].p_rsc_id];
					updates.push(updated);
				}
			}
		}
	}

	await db.end();
	res.json(updates);
	
});

router.get('/fix_rscids/:league/:season', async (req, res) => {
	const league = parseInt(req.params.league);
	const season = parseInt(req.params.season);
	
	const DO_UPDATE = req.query.update ? req.query.update : false;

	const query = `
		SELECT 
			p.id,p.rsc_id,p.discord_id,p.nickname,
			t.rsc_id AS t_rsc_id,t.discord_id AS t_discord_id, 
			t.name 
		FROM players AS p 
		LEFT JOIN tiermaker AS t 
		ON p.discord_id = t.discord_id AND t.season = ? AND league = ?
		WHERE (p.rsc_id is null AND t.discord_id IS NOT null) OR (p.nickname != t.name) 
	`;
	
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

	const [broken] = await db.execute(query, [season, league]);

	if ( DO_UPDATE && DO_UPDATE === 'rsc_id' ) {
		const update_query = 'UPDATE players SET rsc_id = ? WHERE id = ?';
		for ( let i = 0; i < broken.length; ++i ) {
			const p = broken[i];
			await db.execute(update_query, [p.t_rsc_id, p.id]);
		}
	} else if ( DO_UPDATE && DO_UPDATE === 'names' ) {
		const update_query = 'UPDATE players SET nickname = ? WHERE id = ?';
		for ( let i = 0; i < broken.length; ++i ) {
			const p = broken[i];
			await db.execute(update_query, [p.name, p.id]);
		}
	} else if ( DO_UPDATE && DO_UPDATE === 'all' ) {
		const update_query = 'UPDATE players SET rsc_id = ?, nickname = ? WHERE id = ?';
		for ( let i = 0; i < broken.length; ++i ) {
			const p = broken[i];
			await db.execute(update_query, [p.t_rsc_id, p.name, p.id]);
		}
	}

	await db.end();
	res.json({
		update: DO_UPDATE ? DO_UPDATE : false,
		update_all: DO_UPDATE && DO_UPDATE === 'all' ? 'Updated All Records' : 'Send ?update=all to update RSC_ID and player nickname',
		update_names: DO_UPDATE && DO_UPDATE === 'names' ? 'Updated Names Records' : 'Send ?update=names to process NICKNAMES ONLY.',
		update_rsc_id: DO_UPDATE && DO_UPDATE === 'rsc_id' ? 'Updated RSC IDs' : 'Send ?update=rsc_id to process RSC_IDs ONLY.',
		desynced: broken && broken.length ? broken : 'No accounts currently desynced. Nothing to do!',
	});
});

// route to re-run MMR calculations based on match results
router.get('/recalculate/:league/:season', async (req, res) => {
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

	const DO_UPDATE = req.query.update ? true : false;

	const league = req.params.league;
	const season = req.params.season;

	console.log('recalculating', league, season);
	console.log(DO_UPDATE ? 'Performing Update...' : 'Simulating...');

	tiermaker = {};
	const players_query = `
		SELECT 
			id,discord_id,rsc_id,name,tier,
			base_mmr,effective_mmr,effective_mmr AS current_mmr,
			0 as wins, 0 as losses 
		FROM tiermaker 
		WHERE league = ? AND season = ?
	`;
	const [player_results] = await db.execute(players_query, [league, season]);
	if ( player_results && player_results.length ) {
		for ( let i = 0; i < player_results.length; ++i ) {
			const p = player_results[i];
			tiermaker[p.rsc_id] = p;
		}
	}

	const matches = {};
	const matches_query = `
		SELECT 
			id, match_dtg, 
			home_mmr, away_mmr, null AS real_mmrs, 
			home_wins, away_wins,
			null AS delta,
			null AS players 
		FROM combine_matches 
		WHERE league = ? AND season = ? 
		AND completed = 1 AND cancelled = 0 
		ORDER BY id ASC
	`;
	const [match_results] = await db.execute(matches_query, [league, season]);
	if ( match_results && match_results.length ) {
		for ( let i = 0; i < match_results.length; ++i ) {
			const match = match_results[i];
			match.players = {};
			matches[match.id] = match;
		}
	}

	const match_players = `
		SELECT 
			id,match_id,rsc_id,team,
			start_mmr,end_mmr,
			0 as real_start_mmr, 0 as real_end_mmr,
			0 as new_start_mmr, 0 as delta, 0 as new_end_mmr
		FROM combine_match_players 
		WHERE match_id IN (
			SELECT id FROM combine_matches 
			WHERE 
				league = ? AND season = ? AND 
				completed = 1 AND cancelled = 0
		)
	`;
	const [match_players_results] = await db.execute(match_players, [league,season]);
	if ( match_players_results && match_players_results.length ) {
		for ( let i = 0; i < match_players_results.length; ++i ) {
			const p = match_players_results[i];
			if ( p.match_id in matches ) {
				matches[p.match_id]['players'][p.rsc_id] = p;
			}
		}
	}

	const changes = {
		matches: {},
		match_players: {},
		tiermaker: {},
	};

	for ( const match_id in matches ) {
		const match = matches[match_id];

		const real_mmrs = {
			home: 0,
			away: 0,
		};

		for ( const rsc_id in match['players'] ) {
			const p = match['players'][rsc_id];
			if ( ! (rsc_id in tiermaker) ) {
				console.log('missing player', rsc_id, `match=${match.id}`);
			} else { 
				match['players'][rsc_id]['real_start_mmr'] = tiermaker[rsc_id].current_mmr;
				match['players'][rsc_id]['new_start_mmr'] = tiermaker[rsc_id].current_mmr;
				match['players'][rsc_id]['new_end_mmr'] = tiermaker[rsc_id].current_mmr;
				real_mmrs[p.team] += tiermaker[rsc_id].current_mmr;
			}
		}

		matches[match_id].real_mmrs = real_mmrs;
		
		changes.matches[match_id] = {
			id: match.id,
			home_mmr: match.real_mmrs.home,	
			away_mmr: match.real_mmrs.away,	
		};
			
		const delta = rating_delta_series(
			real_mmrs.home,
			real_mmrs.away,
			{ home: match.home_wins, away: match.away_wins },
			k_factor = 32
		);

		matches[match_id].delta = delta;

		for ( const rsc_id in match['players'] ) {
			const p = match['players'][rsc_id];

			// if ( ! ( match_id in changes.match_players ) ) {
			// 	changes.match_players[match_id] = {};
			// }
		
			if ( ! (rsc_id in tiermaker) ) {
				console.log('WTF');
				console.log(rsc_id,match);
			} else {

				match['players'][rsc_id]['new_end_mmr'] += delta[p.team].delta;
				match['players'][rsc_id]['delta'] += delta[p.team].delta;
				tiermaker[rsc_id].current_mmr = match['players'][rsc_id]['new_end_mmr'];
				if ( p.team === 'home' ) {
					tiermaker[rsc_id].wins += match.home_wins;
					tiermaker[rsc_id].losses += match.away_wins;
				} else {
					tiermaker[rsc_id].wins += match.away_wins;
					tiermaker[rsc_id].losses += match.home_wins;
				}
				changes.match_players[p.id] = {
					id: p.id,
					match_id: p.match_id,
					start_mmr: p.new_start_mmr,
					end_mmr: p.new_end_mmr,
				};
			}
		}

		matches[match_id] = match;
	}

	for ( const rsc_id in tiermaker ) {
		const p = tiermaker[rsc_id];

		if ( p.wins || p.losses ) {
			changes.tiermaker[rsc_id] = p;
		}
	}

	const queries = {
		matches: 'UPDATE combine_matches SET home_mmr = ?, away_mmr = ? WHERE id = ?',
		match_players: 'UPDATE combine_match_players SET start_mmr = ?, end_mmr = ? WHERE id = ?',
		tiermaker: 'UPDATE tiermaker SET current_mmr = ?, wins = ?, losses = ? WHERE rsc_id = ? AND league = ? AND season = ?',
	};
	for ( const change_type in changes ) {
		let updated = 0;

		const change_list = changes[change_type];

		const query = queries[change_type];
		console.log(query);

		for ( const id in change_list ) {
			const record = change_list[id];
			let update_vals = [];
			if ( change_type === 'matches' ) {
				update_vals = [ record.home_mmr, record.away_mmr, record.id ];
			} else if ( change_type === 'match_players' ) {
				update_vals = [ record.start_mmr, record.end_mmr, record.id ];
			} else if ( change_type === 'tiermaker' ) {
				update_vals = [ record.current_mmr, record.wins, record.losses, record.rsc_id, league, season ];
			}

			if ( DO_UPDATE ) {
				await db.execute(query, update_vals);
			}

			console.log(update_vals);
		}
	}

	await db.end();

	res.json(changes);

});

router.post('/overload/:match_id/:league', async (req, res) => {
	const match_id = req.params.match_id;

	const home_wins = parseInt(req.body.home_wins);
	const away_wins = parseInt(req.body.away_wins);

	const league = req.params.league ? parseInt(req.params.league) : 3;
	const SEASON = league === 3 ? res.locals.combines.season : res.locals.combines_2s.season;
	
	const actor = {
		nickname: res.locals.user.nickname,
		discord_id: res.locals.user.discord_id,
	};

	if ( 
		(home_wins < 0 || home_wins > 3) ||
		(away_wins < 0 || away_wins > 3 ) ) {
		return res.redirect(`/combine/${match_id}?error=InvalidScore`);
	}

	if ( home_wins + away_wins != 3 ) {
		return res.redirect(`/combine/${match_id}?error=InvalidScore`);
	}


	const my_rsc_id = res.locals.user.rsc_id;

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

	const match_query = `
		SELECT 
			id, match_dtg, season, league, lobby_user, lobby_pass, home_mmr, away_mmr,
			home_wins, away_wins, reported_rsc_id, confirmed_rsc_id, 
			completed, cancelled 
		FROM 
			combine_matches 
		WHERE id = ?
	`;
	const [match_results] = await db.execute(match_query, [match_id]);

	//console.log('overload', home_wins,away_wins, match_results[0]);

	let match = {};
	if ( match_results && match_results.length ) {
		match = match_results[0];
		match.replays = [];
		match.players = {};
	}
	
	if ( home_wins === match.home_wins || away_wins === match.away_wins ) {
		return res.redirect(`/combine/${match_id}/${league}?error=AlreadyScored`);
	}

	const players_query = `
		SELECT 
			p.id, p.rsc_id, p.team, p.start_mmr, p.end_mmr,
			t.name,t.effective_mmr,t.wins,t.losses
		FROM combine_match_players AS p
		LEFT JOIN tiermaker AS t ON p.rsc_id = t.rsc_id AND t.league = ? AND t.season = ?
		WHERE p.match_id = ?
	`;
	const [players_results] = await db.execute(players_query, [league, SEASON, match_id]);

	if ( players_results && players_results.length ) {
		for ( let i = 0; i < players_results.length; ++i ) {
			const p = players_results[i];
			match.players[p.rsc_id] = p;
		}
	}

	let can_save = false;
	let can_report = false;
	let can_confirm = false;
	if ( league === 2 ) {
		if ( req.session.is_admin || req.session.is_combines_admin_2s ) {
			can_save = true;
			can_report = true;
			can_confirm = true;
		}
	} else {
		if ( req.session.is_admin || req.session.is_combines_admin ) {
			can_save = true;
			can_report = true;
			can_confirm = true;
		}
	}

	if ( ! can_save ) {
		await db.end();
		return res.redirect(`/combine/${match_id}/${league}?error=NotInLobby`);
	}

	console.log(match.reported_rsc_id);
	console.log(match.confirmed_rsc_id);

	// finalize score, modify MMR if necessary
	if ( match.home_wins || match.away_wins ) {

		// scoring complete, but wrong. update score, fix MMRs
		if ( match.reported_rsc_id && match.confirmed_rsc_id ) {
			const COMPLETED = true;

			const report_query = `
				UPDATE combine_matches 
				SET 
					home_wins = ?, 
					away_wins = ?, 
					completed = ?
				WHERE id = ?
			`;
			await db.execute(report_query, [home_wins, away_wins, COMPLETED, match_id]);

			//await remove_previous_wins_overload(db, match, home_wins, away_wins, league, SEASON);

			let k_factor = null;
			if ( league === 2 ) {
				k_factor = res.locals.combines_2s.k_factor;
			} else if ( league === 3 ) {
				k_factor = res.locals.combines.k_factor;
			}

			const delta = await update_mmrs_overload(db, match, home_wins, away_wins, k_factor, league, SEASON);
			await db.end();
			await send_bot_message(
				actor,
				'success',
				'Finished Game',
				`This match is over with a score of ${home_wins}-${away_wins}. You may now queue again.`,
				match
			);
			return res.redirect(`/combine/${match_id}/${league}?finished`);

		/* Just update the score and let the normal process 
		 * be managed by the existing teams (or the normal interface)
		 */
		// reported wrong, but not confirmed
		} else if ( match.reported_rsc_id && ! match.confirmed_rsc_id ) {
			console.log('reported wrong', [home_wins, away_wins, my_rsc_id, match_id]);
			const report_query = `
				UPDATE combine_matches 
				SET 
					home_wins = ?, 
					away_wins = ?, 
					reported_rsc_id = ?
				WHERE id = ?
			`;
			await db.execute(report_query, [home_wins, away_wins, my_rsc_id, match_id]);
			
		// confirmed wrong, but not reported
		} else if ( match.confirmed_rsc_id && ! match.reported_rsc_id ) {
			const report_query = `
				UPDATE combine_matches 
				SET 
					home_wins = ?, 
					away_wins = ?, 
					confirmed_rsc_id = ?
				WHERE id = ?
			`;
			await db.execute(report_query, [home_wins, away_wins, my_rsc_id, match_id]);

		}
	} else {
		await db.end();
		return res.redirect(`/combine/${match_id}/${league}?error=NotScored`);
	}

	await db.end();
	return res.redirect(`/combine/${match_id}/${league}?updated`);


	// if ( can_report && match.reported_rsc_id ) {
	// 	if ( match.home_wins || match.away_wins ) {
	// 		if ( match.home_wins !== home_wins ) {
	// 			const report_query = `
	// 				UPDATE combine_matches 
	// 				SET 
	// 					home_wins = ?, 
	// 					away_wins = ?, 
	// 					reported_rsc_id = ?
	// 				WHERE id = ?
	// 			`;
	// 			await db.execute(report_query, [home_wins, away_wins, my_rsc_id, match_id]);
	// 		}
	// 	}
	// }
	//
	// if ( )

	//
	// if ( can_report && ! match.reported_rsc_id ) {
	// 	if ( match.confirmed_rsc_id && (match.home_wins || match.away_wins)) {
	// 		if ( match.home_wins !== home_wins || match.away_wins !== away_wins ) {
	// 			await db.end();
	// 			await send_bot_message(
	// 				actor,
	// 				'error',
	// 				'Score Report Mismatch',
	// 				`Score was ${match.home_wins}-${match.away_wins} and received ${home_wins}-${away_wins}.`,
	// 				match
	// 			);
	// 			return res.redirect(`/combine/${match_id}?error=ScoreReportMismatch`);
	// 		}
	// 	}
	//
	// 	const completed = match.confirmed_rsc_id ? 1 : 0;
	// 	
	// 	const report_query = `
	// 		UPDATE combine_matches 
	// 		SET 
	// 			home_wins = ?, 
	// 			away_wins = ?, 
	// 			reported_rsc_id = ?,
	// 			completed = ?
	// 		WHERE id = ?
	// 	`;
	// 	await db.execute(report_query, [home_wins, away_wins, my_rsc_id, completed, match_id]);
	//
	// 	if ( completed ) {	
	// 		await remove_previous_wins_overload(db, match, home_wins, away_wins);
	//
	// 		const delta = await update_mmrs_overload(db, match, res.locals.combines.k_factor);
	// 		await db.end();
	// 		await send_bot_message(
	// 			actor,
	// 			'success',
	// 			'Finished Game',
	// 			`This match is over with a score of ${home_wins}-${away_wins}. You may now queue again.`,
	// 			match
	// 		);
	// 		return res.redirect(`/combine/${match_id}?finished`);
	// 	} else {
	// 		await db.end();
	// 		await send_bot_message(
	// 			actor,
	// 			'success',
	// 			'Reported Score',
	// 			`${home_wins}-${away_wins}`,
	// 			match
	// 		);
	// 		return res.redirect(`/combine/${match_id}?reported`);
	// 	}
	// } 
	//
	// if ( can_confirm && ! match.confirmed_rsc_id ) {
	// 	if ( match.reported_rsc_id && (match.home_wins || match.away_wins)) {
	// 		if ( match.home_wins !== home_wins || match.away_wins !== away_wins ) {
	// 			await db.end();
	// 			await send_bot_message(
	// 				actor,
	// 				'error',
	// 				'Score Report Mismatch',
	// 				`Score was ${match.home_wins}-${match.away_wins} and received ${home_wins}-${away_wins}.`,
	// 				match
	// 			);
	// 			return res.redirect(`/combine/${match_id}?error=ScoreReportMismatch`);
	// 		}
	// 	}
	//
	// 	const completed = match.reported_rsc_id ? 1 : 0;
	// 	
	// 	const report_query = `
	// 		UPDATE combine_matches 
	// 		SET 
	// 			home_wins = ?, 
	// 			away_wins = ?, 
	// 			confirmed_rsc_id = ?,
	// 			completed = ?
	// 		WHERE id = ?
	// 	`;
	// 	await db.execute(report_query, [home_wins, away_wins, my_rsc_id, completed, match_id]);
	//
	// 	if ( completed) {	
	// 		const delta = await update_mmrs_overload(db, match, res.locals.combines.k_factor);
	// 		await db.end();
	// 		await send_bot_message(
	// 			actor,
	// 			'success',
	// 			'Finished Game',
	// 			`This match is over with a score of ${home_wins}-${away_wins}. You may now queue again.`,
	// 			match
	// 		);
	// 		return res.redirect(`/combine/${match_id}?finished`);
	// 	} else {
	// 		await db.end();
	// 		await send_bot_message(
	// 			actor,
	// 			'success',
	// 			'Reported Score',
	// 			`${home_wins}-${away_wins}`,
	// 			match
	// 		);
	// 		return res.redirect(`/combine/${match_id}?confirmed`);
	// 	}
	// }
	//
	// await db.end();
	// await send_bot_message(
	// 	actor,
	// 	'error',
	// 	'Game Complete',
	// 	'This game has already ended. The score cannot be reported again.',
	// 	match
	// );
	// res.redirect(`/combine/${match_id}?error=AlreadyReported`);
});

router.get('/resend_bot', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
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

	await notify_bot(db, 3, res.locals.combines.season);

	await db.end();

	res.redirect('/combines/process');
});

router.all(['/generate', '/generate/:league'], async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin && ! req.session.is_combines_admin_2s ) {
		return res.redirect('/');
	}

	const league = req.params.league ? parseInt(req.params.league) : 3;
	const TEAM_SIZE = league === 2 ? 4 : 6;
	const SEASON = league === 2 ? res.locals.combines_2s.season : res.locals.combines.season;

	console.log('GENERATING TEAMS FOR ', league, `size: ${TEAM_SIZE}, SEASON: ${SEASON}`);

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

	const used = {};
	const lobby_query = `SELECT id,lobby_user FROM combine_matches WHERE league = ? AND completed != 1 and cancelled != 1`;
	const [lobs] = await db.query(lobby_query, [league]);
	if ( lobs && lobs.length ) {
		for ( let i = 0; i < lobs.length; ++i ) {
			used[lobs[i].lobby_user] = lobs[i].id;
		}
	}

	const players_query = `
		select 
			s.id, s.rsc_id, s.discord_id, s.signup_dtg, 
			s.current_mmr, s.active, s.rostered, 
			t.name
		from combine_signups as s 
		left join tiermaker as t 
			on s.rsc_id = t.rsc_id AND t.league = ? AND t.season = ?
		where 
			s.league = ? AND 
			s.signup_dtg > date_sub(now(), interval 1 day) and 
			s.active = 1 and 
			s.rostered = 0
		order by s.current_mmr asc
	`;

	const [results] = await db.execute(players_query, [league, SEASON, league]);

	//console.log('FUCKED MATH', results.length);

	if ( results && results.length ) {
		if ( results.length % TEAM_SIZE !== 0 ) {
			if ( league === 2 ) {
				return res.redirect('/combines/process_2s?error=CountMisMatch');
			} else {
				return res.redirect('/combines/process?error=CountMisMatch');
			}
		}

		const num_lobbies = results.length / TEAM_SIZE;

		const lobbies = [];
		for ( let i = 0; i < num_lobbies; ++i ) {
			// snake-draft by MMR for balanced teams
			const home_players = [];
			const away_players = [];

			//
			if ( league === 3 ) {
				home_players.push(results.pop()); // 1st player
				away_players.push(results.pop()); // 2nd player
				away_players.push(results.pop()); // 3rd player
				home_players.push(results.pop()); // 4th player
				home_players.push(results.pop()); // 5th player
				away_players.push(results.pop()); // 6th player
			} else if ( league === 2 ) {
				home_players.push(results.pop()); // 1st player
				away_players.push(results.pop()); // 2nd player
				away_players.push(results.pop()); // 3rd player
				home_players.push(results.pop()); // 4th player
			}

			const lobby = {
				season: SEASON,
				league: league,
				username: get_rand_word(home_players[0].id),
				password: get_rand_word(),
				home: { players: home_players, mmr: 0, },
				away: { players: away_players, mmr: 0, },
			};

			//console.log(lobby.home.players, lobby.away.players);
	
			lobby.home.mmr = calculate_mmrs(lobby.home.players);
			lobby.away.mmr = calculate_mmrs(lobby.away.players);
			lobby.home.delta = lobby.home.mmr - lobby.away.mmr;
			lobby.away.delta = lobby.away.mmr - lobby.home.mmr;

			console.log(lobby);

			await make_lobby(db, lobby);

			lobbies.push(lobby);
		}

		// mark everyone as rostered 
		const rostered_query = `
			UPDATE combine_signups 
			SET 
				rostered = 1 AND league = ?
			WHERE active = 1 AND rostered = 0
		`;
		await db.execute(rostered_query, [league]);

		await notify_bot(db, league, SEASON);

		await db.end();

		if ( league === 2 ) {
			return res.redirect('/combines/process_2s?success');
		} else {
			return res.redirect('/combines/process?success');
		}
	} else {
		if ( league === 2 ) {
			return res.redirect('/combines/process_2s?error=CountMisMatch2');
		} else {
			return res.redirect('/combines/process?error=CountMisMatch2');
		}
	}
});

router.all(['/activate/:rsc_id', '/activate/:rsc_id/:league'], (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 
	
	const single_where = req.params.rsc_id !== 'all' ? "rsc_id = ? AND" : '';

	const league = req.params.league ? parseInt(req.params.league) : 3;

	const query = `
		UPDATE combine_signups SET 
			active = 1
		WHERE 
			${single_where}
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			league = ? AND
			active = 0 AND
			rostered = 0
	`;
	
	if ( req.params.rsc_id !== 'all' ) {
		req.db.query(query, [ req.params.rsc_id, league ], (err,results) => {
			if ( err ) { throw err; }

			if ( league === 2 ) {
				return res.redirect('/combines/process_2s');
			} else {
				return res.redirect('/combines/process');
			}
		});
	} else {
		req.db.query(query, [ league ], (err,results) => {
			if ( err ) { throw err; }

			if ( league === 2 ) {
				return res.redirect('/combines/process_2s');
			} else {
				return res.redirect('/combines/process');
			}
		});
	}
});

router.all(['/deactivate-last/:amount', '/deactivate-last/:amount/:league'], (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 
	

	const query = `
		UPDATE combine_signups SET 
			active = 0
		WHERE 
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 1 AND league = ? AND
			rostered = 0
		ORDER BY signup_dtg DESC 
		LIMIT ?
	`;
	if ( ! req.params.amount || ! parseInt(req.params.amount) ) {
		console.log('WTF?', parseInt(req.params.amount) );
		return res.redirect('/combines/process');
	}

	const league = req.params.league ? parseInt(req.params.league) : 3;

	console.log(`DEACTIVATE LAST`, req.params.amount, league);

	//return res.json({query: query, amount: parseInt(req.params.amount)});	
	req.db.query(query, [ league, parseInt(req.params.amount) ], (err,results) => {
		if ( err ) { throw err; }

		if ( league === 2 ) {
			return res.redirect('/combines/process_2s');
		} else {
			return res.redirect('/combines/process');
		}
	});
});


router.all(['/deactivate/:rsc_id', '/deactivate/:rsc_id/:league'], (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 
	
	const league = req.params.league ? parseInt(req.params.league) : 3;
	
	const single_where = req.params.rsc_id !== 'all' ? "rsc_id = ? AND" : '';
	const query = `
		UPDATE combine_signups SET 
			active = 0
		WHERE 
			${single_where}
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			league = ? AND
			active = 1 AND
			rostered = 0
	`;
	
	if ( req.params.rsc_id !== 'all' ) {
		req.db.query(query, [ req.params.rsc_id, league ], (err,results) => {
			if ( err ) { throw err; }

			if ( league === 2 ) {
				return res.redirect('/combines/process_2s');
			} else {
				return res.redirect('/combines/process');
			}
		});
	} else {
		req.db.query(query, (err,results) => {
			if ( err ) { throw err; }

			if ( league === 2 ) {
				return res.redirect('/combines/process_2s');
			} else {
				return res.redirect('/combines/process');
			}
		});
	}
});

router.get(['/history', '/history/:league'], (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 

	const league = req.params.league ? parseInt(req.params.league) : 3;
	const season = league === 3 ? res.locals.combines.season : res.locals.combines_2s.season;

	let csv = false;
	if ( req.query.csv ) {
		csv = true;
	}

	const cols = {
		'rsc_id': 't.rsc_id',
		'name': 't.name',
		'tier': 't.tier',
		'base_mmr': 't.base_mmr',
		'effective_mmr': 't.effective_mmr',
		'current_mmr': 't.current_mmr',
		'count': 't.count',
		'keeper': 't.keeper',
		'wins': 't.wins',
		'losses': 't.losses',
		'win_percentage': 't.wins / (t.wins + t.losses)',
		'mmr_delta': '(cast(t.current_mmr as signed) - cast(t.effective_mmr as signed))',
	};
	let order = 't.current_mmr';
	let dir = 'DESC';
	if ( req.query.order && req.query.order in cols ) {
		console.log('ORDER', req.query.order, cols[req.query.order]);
		order = cols[req.query.order];
	}
	if ( req.query.dir ) {
		console.log('DIR', req.query.dir);
		if ( req.query.dir === 'DESC' ) {
			dir = 'ASC';
		} else {
			if ( order === 't.wins' ) {
				order = 't.losses';
				dir = 'ASC';
			} else {
				dir = 'DESC';
			}
		}
	}

	let limit = 100;
	if ( req.query.limit ) {
		limit = parseInt(req.query.limit);
	}

	let page = 1;
	if ( req.query.page ) {
		page = parseInt(req.query.page);
	}
	let page_offset = (page - 1) * limit;

	if ( csv ) { 
		limit = 2000;
		page = 1;
		page_offset = 0;
	}

	let visibility = 'all';
	let and_where = ``;
	if ( req.query.visibility ) {
		visibility = req.query.visibility;
		if ( visibility === 'none' ) {
			and_where = ` AND (t.wins = 0 AND t.losses = 0)`;
		} else if ( visibility === 'played' ) {
			and_where = ` AND (t.wins > 0 OR t.losses > 0)`;
		}
	}

	res.locals.title = `Combine History - ${res.locals.title}`;


	const players_query = `
		SELECT 
			t.id, t.rsc_id, t.name, t.tier, t.base_mmr, t.effective_mmr, t.current_mmr, 
			t.count, t.keeper, t.wins, t.losses
		FROM tiermaker AS t 
		WHERE t.season = ? AND t.league = ? ${and_where}
		ORDER BY ${order} ${dir}
		LIMIT ${limit}
		OFFSET ${page_offset}
	`;
	const players = {};

	req.db.query(players_query, [ season, league ], (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const p = results[i];
				
				const total_games = p.wins + p.losses;
				players[p.rsc_id] = {
					'num': i + 1,
					'rsc_id': p.rsc_id,
					'name': p.name, 
					'tier': p.tier,
					'base_mmr': p.base_mmr,
					'effective_mmr': p.effective_mmr,
					'current_mmr': p.current_mmr,
					'combines_tier': getTierFromMMR(p.current_mmr),
					'count': p.count,
					'keeper': p.keeper,
					'wins': p.wins,
					'losses': p.losses,
					'win_percentage': total_games > 0 ? parseFloat((p.wins / total_games) * 100).toFixed(1) : 0,
					'games': total_games,
				};
				players[p.rsc_id].mmr_delta = p.current_mmr - p.effective_mmr;
			}
		}
	
		const count_query = `
			SELECT 
				count(*) AS total
			FROM tiermaker AS t 
			WHERE t.season = ? AND t.league = ? ${and_where}
			ORDER BY ${order} ${dir}
		`;
		console.log(and_where);
		req.db.query(count_query, [ season, league ], (err, results) => {
			if ( err ) { throw err; }

			if ( results && results.length ) {
				const total = results[0].total;

					if ( csv ) {
						/* CSV Output if ?csv=true is sent */
						res.header('Content-type', 'text/csv');
						res.attachment(`S${res.locals.combines.season} Combines.csv`);
						const columns = [
							'RSC ID', 'Player Name', 'Initial Tier', 
							'Base MMR', 'Effective MMR', 'Δ', 'Combines MMR',
							'Combine Tier', 'Wins', 'Losses', 'Games', 'Win %',
						];
						const stringifier = stringify({ header: true, columns: columns });
						stringifier.pipe(res);
						for ( const rsc_id in players ) {
							const p = players[rsc_id];
							stringifier.write([
								rsc_id, p.name, p.tier, 
								p.base_mmr, p.effective_mmr, p.mmr_delta, p.current_mmr,
								p.combines_tier, p.wins, p.losses, p.games, p.win_percentage,
							]);
						}
						stringifier.end();
					} else {

					res.render('history_combine', {
						order: req.query.order ? req.query.order : 'current_mmr',
						dir: dir,
						players: players,
						limit: limit,
						page: page,
						page_offset: page_offset,
						total: total,
						visibility: visibility,
						players_query: players_query,
					});
				}
			}
		});
	});
});

// 2s league history
router.get('/history_2s', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin_2s ) {
		return res.redirect('/');
	} 

	let csv = false;
	if ( req.query.csv ) {
		csv = true;
	}

	const cols = {
		'rsc_id': 't.rsc_id',
		'name': 't.name',
		'tier': 't.tier',
		'base_mmr': 't.base_mmr',
		'effective_mmr': 't.effective_mmr',
		'current_mmr': 't.current_mmr',
		'count': 't.count',
		'keeper': 't.keeper',
		'wins': 't.wins',
		'losses': 't.losses',
		'win_percentage': 't.wins / (t.wins + t.losses)',
		'mmr_delta': '(cast(t.current_mmr as signed) - cast(t.effective_mmr as signed))',
	};
	let order = 't.current_mmr';
	let dir = 'DESC';
	if ( req.query.order && req.query.order in cols ) {
		console.log('ORDER', req.query.order, cols[req.query.order]);
		order = cols[req.query.order];
	}
	if ( req.query.dir ) {
		console.log('DIR', req.query.dir);
		if ( req.query.dir === 'DESC' ) {
			dir = 'ASC';
		} else {
			if ( order === 't.wins' ) {
				order = 't.losses';
				dir = 'ASC';
			} else {
				dir = 'DESC';
			}
		}
	}

	let limit = 100;
	if ( req.query.limit ) {
		limit = parseInt(req.query.limit);
	}

	let page = 1;
	if ( req.query.page ) {
		page = parseInt(req.query.page);
	}
	let page_offset = (page - 1) * limit;

	if ( csv ) { 
		limit = 2000;
		page = 1;
		page_offset = 0;
	}

	let visibility = 'all';
	let and_where = ``;
	if ( req.query.visibility ) {
		visibility = req.query.visibility;
		if ( visibility === 'none' ) {
			and_where = ` AND (t.wins = 0 AND t.losses = 0)`;
		} else if ( visibility === 'played' ) {
			and_where = ` AND (t.wins > 0 OR t.losses > 0)`;
		}
	}

	res.locals.title = `Combine History - ${res.locals.title}`;


	const players_query = `
		SELECT 
			t.id, t.rsc_id, t.name, t.tier, t.base_mmr, t.effective_mmr, t.current_mmr, 
			t.count, t.keeper, t.wins, t.losses
		FROM tiermaker AS t 
		WHERE t.season = ? AND t.league = 2 ${and_where}
		ORDER BY ${order} ${dir}
		LIMIT ${limit}
		OFFSET ${page_offset}
	`;
	const players = {};
	req.db.query(players_query, [ res.locals.combines.season ], (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const p = results[i];
				
				const total_games = p.wins + p.losses;
				players[p.rsc_id] = {
					'num': i + 1,
					'rsc_id': p.rsc_id,
					'name': p.name, 
					'tier': p.tier,
					'base_mmr': p.base_mmr,
					'effective_mmr': p.effective_mmr,
					'current_mmr': p.current_mmr,
					'combines_tier': getTierFromMMR(p.current_mmr),
					'count': p.count,
					'keeper': p.keeper,
					'wins': p.wins,
					'losses': p.losses,
					'win_percentage': total_games > 0 ? parseFloat((p.wins / total_games) * 100).toFixed(1) : 0,
					'games': total_games,
				};
				players[p.rsc_id].mmr_delta = p.current_mmr - p.effective_mmr;
			}
		}
	
		const count_query = `
			SELECT 
				count(*) AS total
			FROM tiermaker AS t 
			WHERE t.season = ? AND t.league = 2 ${and_where}
			ORDER BY ${order} ${dir}
		`;
		console.log(and_where);
		req.db.query(count_query, [ res.locals.combines.season ], (err, results) => {
			if ( err ) { throw err; }

			if ( results && results.length ) {
				const total = results[0].total;

					if ( csv ) {
						/* CSV Output if ?csv=true is sent */
						res.header('Content-type', 'text/csv');
						res.attachment(`S${res.locals.combines.season} Combines.csv`);
						const columns = [
							'RSC ID', 'Player Name', 'Initial Tier', 
							'Base MMR', 'Effective MMR', 'Δ', 'Combines MMR',
							'Combine Tier', 'Wins', 'Losses', 'Games', 'Win %',
						];
						const stringifier = stringify({ header: true, columns: columns });
						stringifier.pipe(res);
						for ( const rsc_id in players ) {
							const p = players[rsc_id];
							stringifier.write([
								rsc_id, p.name, p.tier, 
								p.base_mmr, p.effective_mmr, p.mmr_delta, p.current_mmr,
								p.combines_tier, p.wins, p.losses, p.games, p.win_percentage,
							]);
						}
						stringifier.end();
					} else {

					res.render('history_combine_2s', {
						order: req.query.order ? req.query.order : 'current_mmr',
						dir: dir,
						players: players,
						limit: limit,
						page: page,
						page_offset: page_offset,
						total: total,
						visibility: visibility,
						players_query: players_query,
					});
				}
			}
		});
	});
});

router.get('/process', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Combine Maker - ${res.locals.title}`;

	const players_query = `
		SELECT 
			t.id, t.rsc_id, t.name, t.tier, t.effective_mmr, t.current_mmr, 
			t.count, t.keeper, t.wins, t.losses
		FROM tiermaker AS t 
		WHERE t.season = ? AND t.league = 3
	`;
	const players = {};
	req.db.query(players_query, [ res.locals.combines.season ], (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const p = results[i];

				players[p.rsc_id] = {
					'rsc_id': p.rsc_id,
					'name': p.name, 
					'tier': p.tier,
					'effective_mmr': p.effective_mmr,
					'current_mmr': p.current_mmr,
					'count': p.count,
					'keeper': p.keeper,
					'wins': p.wins,
					'losses': p.losses,
					'games': p.wins + p.losses,
				};
			}
		}
	
		const signups_query = `
			SELECT 
				s.id, s.rsc_id, s.discord_id, s.signup_dtg, 
				s.current_mmr, s.active, s.rostered
			FROM combine_signups AS s 
			WHERE 
				s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
				s.rostered = 0 AND s.league = 3
			ORDER BY s.current_mmr DESC
		`;
		const signups = {
			'games': [],
			'active': {},
			'waiting': {},
		};
		req.db.query(signups_query, (err, results) => {
			if ( err ) { throw err; }

			if ( results.length ) {
				for ( let i = 0; i < results.length; ++i ) {
					const s = results[i];
					//console.log(s);
					const p = players[s.rsc_id];

					if ( ! p || ! s ) {
						console.log('p does not exist', s.rsc_id);
					} else {

						if ( ! s.signup_dtg ) {
							console.log('ERRRROORRRR', s);
						}
						p.signup_dtg = s.signup_dtg;
						p.win_percentage = p.games ? 
							parseFloat(((p.wins / p.games) * 100).toFixed(1)) : 
							0;
						p.mmr_delta = s.current_mmr - p.effective_mmr;

						if ( s.active ) {
							signups.active[s.rsc_id] = p;
						} else {
							signups.waiting[s.rsc_id] = p;
						}
					}
				}
			}

			const active_query = `
				SELECT 
					id,lobby_user,lobby_pass,home_mmr 
				FROM combine_matches 
				WHERE completed = 0 AND cancelled = 0 AND league = 3`;
			req.db.query(active_query, (err, results) => {
				if ( err ) { throw err; }

				let games = [];
				if ( results.length ) {
					games = results;
				}

				res.render('process_combine', {
					signups: signups,
					games: games,
					getTierFromMMR: getTierFromMMR,
				});
			});
		});
	});
});
router.get('/process_2s', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin_2s ) {
		return res.redirect('/');
	} 

	res.locals.title = `2s Combine Maker - ${res.locals.title}`;

	const players_query = `
		SELECT 
			t.id, t.rsc_id, t.name, t.tier, t.effective_mmr, t.current_mmr, 
			t.count, t.keeper, t.wins, t.losses
		FROM tiermaker AS t 
		WHERE t.season = ? AND t.league = 2
	`;
	const players = {};
	req.db.query(players_query, [ res.locals.combines_2s.season ], (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const p = results[i];

				players[p.rsc_id] = {
					'rsc_id': p.rsc_id,
					'name': p.name, 
					'tier': p.tier,
					'effective_mmr': p.effective_mmr,
					'current_mmr': p.current_mmr,
					'count': p.count,
					'keeper': p.keeper,
					'wins': p.wins,
					'losses': p.losses,
					'games': p.wins + p.losses,
				};
			}
		}
	
		const signups_query = `
			SELECT 
				s.id, s.rsc_id, s.discord_id, s.signup_dtg, 
				s.current_mmr, s.active, s.rostered
			FROM combine_signups AS s 
			WHERE 
				s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
				s.rostered = 0 AND s.league = 2
			ORDER BY s.current_mmr DESC
		`;
		const signups = {
			'games': [],
			'active': {},
			'waiting': {},
		};
		req.db.query(signups_query, (err, results) => {
			if ( err ) { throw err; }

			if ( results.length ) {
				for ( let i = 0; i < results.length; ++i ) {
					const s = results[i];
					const p = players[s.rsc_id];
					if ( ! p || ! s ) {
						console.log('p does not exist', s.rsc_id);
					} else {
						//console.log(s,p);
						p.signup_dtg = s.signup_dtg;
						p.win_percentage = p.games ? 
							parseFloat(((p.wins / p.games) * 100).toFixed(1)) : 
							0;
						p.mmr_delta = s.current_mmr - p.effective_mmr;

						if ( s.active ) {
							signups.active[s.rsc_id] = p;
						} else {
							signups.waiting[s.rsc_id] = p;
						}
					}
				}
			}

			const active_query = `
				SELECT 
					id,lobby_user,lobby_pass,home_mmr 
				FROM combine_matches 
				WHERE completed = 0 AND cancelled = 0 AND league = 2`;
			req.db.query(active_query, (err, results) => {
				if ( err ) { throw err; }

				let games = [];
				if ( results.length ) {
					games = results;
				}

				res.render('process_combine_2s', {
					signups: signups,
					games: games,
					getTierFromMMR: getTierFromMMR,
				});
			});
		});
	});
});

router.get(['/process/waiting', '/process/waiting/:league'], (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 

	const league = req.params.league ? parseInt(req.params.league) : 3;

	const players_query = `
		SELECT 
			t.id, t.rsc_id, t.name, t.tier, t.effective_mmr, t.current_mmr, 
			t.count, t.keeper, t.wins, t.losses
		FROM tiermaker AS t 
		WHERE t.season = ? AND t.league = ?
	`;
	const players = {};
	req.db.query(players_query, [ res.locals.combines.season, league ], (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const p = results[i];

				players[p.rsc_id] = {
					'rsc_id': p.rsc_id,
					'name': p.name, 
					'tier': p.tier,
					'effective_mmr': p.effective_mmr,
					'current_mmr': p.current_mmr,
					'count': p.count,
					'keeper': p.keeper,
					'wins': p.wins,
					'losses': p.losses,
					'games': p.wins + p.losses,
				};
			}
		}
	
		const signups_query = `
			SELECT 
				s.id, s.rsc_id, s.discord_id, s.signup_dtg, 
				s.current_mmr, s.active, s.rostered
			FROM combine_signups AS s 
			WHERE 
				s.league = ? AND
				s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
				s.rostered = 0 AND active = 0
			ORDER BY s.current_mmr DESC
		`;
		const signups = {
			'games': [],
			'active': {},
			'waiting': {},
		};
		req.db.query(signups_query, [ league ], (err, results) => {
			if ( err ) { throw err; }

			if ( results.length ) {
				for ( let i = 0; i < results.length; ++i ) {
					const s = results[i];
					const p = players[s.rsc_id];
					//console.log(s,p);
					p.signup_dtg = s.signup_dtg;
					p.win_percentage = p.games ? 
						parseFloat(((p.wins / p.games) * 100).toFixed(1)) : 
						0;
					p.mmr_delta = s.current_mmr - p.effective_mmr;

					if ( s.active ) {
						signups.active[s.rsc_id] = p;
					} else {
						signups.waiting[s.rsc_id] = p;
					}
				}
			}

			res.render('partials/combines/waiting', {
				league: league,
				waiting_room: signups.waiting,
				getTierFromMMR: getTierFromMMR,
			});
		});
	});
});

router.get('/active', async (req, res) => {
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

	const active_query = `
		SELECT 
			id,lobby_user,lobby_pass,home_wins,away_wins,
			reported_rsc_id,confirmed_rsc_id,
			completed,cancelled 
		FROM combine_matches 
		WHERE completed = 0
	`;
	const [results] = await db.query(active_query);
	const games = {};
	const game_ids = [];
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			game_ids.push(results[i].id);
			const game = results[i];
			game.home = [];
			game.away = [];
			games[results[i].id] = game;
		}
	}

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

	db.end();

	res.json(games);
});

router.get('/manage', (req, res) => { 
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Manage Combines - ${res.locals.title}`;

	const counts_query = `
		SELECT 
			count(*) AS count,tier 
		FROM tiermaker 
		WHERE 
			season = ? AND league = 3
		GROUP BY tier 
		ORDER BY tier`;
	req.db.query(counts_query, [res.locals.combines.season], (err, results) => {
		if ( err ) { throw err; }

		// hardcoded tier names so we can get correct sort order.
		const tiers = {
			'all': 0,
			'Premier': 0,
			'Master': 0,
			'Elite': 0,
			'Veteran': 0,
			'Rival': 0,
			'Challenger': 0,
			'Prospect': 0,
			'Contender': 0,
			'Amateur': 0,
		};
		for ( let i = 0; i < results.length; i++ ) {
			tiers[ results[i]['tier'] ] += results[i]['count'];
			tiers['all'] += results[i]['count'];
		}

		const settings_query = `
		SELECT 
			id,season,active,live,tiermaker_url,
			k_factor,min_series
		FROM 
			combine_settings 
		WHERE league = 3
		ORDER by id DESC 
		LIMIT 1
		`;
		req.db.query(settings_query, (err, results) => { 
			if (err) { throw err; }
			if ( results && results.length ) {
				const tiermaker_sheet_id = results[0].tiermaker_url.split('/')[5];
				res.render('manage_combines', {
					tiers: tiers,
					combines: results[0],
					tiermaker_sheet_id: tiermaker_sheet_id,
				});
			} else { 
				res.render('manage_combines', {
					tiers: tiers,
					combines: res.locals.combines,
					tiermaker_sheet_id: '',
				});
			}
		});
	});
});

router.get('/manage_2s', (req, res) => { 
	if ( ! req.session.is_admin && ! req.session.is_combines_admin_2s ) {
		return res.redirect('/');
	} 

	res.locals.title = `Manage 2s Combines - ${res.locals.title}`;

	const counts_query = `
		SELECT 
			count(*) AS count,tier 
		FROM tiermaker 
		WHERE 
			season = ? AND league = 2
		GROUP BY tier 
		ORDER BY tier`;
	req.db.query(counts_query, [res.locals.combines_2s.season], (err, results) => {
		if ( err ) { throw err; }

		// hardcoded tier names so we can get correct sort order.
		const tiers = {
			'all': 0,
			'Premier': 0,
			'Master': 0,
			'Elite': 0,
			'Veteran': 0,
			'Rival': 0,
			'Challenger': 0,
			'Prospect': 0,
			'Contender': 0,
			'Amateur': 0,
		};
		for ( let i = 0; i < results.length; i++ ) {
			tiers[ results[i]['tier'] ] += results[i]['count'];
			tiers['all'] += results[i]['count'];
		}

		const settings_query = `
		SELECT 
			id,season,active,live,tiermaker_url,
			k_factor,min_series
		FROM 
			combine_settings 
		WHERE league = 2
		ORDER by id DESC 
		LIMIT 1
		`;
		req.db.query(settings_query, (err, results) => { 
			if (err) { throw err; }
			if ( results && results.length ) {
				const tiermaker_sheet_id = results[0].tiermaker_url.split('/')[5];
				res.render('manage_combines_2s', {
					tiers: tiers,
					combines_2s: results[0],
					tiermaker_sheet_id: tiermaker_sheet_id,
				});
			} else { 
				res.render('manage_combines_2s', {
					tiers: tiers,
					combines_2s: res.locals.combines_2s,
					tiermaker_sheet_id: '',
				});
			}
		});

	});

});

router.post('/manage', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 

	const active = "active" in req.body ? 1 : 0;
	const live   = "live" in req.body ? 1 : 0;

	const settings_query = `
	INSERT INTO combine_settings
		(season, league, active, live, tiermaker_url, k_factor, min_series)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	req.db.query(
		settings_query,
		[
			req.body.season, 3, active, live, req.body.tiermaker_url, 
			req.body.k_factor, req.body.min_series
		],
		(err) => {
			if ( err ) { throw err; }
			res.redirect('/combines/manage');
		}
	);
});

router.post('/manage_2s', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin_2s ) {
		return res.redirect('/');
	} 

	const active = "active" in req.body ? 1 : 0;
	const live   = "live" in req.body ? 1 : 0;

	const settings_query = `
	INSERT INTO combine_settings
		(season, league, active, live, tiermaker_url, k_factor, min_series)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	req.db.query(
		settings_query,
		[
			req.body.season, 2, active, live, req.body.tiermaker_url, 
			req.body.k_factor, req.body.min_series
		],
		(err) => {
			if ( err ) { throw err; }
			res.redirect('/combines/manage_2s');
		}
	);
});

router.get(['/setup', '/setup/:league'], async (req, res) => {
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

	const league = req.params.league ? parseInt(req.params.league) : 3;
	const season = league === 3 ? res.locals.combines.season : res.locals.combines_2s.season;

	const query = `
		SELECT 
			rsc_id,discord_id,season,current_mmr 
		FROM tiermaker 
		WHERE league = ? AND season = ? 
		ORDER BY rand() LIMIT 100
	`;
	const [results] = await db.execute(query, [league, season]);

	if ( results && results.length ) {
		const ins_query = 'INSERT INTO combine_signups (rsc_id,discord_id,season,league,current_mmr) values (?,?,?,?,?)';
		const players = [];
		for ( let i = 0; i < results.length; ++i ) {
			const [result] = await db.query(ins_query, [
				results[i].rsc_id,
				results[i].discord_id,
				results[i].season,
				league,
				results[i].current_mmr,
			]);
		}
	}

	db.end();

	if ( league === 2 ) {
		res.redirect('/combines/process_2s');
	} else {
		res.redirect('/combines/process');
	}
});

async function get_rsc_discord_map() {
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

	const query = `SELECT rsc_id,discord_id FROM players`;
	const [results] = await db.query(query);
	db.end();

	const players = {};
	if ( results && results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			players[results[i].rsc_id] = results[i].discord_id;
		}
	}

	return players;
}

router.all('/import/:tiermaker_sheet_id', async (req, res) => {
	const returnUrl = req.query.return ? `/${req.query.return}` : '/manage_league';

	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
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

	const season = res.locals.combines.season;

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(req.params.tiermaker_sheet_id);
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["9 Tier"];
	const rows = await sheet.getRows();

	const discord_ids = await get_rsc_discord_map();

	const players = {};
	// add tehblister
	players['RSC000302'] = {
		'season': res.locals.combines.season,
		'discord_id': discord_ids['RSC000302'],
		'rsc_id': 'RSC000302',
		'name': 'tehblister',
		'tier': 'Veteran',
		'count': 1,
		'keeper': 1,
		'base_mmr': 1450,
		'effective_mmr': 1450,
		'current_mmr': 1450,
	};
	console.log('blister', players['RSC000302']);

	console.log('Importing tiermaker...');
	for ( let i = 0; i < rows.length; i++ ) {
		const row = rows[i];
		if ( ! row['Player Name'] || ! row['RSC ID'] ) {
			continue;
		}
		const rsc_id = row['RSC ID'];
		players[ rsc_id ] = {
			'season': res.locals.combines.season,
			'discord_id': (rsc_id in discord_ids) ? discord_ids[rsc_id] : null,
			'rsc_id': rsc_id,
			'name': row['Player Name'],
			'tier': row._rawData[4],
			'count': row['Count'],
			'keeper': row['Keeper'],
			'base_mmr': row['Base MMR'],
			'effective_mmr': row['Effective MMR'],
			'current_mmr': row['Effective MMR'],
		};
	}

	// if ( ! ( 'RSC000302' in players ) ) {
	// 	const me = 'RSC000302';
	// 	players[ me ] = {
	// 		'season': res.locals.combines.season,
	// 		'discord_id': (me in discord_ids) ? discord_ids[me] : null,
	// 		'rsc_id': me,
	// 		'name': 'tehblister',
	// 		'tier': 'Elite',
	// 		'count': 3,
	// 		'keeper': 4,
	// 		'base_mmr': 1500,
	// 		'effective_mmr': 1500,
	// 		'current_mmr': 1500,
	// 	};
	// }

	console.log(`    Found ${Object.keys(players).length} players in tier maker.`);

	const tiermaker_query = `SELECT id,rsc_id,name FROM tiermaker WHERE season = ? AND league = 3`;
	let skipped = 0;
	const updates = {};
	const [results] = await db.query(tiermaker_query, [ season ]);
	if ( results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			const row = results[i];

			if ( row['rsc_id'] in players ) {
				if ( players[row['rsc_id']].name !== row['name'] ) {
					updates[row['rsc_id']] = players[row['rsc_id']].name;
				}
				delete(players[row['rsc_id']]);
				skipped++;
			}
		}
	}
		
	const new_players = [];
	for ( const rsc_id in players ) {
		const p = players[rsc_id];
		new_players.push([
			season, 3, rsc_id, p.discord_id, p.name, p.tier, p.count, p.keeper, p.base_mmr,
			p.effective_mmr, p.current_mmr
		]);
	}
	
	const re_url = `/combines/manage?added=${new_players.length}&skipped=${skipped}&updated=${Object.keys(updates).length}`;
	if ( Object.keys(updates).length ) {
		const update_query = `
			UPDATE tiermaker 
			SET 
				name = ?
			WHERE rsc_id = ? AND season = ? AND league = 3
		`;
		for ( const rsc_id in updates ) {
			await db.query(update_query, [updates[rsc_id], rsc_id, season]);
		}
	}

	if ( new_players.length ) {
		
		const tiermaker_insert_query = `
			INSERT INTO tiermaker 
				(season,league,rsc_id,discord_id,name,tier,count,keeper,base_mmr,effective_mmr,current_mmr)
			VALUES ?
		`;
		await db.query(tiermaker_insert_query, [new_players]);

		console.log(" -------- Tiermaker Import Complete --------- ");
		console.log(`	Imported: ${new_players.length}`);
		console.log(`	Updated: ${Object.keys(updates).length}`);
		console.log(`	Skipped: ${skipped}`);
		console.log(updates);
		console.log(" -------- Tiermaker Import Complete --------- ");

		await db.end();

		res.redirect(re_url);
	} else {
		res.redirect(re_url);
	}

});

router.all('/import_2s/:tiermaker_sheet_id', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin_2s ) {
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

	const season = res.locals.combines_2s.season;

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(req.params.tiermaker_sheet_id);
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["9 Tier"];
	const rows = await sheet.getRows();

	const discord_ids = await get_rsc_discord_map();

	const players = {};
	// add tehblister
	players['RSC000302'] = {
		'season': res.locals.combines_2s.season,
		'discord_id': discord_ids['RSC000302'],
		'rsc_id': 'RSC000302',
		'name': 'tehblister',
		'tier': 'Veteran',
		'count': 1,
		'keeper': 1,
		'base_mmr': 1450,
		'effective_mmr': 1450,
		'current_mmr': 1450,
	};
	console.log('blister', players['RSC000302']);

	console.log('Importing tiermaker...');
	for ( let i = 0; i < rows.length; i++ ) {
		const row = rows[i];
		if ( ! row['Player Name'] || ! row['RSC ID'] ) {
			continue;
		}
		const rsc_id = row['RSC ID'];
		players[ rsc_id ] = {
			'season': res.locals.combines_2s.season,
			'discord_id': (rsc_id in discord_ids) ? discord_ids[rsc_id] : null,
			'rsc_id': rsc_id,
			'name': row['Player Name'],
			'tier': row._rawData[4],
			'count': row['Count'],
			'keeper': row['Keeper'],
			'base_mmr': row['Base MMR'],
			'effective_mmr': row['Effective MMR'],
			'current_mmr': row['Effective MMR'],
		};
	}

	console.log(`    Found ${Object.keys(players).length} players in tier maker.`, season);

	const tiermaker_query = `SELECT id,rsc_id,name FROM tiermaker WHERE season = ? AND league = 2`;
	let skipped = 0;
	const updates = {};
	const [results] = await db.query(tiermaker_query, [ season ]);
	if ( results.length ) {
		for ( let i = 0; i < results.length; ++i ) {
			const row = results[i];

			if ( row['rsc_id'] in players ) {
				if ( players[row['rsc_id']].name !== row['name'] ) {
					updates[row['rsc_id']] = players[row['rsc_id']].name;
				}
				delete(players[row['rsc_id']]);
				skipped++;
			}
		}
	}
		
	const new_players = [];
	for ( const rsc_id in players ) {
		const p = players[rsc_id];
		new_players.push([
			season, 2, rsc_id, p.discord_id, p.name, p.tier, p.count, p.keeper, p.base_mmr,
			p.effective_mmr, p.current_mmr
		]);
	}
	
	const re_url = `/combines/manage_2s?added=${new_players.length}&skipped=${skipped}&updated=${Object.keys(updates).length}`;
	if ( Object.keys(updates).length ) {
		const update_query = `
			UPDATE tiermaker 
			SET 
				name = ?
			WHERE rsc_id = ? AND season = ? AND league = 2
		`;
		for ( const rsc_id in updates ) {
			await db.query(update_query, [updates[rsc_id], rsc_id, season]);
		}
	}

	if ( new_players.length ) {
		
		const tiermaker_insert_query = `
			INSERT INTO tiermaker 
				(season,league,rsc_id,discord_id,name,tier,count,keeper,base_mmr,effective_mmr,current_mmr)
			VALUES ?
		`;
		await db.query(tiermaker_insert_query, [new_players]);

		console.log(" -------- Tiermaker Import Complete --------- ");
		console.log(`	Imported: ${new_players.length}`);
		console.log(`	Updated: ${Object.keys(updates).length}`);
		console.log(`	Skipped: ${skipped}`);
		console.log(updates);
		console.log(" -------- Tiermaker Import Complete --------- ");

		await db.end();

		res.redirect(re_url);
	} else {
		res.redirect(re_url);
	}

});

module.exports = router;
