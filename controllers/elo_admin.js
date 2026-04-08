const express = require('express');
const router  = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange_3s, _mmrRange_2s, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

let PlayerMMR = {};

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
		if ( 'season_mmr' in team[i] && team[i].season_mmr ) {
			mmr += team[i].season_mmr;
		} else if ( "mmr" in team[i] && team[i].mmr ) {
			mmr += team[i].mmr;
		}
	}

	return mmr;
}

function rating_delta_game(home_mmr, away_mmr, home_win, away_win, k_factor=12) {
	const home_win_chance = 1 / ( 1 + Math.pow(10, (away_mmr - home_mmr) / 400));
	const away_win_chance = 1 / ( 1 + Math.pow(10, (home_mmr - away_mmr) / 400));

	const home_delta = Math.round(k_factor * (home_win - home_win_chance));
	const away_delta = Math.round(k_factor * (away_win - away_win_chance));

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

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.get('/view/:season/:k_factor', async (req, res) => {
	const season = req.params.season;
	const k_factor = req.params.k_factor;

	if ( ! req.session.user.is_admin ) {
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

	let csv = false;
	if ( req.query.csv ) {
		csv = true;
	}
	let json = false;
	if ( req.query.json ) {
		json = true;
	}

	const cols = {
		'p.rsc_id': 'p.rsc_id',
		'p.name': 'p.name',
		'p.tier': 'p.tier',
		'p.start_mmr': 'p.start_mmr',
		'p.end_mmr': 'p.end_mmr',
		'p.count': 'p.count',
		'p.keeper': 'p.keeper',
		'p.wins': 'sum(p.win)',
		'losses': 'sum(p.loss)',
		'win_percentage': 'sum(p.win) / (sum(p.win) + sum(p.loss))',
		// 'mmr_delta': '(cast(p.current_mmr as signed) - cast(p.effective_mmr as signed))',
	};
	let order = 'p.rsc_id';
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
			if ( order === 'p.wins' ) {
				order = 'p.losses';
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

	if ( csv || json ) { 
		limit = 2000;
		page = 1;
		page_offset = 0;
	}

	res.locals.title = `MMR Simulation Viewer - ${res.locals.title}`;

	const players_query = `

SELECT 
	p.tier,p.rsc_id,NULL AS name,sum(p.win) AS wins, sum(p.loss) AS losses,
	0 AS start_mmr, 0 as end_mmr, 0 AS mmr_delta, sum(p.mvp) as mvps, 
	avg(p.points) as points, sum(p.goals) as goals, 
	sum(p.assists) as assists, sum(p.saves) AS saves,
	sum(p.shots) AS shots
FROM elo_players AS p 
WHERE p.season = ? AND p.k_factor = ? 
GROUP BY p.tier, p.rsc_id
ORDER BY ${order} ${dir}
LIMIT ${limit}
OFFSET ${page_offset}

	`;
console.log(players_query);	
	console.log(`LIMIT ${limit} OFFSET ${page_offset}`);

	const players = {};
	
	const [rows] = await db.query(players_query, [season, k_factor]);

	let player_list = [];

	if ( rows && rows.length ) {
		for ( let i = 0; i < rows.length; ++i ) {
			const p = rows[i];
			players[p.rsc_id] = p;
			player_list.push(p.rsc_id);
		}
	}

	const mmrs_query = `
		SELECT id,rsc_id,name,start_mmr,end_mmr 
		FROM elo_players 
		WHERE season = ? AND k_factor = ? AND rsc_id IN (?)
		ORDER BY id ASC
	`;
	const [mmrs] = await db.query(mmrs_query, [season, k_factor, player_list]);
	if ( mmrs && mmrs.length ) {
		for ( let i = 0; i < mmrs.length; ++i ) {
			const p = mmrs[i];

			if ( p.rsc_id in players ) {
				players[p.rsc_id].name = p.name;
				if ( players[p.rsc_id].start_mmr === 0 ) {
					players[p.rsc_id].start_mmr = p.start_mmr;
				} else {
					players[p.rsc_id].end_mmr = p.end_mmr;
				}
			}
		}
	}

	const count_query = `
		SELECT 
			count(*) AS total
		FROM elo_players AS p 
		WHERE p.season = ? AND p.k_factor = ? 
		GROUP BY p.tier, p.rsc_id
		ORDER BY ${order} ${dir}
	`;
	const [count_rows] = await db.query(count_query, [season, k_factor]);

	let total = 0;
	if ( count_rows && count_rows.length ) {
		total = count_rows[0].total;
	}

	await db.end();

	if ( csv ) {
		res.header('Content-type', 'text/csv');
		res.attachment(`S${season} Combines.csv`);
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
	} else if ( json ) {
		/* CSV Output if ?csv=true is sent */
		res.json(players);
	} else {
		res.render('elo_simulation', {
			season: season,
			k_factor: k_factor,
			order: req.query.order ? req.query.order : 'p.rsc_id',
			dir: dir,
			players: players,
			limit: limit,
			page: page,
			page_offset: page_offset,
			total: total,
			players_query: players_query,
		});
	}

});

router.get('/player/:season/:k_factor/:rsc_id', async (req, res) => {
	const season = req.params.season;
	const k_factor = req.params.k_factor;
	const rsc_id = req.params.rsc_id;

	if ( ! req.session.user.is_admin ) {
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

	let csv = false;
	if ( req.query.csv ) {
		csv = true;
	}
	let json = false;
	if ( req.query.json ) {
		json = true;
	}

	const player = {
		rsc_id: rsc_id,
		name: 'unknown',
		tier: 'unknown',
		start_mmr: 0,
		end_mmr: 0,
		wins: 0,
		losses: 0,
		mvps: 0,
		goals: 0,
		assists: 0,
		saves: 0,
		shots: 0,
	};


	res.locals.title = `MMR Simulation Viewer - ${rsc_id} - ${res.locals.title}`;

	const games_query = `
		SELECT game_id FROM elo_players 
		WHERE season = ? AND k_factor = ? AND rsc_id = ?
		ORDER BY id DESC
	`;
	const [game_ids] = await db.query(games_query, [season, k_factor, rsc_id]);

	const game_list = [];
	if ( game_ids && game_ids.length ) {
		for ( let i = 0; i < game_ids.length; ++i ) {
			game_list.push(game_ids[i].game_id);
		}
	}

	if ( ! game_list ) {
		await db.end();

		return res.redirect(`/elo/view/${season}/${k_factor}?error=missing-player-games`);
	}

	const game_info_query = `
		SELECT 
			g.id, g.season, g.k_factor, g.tier, g.match_day, g.game, 
			g.home, g.away, g.home_score, g.away_score, g.home_mmr,
			g.away_mmr 
		FROM elo_games AS g 
		WHERE g.id IN (?)
	`;
	const [all_games] = await db.query(game_info_query, [game_list]);

	const matches = {};
	if ( all_games ) {
		for ( let i = 0; i < all_games.length; ++i ) {
			const g = all_games[i];
			const match_key = `Match Day ${g.match_day}`;
			if ( ! ( match_key in matches ) ) {
				matches[match_key] = {
					match_day: g.match_day,
					tier: g.tier,
					home: g.home,
					away: g.away,
					home_wins: 0,
					away_wins: 0,
					games: {},
				};
			}

			if ( g.home_score > g.away_score ) {
				matches[match_key].home_wins++;
			} else {
				matches[match_key].away_wins++;
			}

			matches[match_key].games[g.id] = {
				id: g.id,
				game: g.game,
				winner: g.home_score > g.away_score ? g.home : g.away,
				home: {
					team: g.home,
					score: g.home_score,
					mmr: g.home_mmr,
					players: [],
				},
				away: {
					team: g.away,
					score: g.away_score,
					mmr: g.away_mmr,
					players: [],
				},
			};
		}
	}

	const players_query = `
		SELECT 
			g.match_day, 
			p.id, p.game_id, p.tier, p.rsc_id, p.name, p.team, 
			p.win, p.loss, p.start_mmr, p.end_mmr, p.mvp, p.points,
			p.goals, p.assists, p.saves, p.shots
		FROM elo_players AS p 
		LEFT JOIN elo_games AS g 
			ON p.game_id = g.id
		WHERE p.game_id IN (?)
	`;
	// debugging query if needed
	// const filled_q = players_query.replace('?', game_list.join(', ')).replaceAll('\t', '');
	const [all_players] = await db.query(players_query, [game_list]);

	if ( all_players ) {
		for ( let i = 0; i < all_players.length; ++i ) {
			const p = all_players[i];

			const match_key = `Match Day ${p.match_day}`;
			const m = matches[match_key];
			const team = p.team === m.home ? 'home' : 'away';
			matches[match_key].games[p.game_id][team].players.push(p);

			if ( p.rsc_id === rsc_id ) {
				player.name = p.name;
				player.tier = p.tier;
				player.wins += p.win;
				player.losses += p.loss;
				if ( player.start_mmr === 0 ) {
					player.start_mmr = p.start_mmr;
				}
				player.end_mmr = p.end_mmr;
				player.mvps += p.mvp;
				player.goals += p.goals;
				player.assists += p.assists;
				player.saves += p.saves;
				player.shots += p.shots;
			}
		}
	}

	await db.end();

	if ( json ) {
		/* CSV Output if ?csv=true is sent */
		res.json(matches);
	} else {
		res.render('elo_player', {
			season: season,
			k_factor: k_factor,
			rsc_id: rsc_id,
			matches: matches,
			player: player,
		});
	}
});



router.get('/settings', async (req, res) => {
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

	const query = `
		SELECT 
			e.id,e.season,e.k_factor,e.stats_url,e.user_id,e.created_on,
			p.nickname, p.rsc_id, p.admin, p.stats_admin 
		FROM elo_settings AS e 
		LEFT JOIN players AS p 
			ON e.user_id = p.id 
		ORDER BY e.id DESC LIMIT 50
	`;
	const [rows] = await db.query(query);

	const elo_data = {
		current: {
			season: '',
			k_factor: 12,
			stats_url: '',
		},
		all: [],
	};
	if ( rows ) {
		elo_data.current = rows[0];
		elo_data.all = rows;
	}

	await db.end();

	res.render('manage_elo', elo_data);
});

function player(p, i) {
	if ( ! p || ! ('Win' in p ) ) {
		console.error(`Missing Player:`, p, `Index: ${i}`);
	}
	const win = p['Win'] ? 1 : 0;
	const loss = p['Loss'] ? 1 : 0;
	const rsc_id = p['RSC ID'];

	let cur_mmr = 0;
	if ( rsc_id in PlayerMMR ) {
		cur_mmr = PlayerMMR[rsc_id];
	}

	const player = {
		rsc_id: p['RSC ID'],
		name: p['Name'],
		team: p['Team'],
		against: p['Team Against'],
		win: win,
		loss: loss,
		start_mmr: cur_mmr,
		delta: 0,
		end_mmr: 0,
		mvp: parseInt(p['MVP']),
		points: parseInt(p['P']),
		goals: parseInt(p['G']),
		assists: parseInt(p['A']),
		saves: parseInt(p['Sv']),
		shots: parseInt(p['Sh']),
	};

	return player;
}

async function fetch_starting_mmrs(db) {
	PlayerMMR = {};
	
	const query = `
		SELECT c.rsc_id, c.mmr 
		FROM contracts AS c
		WHERE c.mmr != 0
	`;
	const [rows] = await db.query(query);
	const player_mmrs = {};
	if ( rows ) {
		for ( let i = 0; i < rows.length; ++i ) {
			PlayerMMR[rows[i].rsc_id] = rows[i].mmr;
		}
	}
}

router.post('/generate', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	PlayerMMR = {};

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

	const season = parseInt(req.body.season);
	const k_factor = parseInt(req.body.k_factor);
	const stats_url = req.body.stats_sheet_url;
	const stat_sheet_id = req.body.stats_sheet_url.split('/')[5];
	const user_id = res.locals.user.user_id;

	const settings_query = `
		INSERT INTO elo_settings 
			(season, k_factor, stats_url, user_id) VALUES (?, ?, ?, ?)
	`;
	const [results] = await db.query(settings_query, [ season, k_factor, stats_url, user_id ]);

	await fetch_starting_mmrs(db);

	console.log(`Generating MMRs:\n - Season: ${season}\n - k_factor: ${k_factor}\n - Stat Sheet: ${stat_sheet_id}`);

	const doc = new GoogleSpreadsheet(stat_sheet_id);
	doc.useApiKey(process.env.GOOGLE_API_KEY);
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["Stats"];
	const rows = await sheet.getRows();

	if ( ! rows ) {
		return res.json({'error': 'Google sheet rows was empty. :(', });
	}

	const row_count = sheet.rowCount;
	console.log(`THIS SHEET HAS ${row_count} ROWS`);

	const game_data = {};
	let match = null;

	const games = {};

	let match_keys = {};
	const tot = rows.length;
	let do_insert = true;
	let home_two = false;
	let away_two = false;
	for ( let i = 0; i < rows.length; i += 6 ) {
		let p = rows[i];
		if ( p.Tier === 'Prospect' ) {
			continue;
		}
		let m_num = parseInt(p['Match #']);
		let game_num = parseInt(p['Game #']);
		if ( game_num === 0 ) {
			do {
				console.error('Skipping bad record', i+2, `Match #${p['Match #']}`, `Game #${game_num}`, p.Team, p.Name, p['Team Against']);
				i++;
				p = rows[i];
				m_num = parseInt(p['Match #']);
				game_num = parseInt(p['Game #']);
			} while ( game_num === 0 );
		} else if ( i === 13830 ) {
			console.error('SKIPPING THE SHITTY RECORDS', i);
			i = 13834;
			p = rows[i];
			m_num = parseInt(p['Match #']);
			game_num = parseInt(p['Game #']);
			console.error('RESUMING FROM THE SHITTY RECORDS', i);
		} else if ( i === 25352 ) {
			console.error('SKIPPING THE SHITTY RECORDS', i);
			i = 25364;
			p = rows[i];
			m_num = parseInt(p['Match #']);
			game_num = parseInt(p['Game #']);
			console.error('RESUMING FROM THE SHITTY RECORDS', i);
		} else if ( i === 13921 ) {
			console.error('SKIPPING THE SHITTY RECORDS', i);
			i = 13923;
			p = rows[i];
			m_num = parseInt(p['Match #']);
			game_num = parseInt(p['Game #']);
			console.error('RESUMING FROM THE SHITTY RECORDS', i);
		} else if ( i === 25454 ) {
			console.error('SKIPPING THE SHITTY RECORDS', i);
			i = 25455;
			p = rows[i];
			m_num = parseInt(p['Match #']);
			game_num = parseInt(p['Game #']);
			console.error('RESUMING FROM THE SHITTY RECORDS', i);
		} else if ( rows[i].Team !== rows[i+1].Team && rows[i].Team !== rows[i+2].Team ) {
				console.error(`Team 1 Error`, i+2, rows[i].Team, rows[i+1].Team, rows[i+2].Team);
				break;
		} else if ( rows[i+3].Team !== rows[i+4].Team && rows[i+3].Team !== rows[i+5].Team ) {
				console.error(`Team 2 Error`, i+5, rows[i+3].Team, rows[i+4].Team, rows[i+5].Team);
				break;
		} else if ( p['Team Against'] === 'Free Agent' ) {
			do {
				console.error('Skipping fake team', i+2, `Match #${p['Match #']}`, `Game #${game_num}`, p.Team, p.Name, p['Team Against']);
				i++;
				p = rows[i];
				m_num = parseInt(p['Match #']);
				game_num = parseInt(p['Game #']);
			} while ( p['Team Against'] === 'Free Agent' );
		} else if ( i === 25476 ) {
			console.error('SKIPPING THE SHITTY RECORDS', i);
			i = 25477;
			p = rows[i];
			m_num = parseInt(p['Match #']);
			game_num = parseInt(p['Game #']);
			console.error('RESUMING FROM THE SHITTY RECORDS', i);
		}

		if ( 
			rows[i].Team === rows[i+2].Team && 
			rows[i]['Team Against'] === rows[i+3].Team && 
			rows[i+3]['Team Against'] === rows[i].Team && 
			(m_num === parseInt(rows[i+3]['Match #'])) && 
			(game_num === parseInt(rows[i+3]['Game #'])) 
		) {
			// do nothing
		} else {
				console.error(
					`Fatal Ingestion Error`,
					i+2, '-', i+7,
					rows[i].Name, rows[i].Team, rows[i]['Team Against'],
					'against',
					rows[i+5].Name, rows[i+5].Team, rows[i+5]['Team Against'],
				);
				i = i + 3;
				console.error(`Skipping to next team`, i+3, rows[i].Team);
				continue;

		}

		console.log(i+2, p.Team, 'vs', i+5, p['Team Against'])

		const team_key = p.Team.replaceAll(' ', '_');
		const away_key = p['Team Against'].replaceAll(' ', '_');
		const match_num = `m${p['Match #']}`;

		let home_1 = player(p, i);
		let home_2 = player(rows[i+1], i+1);
		let home_3 = player(rows[i+2], i+2);

		if ( home_1.team !== home_3.team ) {
			console.error(
				'HOME TEAM DESYNC', i+2, 'home-1:', i+2, home_1.team,
				'home-3:', i+4, home_3.team
			);
			if ( home_1.against === home_3.team ) {
				home_two = true;
				home_3 = null;
			} else {
				console.log(home_1.team, 'vs', home_3.team);
				do_insert = false;
				break;
			}
		} else {
			//console.log(i, home_1.team, home_3.team);
		}

		let away_1 = player(rows[i+3], i+3);
		let away_2 = player(rows[i+4], i+4);
		let away_3 = player(rows[i+5], i+5);

		if ( away_1.team !== away_3.team ) {
			console.error(
				'AWAY TEAM DESYNC', i+2, 'away-1:', i+5, away_1.team,
				'away-3:', i+7, away_3.team
			);
			if ( away_1.against !== away_3.team ) {
				away_two = true;
				away_3 = null;
				i = i - 1;
				console.log('Next Team:', i + 8, rows[i+6].Team);
			} else {
				do_insert = false;
				break;
			}
		} else {
			//console.log(i, away_1.team, away_3.team);
		}

		if ( ! ( p.Tier in games ) ) {
			games[p.Tier] = {};
		}

		if ( ! ( match_num in games[p.Tier]) ) {
			games[p.Tier][match_num] = {};
		} 
		
		let home_score = home_1.goals ?? 0;
		home_score += home_2.goals ?? 0;
		home_score += home_3?.goals ?? 0;
		let away_score = away_1.goals ?? 0;
		away_score += away_2.goals ?? 0;
		away_score += away_3?.goals ?? 0;
		let home_mmr = home_1.start_mmr + home_2.start_mmr;
		home_mmr += home_3?.start_mmr;
		let away_mmr = away_1.start_mmr + away_2.start_mmr;
		away_mmr += away_3?.start_mmr;
		const home_players = home_two ? 2 : 3;
		const away_players = away_two ? 2 : 3;
		home_mmr = Math.floor(home_mmr / home_players);
		away_mmr = Math.floor(away_mmr / away_players);
		const home_wins = home_1.win; 
		const away_wins = away_1.win; 
		const game = {
			game: parseInt(p['Game #']),
			home_score: home_score,
			away_score: away_score,
			home_mmr: home_mmr,
			away_mmr: away_mmr,
			home: [home_1, home_2, home_3],
			away: [away_1, away_2, away_3],
		};
		const alt_game = {
			game: parseInt(p['Game #']),
			home_score: away_score,
			away_score: home_score,
			home_mmr: away_mmr,
			away_mmr: home_mmr,
			home: [away_1, away_2, away_3],
			away: [home_1, home_2, home_3],
		};
		const match = {
			tier: p.Tier,
			match: parseInt(p['Match #']),
			home: p['Team'],
			away: p['Team Against'],
			home_wins: home_wins,
			away_wins: away_wins,
			games: [],
		};
		
		// stats do not preserve sort order per match.
		// winning team is at the top, so to create a home/away 
		// storage implementation, we must have two versions of the game 
		// and swap them based on the winner
		const match_key = `${team_key}-${away_key}-${match_num}`; 
		const alt_key = `${away_key}-${team_key}-${match_num}`; 
		if ( match_key in games[p.Tier][match_num] ) {
			const deltas = rating_delta_game(home_mmr, away_mmr, home_wins, away_wins, k_factor);
			for ( let k = 0; k < 3; ++k ) {
				if ( k in game.home && game.home[k] ) {
					game.home[k].delta = deltas.home.delta;
					game.home[k].end_mmr = game.home[k].start_mmr + deltas.home.delta;
					PlayerMMR[game.home[k].rsc_id] = game.home[k].end_mmr;
				}

				if ( k in game.away && game.away[k] ) {
					game.away[k].delta = deltas.away.delta;
					game.away[k].end_mmr = game.away[k].start_mmr + deltas.away.delta;
					PlayerMMR[game.away[k].rsc_id] = game.away[k].end_mmr;
				}
			}

			games[p.Tier][match_num][match_key].games.push(game);
			games[p.Tier][match_num][match_key].home_wins += home_wins;
			games[p.Tier][match_num][match_key].away_wins += away_wins;
		} else if ( alt_key in games[p.Tier][match_num] ) {
			const deltas = rating_delta_game(away_mmr, home_mmr, away_wins, home_wins, k_factor);
			for ( let k = 0; k < 3; ++k ) {
				if ( k in game.home && game.home[k] ) {
					game.home[k].delta = deltas.home.delta;
					game.home[k].end_mmr = game.home[k].start_mmr + deltas.home.delta;
					PlayerMMR[game.home[k].rsc_id] = game.home[k].end_mmr;
				}
			
				if ( k in game.away && game.away[k] ) {
					game.away[k].delta = deltas.away.delta;
					game.away[k].end_mmr = game.away[k].start_mmr + deltas.away.delta;
					PlayerMMR[game.away[k].rsc_id] = game.away[k].end_mmr;
				}
			}

			games[p.Tier][match_num][alt_key].games.push(alt_game);
			games[p.Tier][match_num][alt_key].home_wins += away_wins;
			games[p.Tier][match_num][alt_key].away_wins += home_wins;
		} else {
			const deltas = rating_delta_game(home_mmr, away_mmr, home_wins, away_wins, k_factor);
			for ( let k = 0; k < 3; ++k ) {
				if ( k in game.home && game.home[k] ) {
					game.home[k].delta = deltas.home.delta;
					game.home[k].end_mmr = game.home[k].start_mmr + deltas.home.delta;
					PlayerMMR[game.home[k].rsc_id] = game.home[k].end_mmr;
				}
				if ( k in game.away && game.away[k] ) {
					game.away[k].delta = deltas.away.delta;
					game.away[k].end_mmr = game.away[k].start_mmr + deltas.away.delta;
					PlayerMMR[game.away[k].rsc_id] = game.away[k].end_mmr;
				}
			}
			match.games.push(game);
			games[p.Tier][match_num][match_key] = match;
		}
	}

	if ( ! do_insert ) {
		await db.end();
		return res.redirect('/elo/settings?error=stats-error');
	}

	// console.log('injest complete', Object.keys(games));

	const del_player_query = `
		DELETE FROM elo_players WHERE game_id IN (
			SELECT id FROM elo_games WHERE season = ? AND k_factor = ?
		)
	`;
	const del_games_query = `
		DELETE FROM elo_games WHERE season = ? AND k_factor = ?
	`;

	await db.query(del_player_query, [season, k_factor]);
	await db.query(del_games_query, [season, k_factor]);
	
	console.log('deletion complete');

	const ins_game_query = `
		INSERT INTO elo_games 
			(season, k_factor, tier, match_day, game, home, away, 
			home_score, away_score, home_mmr, away_mmr)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	const ins_player_query = `
		INSERT INTO elo_players 
			(
				game_id, season, k_factor, tier, rsc_id, name, team, win, loss, 
				start_mmr, end_mmr, mvp, points, goals, assists, saves, shots
			)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;

	for ( const Tier in games ) {
		//console.log(Tier);
		for ( const m in games[Tier] ) {
			//console.log(m);
			for ( const m_key in games[Tier][m] ) {
				//console.log(m_key);
				const cur_match = games[Tier][m][m_key];

				for ( let i = 0; i < cur_match.games.length; ++i ) {
					const cur_game = cur_match.games[i];

					// console.log(`inserting ${m}, game ${i+1}`);
					
					const match_data = [
						season, k_factor, Tier, cur_match.match, cur_game.game,
						cur_match.home, cur_match.away,	
						cur_game.home_score, cur_game.away_score, 
						cur_game.home_mmr, cur_game.away_mmr
					];
					//console.log(match_data);
					const [game_res] = await db.execute(ins_game_query, match_data);

					const g_id = game_res.insertId;


					for ( let j = 0; j < 3; ++j ) {
						if ( j in cur_game.home ) {
							const home_p = cur_game.home[j];
							await db.execute(ins_player_query, [
								g_id, season, k_factor, Tier, home_p.rsc_id, home_p.name, 
								home_p.team, home_p.win, home_p.loss, home_p.start_mmr, 
								home_p.end_mmr, home_p.mvp, home_p.points, home_p.goals, 
								home_p.assists, home_p.saves, home_p.shots
							]);
						}
						
						if ( j in cur_game.away ) {
							const away_p = cur_game.away[j];
							try {
								await db.execute(ins_player_query, [
									g_id, season, k_factor, Tier, away_p.rsc_id, away_p.name, 
									away_p.team, away_p.win, away_p.loss, away_p.start_mmr,
									away_p.end_mmr, away_p.mvp, away_p.points, away_p.goals,
									away_p.assists, away_p.saves, away_p.shots
								]);
							} catch(e) {
								console.error(e, away_p);
							}
						}
					}
				}
			}
			console.log(`inserting ${Tier} complete...`);
		}
	}

	/*
	for ( let i = 0; i < rows.length; i++ ) {
		const p = rows[i];
		const rsc_id = p['RSC ID'];

		if ( ! (rsc_id in players) ) {
			players[rsc_id] = {
				name: p.Name,
				tier: p.Tier,
				team: p.Team,
				wins: 0,
				loss: 0,
				goals: 0,
				assists: 0,
				shots: 0,
				saves: 0,
				mvps: 0,
			};
		}


		if ( ! ( match_key in game_data ) ) {
			game_data[match_key] = {

			}
		}
	
		if ( ! match ) {
			match = {
				key: match_key,
				games: [],
			}
		}
	}
	*/



	// close DB handle
	await db.end();

	res.render('manage_elo', {
		current: {
			stats_url: stats_url,
			k_factor: k_factor,
			season: season,
		},
		all: [],
		games: games,
	});
});

module.exports = router;
