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
	const match_query = `
		INSERT INTO combine_matches
			(season, lobby_user, lobby_pass, home_mmr, away_mmr)
		VALUES 
			(     ?,          ?,          ?,        ?,        ?)
	`;
	const params = [
		lobby.season,
		lobby.username,
		lobby.password,
		lobby.home.mmr,
		lobby.away.mmr,
	];
	const [results] = await db.execute(match_query, params);
	const match_id = results.insertId;

	const home = [];
	const away = [];
	for ( let i = 0; i < 3; ++i ) {
		home.push([match_id,lobby.home.players[i].rsc_id,'home',lobby.home.players[i].current_mmr]);
		away.push([match_id,lobby.away.players[i].rsc_id,'away',lobby.away.players[i].current_mmr]);
	}

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

	const home_result = scores.home / 4;
	const away_result = scores.away / 4;

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

async function notify_bot(db) {
	console.log('SENDING THE STUFF TO THE BOT');
	const games = await get_active(db);
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

async function get_active(db) {
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

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.all('/generate', async (req, res) => {
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

	const used = {};
	const lobby_query = `SELECT id,lobby_user FROM combine_matches WHERE completed != 1 and cancelled != 1`;
	const [lobs] = await db.query(lobby_query);
	if ( lobs && lobs.length ) {
		for ( let i = 0; i < lobs.length; ++i ) {
			used[lobs[i].lobby_user] = lobs[i].id;
		}
	}

	const players_query = `
		SELECT 
			s.id, s.rsc_id, s.discord_id, s.signup_dtg, 
			s.current_mmr, s.active, s.rostered, 
			t.name
		FROM combine_signups AS s 
		LEFT JOIN tiermaker AS t 
		ON s.rsc_id = t.rsc_id
		WHERE 
			s.signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			s.active = 1 AND 
			s.rostered = 0
		ORDER BY s.current_mmr ASC
	`;

	const [results] = await db.execute(players_query);

	if ( results && results.length ) {
		if ( results.length % 6 !== 0 ) {
			return res.redirect('/combines/process?error=CountMisMatch');
		}

		const num_lobbies = results.length / 6;

		const lobbies = [];
		for ( let i = 0; i < num_lobbies; ++i ) {
			// snake-draft by MMR for balanced teams
			const home_players = [];
			const away_players = [];

			//
			home_players.push(results.pop()); // 1st player
			away_players.push(results.pop()); // 2nd player
			away_players.push(results.pop()); // 3rd player
			home_players.push(results.pop());	// 4th player
			home_players.push(results.pop());	// 5th player
			away_players.push(results.pop()); // 6th player

			const lobby = {
				season: res.locals.combines.season,
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

			await make_lobby(db, lobby);

			lobbies.push(lobby);
		}

		// mark everyone as rostered 
		const rostered_query = `
			UPDATE combine_signups 
			SET rostered = 1 
			WHERE active = 1 AND rostered = 0
		`;
		await db.execute(rostered_query);

		await notify_bot(db);

		await db.end();

		return res.redirect('/combines/process?success');
	} else {
		return res.redirect('/combines/process?error=CountMisMatch2');
	}
});

router.all('/activate/:rsc_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 
	
	const single_where = req.params.rsc_id !== 'all' ? "rsc_id = ? AND" : '';
	const query = `
		UPDATE combine_signups SET 
			active = 1
		WHERE 
			${single_where}
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 0 AND
			rostered = 0
	`;
	
	if ( req.params.rsc_id !== 'all' ) {
		req.db.query(query, [ req.params.rsc_id ], (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/combines/process');
		});
	} else {
		req.db.query(query, (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/combines/process');
		});
	}
});

router.all('/deactivate-last/:amount', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 
	
	const query = `
		UPDATE combine_signups SET 
			active = 0
		WHERE 
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 1 AND
			rostered = 0
		ORDER BY signup_dtg DESC 
		LIMIT ?
	`;
	if ( ! req.params.amount || ! parseInt(req.params.amount) ) {
		console.log('WTF?', parseInt(req.params.amount) );
		return res.redirect('/combines/process');
	}
	//return res.json({query: query, amount: parseInt(req.params.amount)});	
	req.db.query(query, [ parseInt(req.params.amount) ], (err,results) => {
		if ( err ) { throw err; }

		return res.redirect('/combines/process');
	});
});


router.all('/deactivate/:rsc_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 
	
	const single_where = req.params.rsc_id !== 'all' ? "rsc_id = ? AND" : '';
	const query = `
		UPDATE combine_signups SET 
			active = 0
		WHERE 
			${single_where}
			signup_dtg > DATE_SUB(now(), INTERVAL 1 DAY) AND 
			active = 1 AND
			rostered = 0
	`;
	
	if ( req.params.rsc_id !== 'all' ) {
		req.db.query(query, [ req.params.rsc_id ], (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/combines/process');
		});
	} else {
		req.db.query(query, (err,results) => {
			if ( err ) { throw err; }

			return res.redirect('/combines/process');
		});
	}
});

router.get('/history', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
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
		WHERE t.season = ? ${and_where}
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
			WHERE t.season = ? ${and_where}
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
		WHERE t.season = ?
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
				s.rostered = 0
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

			const active_query = 'SELECT id,lobby_user,lobby_pass FROM combine_matches WHERE completed = 0';
			req.db.query(active_query, (err, results) => {
				if ( err ) { throw err; }

				let games = [];
				if ( results.length ) {
					games = results;
				}

				res.render('process_combine', {
					signups: signups,
					games: games,
				});
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
			season = ?
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

router.post('/manage', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const active = "active" in req.body ? 1 : 0;
	const live   = "live" in req.body ? 1 : 0;

	const settings_query = `
	INSERT INTO combine_settings
		(season, active, live, tiermaker_url, k_factor, min_series)
	VALUES (?, ?, ?, ?, ?, ?)
	`;
	req.db.query(
		settings_query,
		[
			req.body.season, active, live, req.body.tiermaker_url, 
			req.body.k_factor, req.body.min_series
		],
		(err) => {
			if ( err ) { throw err; }
			res.redirect('/combines/manage');
		}
	);
});

router.get('/setup', async (req, res) => {
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

	const query = 'SELECT rsc_id,discord_id,season,current_mmr FROM tiermaker ORDER BY rand() LIMIT 100';
	const [results] = await db.execute(query);

	if ( results && results.length ) {
		const ins_query = 'INSERT INTO combine_signups (rsc_id,discord_id,season,current_mmr) values (?,?,?,?)';
		const players = [];
		for ( let i = 0; i < results.length; ++i ) {
			const [result] = await db.query(ins_query, [
				results[i].rsc_id,
				results[i].discord_id,
				results[i].season,
				results[i].current_mmr,
			]);
		}
	}

	db.end();

	res.redirect('/combines/process');
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
	if ( ! req.session.is_admin && ! req.session.is_combines_admin ) {
		return res.redirect('/');
	} 

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

	const tiermaker_query = `SELECT id,rsc_id FROM tiermaker WHERE season = ?`;
	let skipped = 0;
	req.db.query(tiermaker_query, [ season ], (err, results) => {

		if ( err ) { throw err; }

		if ( results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				const row = results[i];

				if ( row['rsc_id'] in players ) {
					delete(players[row['rsc_id']]);
					skipped++;
				}
			}
		}
			
		const new_players = [];
		for ( const rsc_id in players ) {
			const p = players[rsc_id];
			new_players.push([
				season, rsc_id, p.discord_id, p.name, p.tier, p.count, p.keeper, p.base_mmr,
				p.effective_mmr, p.current_mmr
			]);
		}
		
		const re_url = `/combines/manage?added=${new_players.length}&skipped=${skipped}`;
		if ( new_players.length ) {
			
			const tiermaker_insert_query = `
				INSERT INTO tiermaker 
					(season,rsc_id,discord_id,name,tier,count,keeper,base_mmr,effective_mmr,current_mmr)
				VALUES ?
			`;
			req.db.query(tiermaker_insert_query, [new_players], (err, results) => {
				if ( err ) { throw err; }

				console.log(" -------- Tiermaker Import Complete --------- ");
				console.log(`	Imported: ${new_players.length}`);
				console.log(`	Skipped: ${skipped}`);
				console.log(" -------- Tiermaker Import Complete --------- ");
		
				res.redirect(re_url);
			});
		} else {
			res.redirect(re_url);
		}
	});

});
/*
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

router.post('/generate_team/:tier', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	// TODO (err trapping with invalid values)
	const numPlayers = req.body.player_count;
	const numTeams = numPlayers / 3;
	const tier = req.params.tier;

	const players = [];
	const teams = {};

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
	req.db.query(playersQuery, [ players ], (err, results) => {
		if ( err ) { throw err; }

		const playerList = [];
		for ( let i = 0; i < results.length; i++ ) {
			playerList.push(results[i]);
		}

		let curTeam = 1;
		let direction = 'up';

		while ( playerList.length ) {
			const player = playerList.pop();
			const mmr = player['mmr'];

			teams[tier + '_' + curTeam]['players'].push(player);
			teams[tier + '_' + curTeam]['mmr']+= mmr;

			if ( direction == 'up' ) {
				curTeam += 1;
				if ( curTeam == numTeams ) {
					direction = 'down';

					if ( playerList.length ) {
						const playerTwo = playerList.pop();
						const playerTwoMmr = playerTwo['mmr'];

						teams[tier + '_' + curTeam]['players'].push(playerTwo);
						teams[tier + '_' + curTeam]['mmr'] += playerTwoMmr;
					}
				}
			} else {
				curTeam -= 1;

				if ( curTeam == 1 ) {
					direction = 'up';

					if ( playerList.length ) {
						const playerTwo = playerList.pop();
						const playerTwoMmr = playerTwo['mmr'];

						teams[tier + '_' + curTeam]['players'].push(playerTwo);
						teams[tier + '_' + curTeam]['mmr'] += playerTwoMmr;
					}
				}
			}
		}

		// id, team_number, tier
		// ['Elite_1', 'Elite_2' ] => [ [1, 'Elite' ], [2, 'Elite'] ]
		const teamParams = Object.keys(teams).map(tierString => [ tierString.split('_')[1], tierString.split('_')[0] ] );
		const teamsQuery = 'INSERT INTO teams (team_number, tier) VALUES ?';
		req.db.query(teamsQuery, [ teamParams ], (err, results) => {
			if ( err ) { throw err; }
			console.log(results);
			let insertId = results.insertId;

			const playerParams = [];

			const matchParams = [];
			let matchInfo = [];

			for ( const team in teams ) {
				teams[ team ]['team_id'] = insertId;

				// set up match params for home team, finish it for away
				const matchDate = new Date();
				if ( teams[ team ].home ) {
					matchInfo = [
						matchDate,
						teams[ team ].season,
						teams[ team ].match_day,
						insertId,
						null,
						team,
						null
					];
				} else if ( teams[ team ].away ) {
					matchInfo[4] = insertId;
					matchInfo[6] = team;
					matchParams.push(matchInfo);
				}
				
				for ( let i = 0; i < teams[team].players.length; i++ ) {
					playerParams.push([insertId, teams[team].players[i].id ]);
				}

				// move to next team
				insertId++;
			}

			const playersQuery = 'INSERT INTO team_players (team_id, player_id) VALUES ?';
			req.db.query(playersQuery, [ playerParams ], (err, _results) => {
				if ( err ) { throw err; }

				// season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass
				const matchQuery = 'INSERT INTO matches (match_dtg, season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass) VALUES ?';
				req.db.query(matchQuery, [ matchParams ], (err, _results) => {
					if ( err ) { throw err; }

					// finally, mark all selected players as "rostered"
					const updateQuery = `
						UPDATE signups 
						SET rostered = 1 
						WHERE ( 
							DATE(signup_dtg) = CURDATE() OR 
							DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() 
						) 
						AND player_id IN (?)`;
					req.db.query(updateQuery , [players], (err, _results) => {
						if ( err ) { throw err; }

						res.redirect('/process_gameday');
					}); // final query, update players as rostered
				}); // end query to create match details
			}); // end query to insert players onto team roster
			//res.json(teams);
		}); // end query to generate team	
	}); // end query to select players from provided list.
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
	ORDER BY s.id ASC
	`; 

	req.db.query(signups_query, (err, results) => {
		if ( err ) { throw err; }

		const signups = {};
		let match_day = null;
		for ( let i = 0; i < results.length; i++ ) {
			// combine master/prem, ammy/contender
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

router.get('/import_contracts/:contract_sheet_id', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
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

	const players = {};

	console.log('Importing contracts...');

	for ( let i = 0; i < rows.length; i++ ) {
		if ( ! rows[i]['Player Name'] || ! rows[i]['RSC Unique ID'] || ! rows[i]['Discord ID'] ) {
			continue;
		}
		players[ rows[i]['RSC Unique ID'] ] = {
			'rsc_id': rows[i]['RSC Unique ID'],
			'name': rows[i]['Player Name'],
			'discord_id': rows[i]['Discord ID'],
			'active_2s': false,
			'active_3s': false,
			'status': 'Non-playing',
		};
		if ( rows[i]['3v3 Active/ Returning'] == "TRUE" ) { 
			players[ rows[i]['RSC Unique ID'] ].active_3s = true;
		}
	}

	console.log(`    Players populated...${Object.keys(players).length}`);

	const mmrSheet = doc.sheetsByTitle["Count/Keeper"];
	const mmrRows = await mmrSheet.getRows();

	for ( let i = 0; i < mmrRows.length; i++ ) {
		if ( mmrRows[i]['RSC ID'] in players ) {
			players[ mmrRows[i]['RSC ID'] ]['mmr'] = mmrRows[i]['Effective MMR'];
			players[ mmrRows[i]['RSC ID'] ]['tier'] = mmrRows[i]['Tier'];
		}
	}

	console.log(`     MMRs/tiers loaded`);

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
	
	console.log('import processing finished');
	// always add "tehblister" to the list in case he isn't playing
	// Added for development in S17 so that I could test things 
	// while non-playing.
	let tehblister_id = 'RSC000302';
	let tehblister_discord_id = '207266416355835904';
	// if ( ! (tehblister_id in players) ) {
	// 	players[tehblister_id] = {
	// 		'rsc_id': tehblister_id,
	// 		'name': 'tehblister',
	// 		'discord_id': tehblister_discord_id,
	// 		'mmr': 1550,
	// 		'tier': 'Elite',
	// 		'status': 'Free Agent',
	// 	};
	// }
	players['RSC000967'].mmr       = 1310;
	players['RSC000967'].tier      = 'Rival';
	players['RSC000967'].status    = 'Free Agent';
	players['RSC000967'].active_3s = true;

	req.db.query('TRUNCATE TABLE contracts', (err) => {
		if ( err ) {  throw err; }
		console.log('truncate table');
		
		const playersArray = [];
		for ( const rsc_id in players ) {
			const player = players[rsc_id];

			if ( ! player['tier'] ) {
				player['tier'] = 'NONE';
			}

			// discord_id, rsc_id, mmr, tier, status
			if ( player['tier'] == 'Master' ) {
				//player['tier'] = 'Premier';
			} else if ( player['tier'] == 'Amateur' ) {
				//player['tier'] = 'Contender';
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
				if (err) { writeError(err.toString()); console.log('error!', err); }
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
			const contract_sheet_id = results[0].contract_url.split('/')[5];
			res.render('manage', { tiers: tiers, settings: results[0], contract_sheet_id: contract_sheet_id });
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
*/ 

module.exports = router;
