const express = require('express');
const router  = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

function get_rand_word() {
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
		'reaper', 'fiero', 'iesta', 'jeep', 'wrangler', 'cake', 'tehblister',
		'treefrog', 'monty', 'tr1ppn', 'snacktime', 'nickm', 'rscbot', 'tinsel',
	];
	return words[ Math.floor(Math.random() * words.length) ];
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

async function update_mmrs(db, match) {
	const scores = { home: match.home_wins, away: match.away_wins };
	const delta = rating_delta_series(match.home_mmr, match.away_mmr, scores);

	const player_query = `
		UPDATE combine_match_players SET end_mmr = ? WHERE match_id = ? AND rsc_id =?
	`;
	const tiermaker_query = `
		UPDATE tiermaker set current_mmr = ?, wins = ?, losses = ? WHERE rsc_id = ?
	`;

	for ( const rsc_id in match.players ) {
		console.log('Updating...',rsc_id);
		const p = match.players[rsc_id];
		const new_mmr = p.start_mmr + delta[p.team].delta;
		const new_wins = p.wins + scores[p.team];
		const new_losses = p.losses + (4 - scores[p.team]);
		await db.execute(player_query, [new_mmr, match.id, rsc_id]);
		await db.execute(tiermaker_query, [new_mmr,new_wins,new_losses,rsc_id]);
	}
}

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.post('/combine/:match_id', async (req, res) => {
	const match_id = req.params.match_id;

	const home_wins = parseInt(req.body.home_wins);
	const away_wins = parseInt(req.body.away_wins);

	if ( home_wins + away_wins != 4 ) {
		res.redirect(`/combine/${match_id}?error=InvalidScore`);
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
			id, match_dtg, season, lobby_user, lobby_pass, home_mmr, away_mmr,
			home_wins, away_wins, reported_rsc_id, confirmed_rsc_id, 
			completed, cancelled 
		FROM 
			combine_matches 
		WHERE id = ?
	`;
	const [match_results] = await db.execute(match_query, [match_id]);

	let match = {};
	if ( match_results && match_results.length ) {
		match = match_results[0];
		match.players = {};
	}
			
	const players_query = `
		SELECT 
			p.id, p.rsc_id, p.team, p.start_mmr, p.end_mmr,
			t.name,t.effective_mmr,t.wins,t.losses
		FROM combine_match_players AS p
		LEFT JOIN tiermaker AS t ON p.rsc_id = t.rsc_id
		WHERE p.match_id = ?
	`;
	const [players_results] = await db.execute(players_query, [match_id]);

	if ( players_results && players_results.length ) {
		for ( let i = 0; i < players_results.length; ++i ) {
			const p = players_results[i];
			match.players[p.rsc_id] = p;
		}
	}

	let can_save = false;

	if ( req.session.is_admin || req.session.is_combines_admin ) {
		can_save = true;
	} else {
		if ( my_rsc_id ) {
			if ( my_rsc_id in match.players ) {
				can_save = true;
			}
		}
	}

	if ( ! can_save ) {
		return res.redirect(`/combine/${match_id}?error=NotInLobby`);
	}

	if ( ! match.reported_rsc_id ) {
		const report_query = `
			UPDATE combine_matches 
			SET 
				home_wins = ?, 
				away_wins = ?, 
				reported_rsc_id = ? 
			WHERE id = ?
		`;
		await db.execute(report_query, [home_wins, away_wins, my_rsc_id, match_id]);
		return res.redirect(`/combine/${match_id}?reported`);
	} else if ( ! match.confirmed_rsc_id ) {
		if ( home_wins !== match.home_wins ) {
			return res.redirect(`/combine/${match_id}?error=DifferentScore`);
		}

		const report_query = `
			UPDATE combine_matches 
			SET 
				home_wins = ?, 
				away_wins = ?, 
				confirmed_rsc_id = ?,
				completed = 1
			WHERE id = ?
		`;
		await db.execute(report_query, [home_wins, away_wins, my_rsc_id, match_id]);

		const delta = await update_mmrs(db, match);
		return res.redirect(`/combine/${match_id}?finished`);
	}

	res.redirect(`/combine/${match_id}?error=AlreadyReported`);
});

router.get('/combine/:match_id', (req, res) => {
	const match_id = req.params.match_id;

	const match_query = `
		SELECT 
			id, match_dtg, season, lobby_user, lobby_pass, home_mmr, away_mmr,
			home_wins, away_wins, reported_rsc_id, confirmed_rsc_id, completed, cancelled 
		FROM 
			combine_matches 
		WHERE id = ?
	`;
	req.db.query(match_query, [match_id], (err, results) => {
		if (err) { throw err; }

		if ( results && results.length ) {
			const match = results[0];
			
			match.players = {
				home: [],
				away: [],
			};

			const players_query = `
				SELECT 
					p.id, p.rsc_id, p.team, p.start_mmr, p.end_mmr,
					t.name,t.effective_mmr,t.wins,t.losses
				FROM combine_match_players AS p
				LEFT JOIN tiermaker AS t ON p.rsc_id = t.rsc_id
				WHERE p.match_id = ?
			`;

			req.db.query(players_query, [ match_id ], (err, results) => {
				if ( err ) { throw err; }

				if ( results && results.length ) {
					for ( let i = 0; i < results.length; ++i ) {
						const p = results[i];
						match.players[p.team].push(p);
					}
				}
				// res.json(match);
				res.render('combine_match', {match: match});
			});
		}
	});
});

module.exports = router;
