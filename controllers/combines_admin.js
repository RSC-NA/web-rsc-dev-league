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

	const username_query = 'UPDATE combine_matches SET lobby_user = ? WHERE id = ?';
	await db.execute(username_query, [ `RSC${match_id}`, match_id ]);

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
			reported_rsc_id,confirmed_rsc_id,home_mmr as tier,
			completed,cancelled 
		FROM combine_matches 
		WHERE completed = 0 AND cancelled = 0
	`;
	const [results] = await db.query(active_query);
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
		select 
			s.id, s.rsc_id, s.discord_id, s.signup_dtg, 
			s.current_mmr, s.active, s.rostered, 
			t.name
		from combine_signups as s 
		left join tiermaker as t 
		on s.rsc_id = t.rsc_id
		where 
			s.signup_dtg > date_sub(now(), interval 1 day) and 
			s.active = 1 and 
			s.rostered = 0
		order by s.current_mmr asc
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
			home_players.push(results.pop()); // 4th player
			home_players.push(results.pop()); // 5th player
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

			const active_query = 'SELECT id,lobby_user,lobby_pass,home_mmr FROM combine_matches WHERE completed = 0 AND cancelled = 0';
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

	const tiermaker_query = `SELECT id,rsc_id,name FROM tiermaker WHERE season = ?`;
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
			season, rsc_id, p.discord_id, p.name, p.tier, p.count, p.keeper, p.base_mmr,
			p.effective_mmr, p.current_mmr
		]);
	}
	
	const re_url = `/combines/manage?added=${new_players.length}&skipped=${skipped}&updated=${Object.keys(updates).length}`;
	if ( Object.keys(updates).length ) {
		const update_query = `
			UPDATE tiermaker 
			SET name = ? WHERE rsc_id = ?
		`;
		for ( const rsc_id in updates ) {
			await db.query(update_query, [updates[rsc_id], rsc_id]);
		}
	}

	if ( new_players.length ) {
		
		const tiermaker_insert_query = `
			INSERT INTO tiermaker 
				(season,rsc_id,discord_id,name,tier,count,keeper,base_mmr,effective_mmr,current_mmr)
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
