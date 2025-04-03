const express = require('express');
const router  = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange, getTierFromMMR } = require('../mmrs');
const upload = require('./upload');

const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

const league_guild = {
	3: '395806681994493964',
	2: '809939294331994113',
};

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

function get_rand_word() {
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

function rating_delta_series(home_mmr, away_mmr, scores, k_factor=48) {
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

async function update_mmrs(db, match, k_factor=48, league, season) {
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

async function send_bot_message(league, actor, status, message_type, message, match={}) {
	console.log(`[BOT-${league}s-${status}:${match?.id || null}] ${actor.nickname} did "${message}"`);
	const guild_id = league === 2 ? league_guild[2] : league_guild[3];
	const outbound = {
		guild_id: guild_id,
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

/*******************************************************
 ********************* User Views **********************
 ******************************************************/
router.get('/combine/dashboard', (req, res) => {
	const nickname = res.locals.nickname;	
	const user = res.locals.user;	
	const checked_in = res.locals.checked_in;

	let status = null;
	if ( checked_in ) {
		status = 'waiting';
	}
	
	if ( user?.combines?.match?.id ) {
		status = 'ready';
	}
	
	res.render('partials/combines/dashboard', {
		status: status,
		user: user,
		league: '3s',
		match_id: user?.combines?.match?.id ?? null,
		getTierFromMMR: getTierFromMMR,
	});

});

router.get('/combine/matches/:rsc_id', async(req,res) => {
	const user = res.locals.user;
	const combine_season = res.locals.combines.season;
	
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
	const matches_query = `
		SELECT 
			m.id, m.match_dtg, m.season, m.lobby_user, m.lobby_pass, m.home_mmr, m.away_mmr,
			m.home_wins, m.away_wins, m.reported_rsc_id, m.confirmed_rsc_id, 
			m.completed, m.cancelled,
			t.name
		FROM combine_matches AS m 
		LEFT JOIN combine_match_players AS mp 
		ON m.id = mp.match_id
		LEFT JOIN tiermaker AS t 
		ON mp.rsc_id = t.rsc_id AND m.season = t.season 
		WHERE m.season = ? AND m.league = 3 AND mp.rsc_id = ?
		ORDER BY id DESC
	`;
	const [matches] = await db.query(matches_query, [combine_season, req.params.rsc_id ]);

	await db.end();

	if ( matches && matches.length ) {
		const name = matches[0].name;
		return res.render('combine_matches', { 
			name: name,
			rsc_id: req.params.rsc_id,
			matches: matches,
		}); 
	} else {
		console.log('HERE HERE HERE');
		return res.redirect('/');
	}
});

router.get('/combine/matches_2s/:rsc_id', async(req,res) => {
	const user = res.locals.user;
	const combine_season = res.locals.combines_2s.season;
	
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

	const matches_query = `
		SELECT 
			m.id, m.match_dtg, m.season, m.lobby_user, m.lobby_pass, m.home_mmr, m.away_mmr,
			m.home_wins, m.away_wins, m.reported_rsc_id, m.confirmed_rsc_id, 
			m.completed, m.cancelled,
			t.name
		FROM combine_matches AS m 
		LEFT JOIN combine_match_players AS mp 
		ON m.id = mp.match_id
		LEFT JOIN tiermaker AS t 
		ON mp.rsc_id = t.rsc_id AND m.season = t.season 
		WHERE m.season = ? AND m.league = 2 AND mp.rsc_id = ?
		ORDER BY id DESC
	`;
	const [matches] = await db.query(matches_query, [combine_season, req.params.rsc_id ]);

	await db.end();

	if ( matches && matches.length ) {
		const name = matches[0].name;
		return res.render('combine_matches_2s', { 
			name: name,
			rsc_id: req.params.rsc_id,
			matches: matches,
		}); 
	} else {
		return res.redirect('/');
	}
});

router.get('/mmr/:home/:away', (req, res) => {
	const home_mmr = req.params.home.split(':')[0];
	const home_wins = req.params.home.split(':')[1];
	const away_mmr = req.params.away.split(':')[0];
	const away_wins = req.params.away.split(':')[1];

	const k_factor = req.query.k_factor ?? 48;

	const delta = rating_delta_series(home_mmr, away_mmr, {
		home: home_wins,
		away: away_wins,
	}, k_factor);

	return res.json(delta);
});

router.get('/combines/matches', (req, res) => {
	if ( ! res.locals?.user?.rsc_id ) {
		return res.redirect('/');
	}

	return res.redirect('/combine/matches/' + res.locals.user.rsc_id);
});

router.get('/combines/matches_2s', (req, res) => {
	if ( ! res.locals?.user?.rsc_id ) {
		return res.redirect('/');
	}
	return res.redirect('/combine/matches_2s/' + res.locals.user.rsc_id);
});

router.post('/combine/:combine_id/upload', upload.single('replay'), async(req, res) => {
	const user = res.locals.user;
	const combine_id = req.params.combine_id;

	console.log(req.file.originalname);
	const file_name = req.file.originalname;

	try { 

	const query = `INSERT INTO combine_replays (match_id,rsc_id,replay) VALUES (?, ?, ?)`;
	req.db.query(query, [combine_id, user.rsc_id, file_name], (err, results) => {
		if ( err ) { throw err; }

		res.json({'success': true });
	});
	} catch(e) { 
		console.log('---- ERROR ERROR ERROR - Upload failed ---- ');
		console.log(` Combine ID: ${combine_id}`);

		res.json({'success': false });
	}
});

router.get('/combine/check_out/:discord_id/:league', async (req, res) => {
	if ( ! res.locals.checked_in && ! res.locals.checked_in_2s ) {
		return res.redirect('/?error=YouAreNotCheckedIn');
	}

	const league = req.params.league ? parseInt(req.params.league) : 3;
	
	const user = res.locals.user;
	const ucombines = league === 3 ? user.combines : user.combines_2s;
	const combines = league === 3 ? res.locals.combines : res.locals.combines_2s;

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
		DELETE FROM combine_signups 
		WHERE 
			season = ? AND 
			league = ? AND
			rsc_id = ? AND 
			discord_id = ? AND 
			current_mmr = ? AND
			rostered = 0
	`;
	const [inserted] = await db.query(query, [
		combines.season,
		league,
		user.rsc_id,
		user.discord_id,
		ucombines.current_mmr
	]);

	await db.end();
	const actor = {
		nickname: res.locals.user.nickname,
		discord_id: res.locals.user.discord_id,
	};
	await send_bot_message(
		league,
		actor,
		'success',
		'Checked In',
		`You are checked in. Please stay at your computer and wait for the next game to start.`,
		{}
	);

	return res.redirect(`/?success=YouAreCheckedOut_${league}s`);
});

router.get('/combine/check_in/:rsc_id/:league', async (req, res) => {
	const league = req.params.league ? parseInt(req.params.league) : 3;
	if ( league === 3 && res.locals.checked_in ) {
		return res.redirect(`/?error=YouAreAlreadyCheckedIn_${league}s`);
	} else if ( league === 2 && res.locals.checked_in_2s ) {
		return res.redirect(`/?error=YouAreAlreadyCheckedIn_${league}s`);
	}
	
	const user = res.locals.user;
	const ucombines = league === 3 ? user.combines : user.combines_2s;
	const combines = league === 3 ? res.locals.combines : res.locals.combines_2s;

	if ( ! user || ! ucombines ) {
		console.error('Missing ucombines?');
		return res.redirect('/?error=LogIn');
	}

	if ( ucombines.season !== combines.season ) {
		return res.redirect(`/?error=YouAreInTheWrongSeason_${league}s`);
	}

	if ( ! combines.live ) {
		return res.redirect(`?error=CombinesArentRunning_${league}s`);
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

	const query = `
		INSERT INTO combine_signups 
			(season,league,rsc_id,discord_id,current_mmr) 
		VALUES 
			(     ?,     ?,     ?,         ?,          ?)
	`;

	const [inserted] = await db.query(query, [
		combines.season,
		league,
		user.rsc_id,
		user.discord_id,
		ucombines.current_mmr
	]);

	const actor = {
		nickname: res.locals.user.nickname,
		discord_id: res.locals.user.discord_id,
	};
	await send_bot_message(
		league,
		actor,
		'success',
		'Checked In',
		`You are checked in. Please stay at your computer and wait for the next game to start.`,
		{}
	);
	await db.end();

	return res.redirect('/');
});

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.post(['/combine/:match_id', '/combine/:match_id/:league'], async (req, res, next) => {
	const match_id = req.params.match_id;

	const home_wins = parseInt(req.body.home_wins);
	const away_wins = parseInt(req.body.away_wins);
	
	const actor = {
		nickname: res.locals.user.nickname,
		discord_id: res.locals.user.discord_id,
	};

	const league = req.params.league ? parseInt(req.params.league) : 3;
	const SEASON = league === 3 ? res.locals.combines.season : res.locals.combines_2s.season;

	if ( 
		(home_wins < 0 || home_wins > 3) ||
		(away_wins < 0 || away_wins > 3 ) ) {
		// await send_bot_message(
		// 	actor,
		// 	'error',
		// 	'Invalid Score',
		// 	`Tried to report an invalid score of ${home_wins}-${away_wins}.`,
		// xxatch
		// );
		return res.redirect(`/combine/${match_id}/${league}?error=InvalidScore`);
	}

	if ( home_wins + away_wins != 3 ) {
		// await send_bot_message(
		// 	actor,
		// 	'error',
		// 	'Invalid Score',
		// 	`Tried to report an invalid score of ${home_wins}-${away_wins}.`,
		// 	match
		// );
		return res.redirect(`/combine/${match_id}/${league}?error=InvalidScore`);
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
		match.replays = [];
		match.players = {};
	}
			
	const players_query = `
		SELECT 
			p.id, p.rsc_id, p.team, p.start_mmr, p.end_mmr,
			t.name,t.effective_mmr,t.wins,t.losses
		FROM combine_match_players AS p
		LEFT JOIN tiermaker AS t ON p.rsc_id = t.rsc_id AND t.season = ?
		WHERE p.match_id = ?
	`;
	const [players_results] = await db.execute(players_query, [SEASON, match_id]);

	if ( players_results && players_results.length ) {
		for ( let i = 0; i < players_results.length; ++i ) {
			const p = players_results[i];
			match.players[p.rsc_id] = p;
		}
	}

	let can_save = false;
	let can_report = false;
	let can_confirm = false;

	if ( 
		req.session.is_admin || 
		(req.session.is_combines_admin && league === 3) || 
		(req.session.is_combines_admin_2s && league === 2) 
	) {
		can_save = true;
		can_report = true;
		can_confirm = true;
	} else {
		if ( my_rsc_id ) {
			if ( my_rsc_id in match.players ) {
				can_save = true;

				if ( match.players[my_rsc_id].team === 'home' ) {
					can_report = true;
				} else if ( match.players[my_rsc_id].team === 'away' ) {
					can_confirm = true;
				}
			}
		}
	}

	if ( ! can_save ) {
		await db.end();
		return res.redirect(`/combine/${match_id}/${league}?error=NotInLobby`);
	}


	if ( can_report && ! match.reported_rsc_id ) {
		if ( match.confirmed_rsc_id && (match.home_wins || match.away_wins)) {
			if ( match.home_wins !== home_wins || match.away_wins !== away_wins ) {
				await db.end();
				await send_bot_message(
					league,
					actor,
					'error',
					'Score Report Mismatch',
					`Score was ${match.home_wins}-${match.away_wins} and received ${home_wins}-${away_wins}.`,
					match
				);
				return res.redirect(`/combine/${match_id}/${league}?error=ScoreReportMismatch`);
			}
		}

		const completed = match.confirmed_rsc_id ? 1 : 0;
		
		const report_query = `
			UPDATE combine_matches 
			SET 
				home_wins = ?, 
				away_wins = ?, 
				reported_rsc_id = ?,
				completed = ?
			WHERE id = ?
		`;
		await db.execute(report_query, [home_wins, away_wins, my_rsc_id, completed, match_id]);

		if ( completed ) {	
			const delta = await update_mmrs(db, match, res.locals.combines.k_factor,league, SEASON);
			await db.end();
			await send_bot_message(
				league,
				actor,
				'success',
				'Finished Game',
				`This match is over with a score of ${home_wins}-${away_wins}. You may now queue again.`,
				match
			);
			return res.redirect(`/combine/${match_id}/${league}?finished`);
		} else {
			await db.end();
			await send_bot_message(
				league,
				actor,
				'success',
				'Reported Score',
				`${home_wins}-${away_wins}`,
				match
			);
			return res.redirect(`/combine/${match_id}/${league}?reported`);
		}
	} 

	if ( can_confirm && ! match.confirmed_rsc_id ) {
		if ( match.reported_rsc_id && (match.home_wins || match.away_wins)) {
			if ( match.home_wins !== home_wins || match.away_wins !== away_wins ) {
				await db.end();
				await send_bot_message(
					league,
					actor,
					'error',
					'Score Report Mismatch',
					`Score was ${match.home_wins}-${match.away_wins} and received ${home_wins}-${away_wins}.`,
					match
				);
				return res.redirect(`/combine/${match_id}/${league}?error=ScoreReportMismatch`);
			}
		}

		const completed = match.reported_rsc_id ? 1 : 0;
		
		const report_query = `
			UPDATE combine_matches 
			SET 
				home_wins = ?, 
				away_wins = ?, 
				confirmed_rsc_id = ?,
				completed = ?
			WHERE id = ?
		`;
		await db.execute(report_query, [home_wins, away_wins, my_rsc_id, completed, match_id]);

		if ( completed ) {	
			const delta = await update_mmrs(db, match, res.locals.combines.k_factor, league, SEASON);
			await db.end();
			await send_bot_message(
				league,
				actor,
				'success',
				'Finished Game',
				`This match is over with a score of ${home_wins}-${away_wins}. You may now queue again.`,
				match
			);
			return res.redirect(`/combine/${match_id}/${league}?finished`);
		} else {
			await db.end();
			await send_bot_message(
				league,
				actor,
				'success',
				'Reported Score',
				`${home_wins}-${away_wins}`,
				match
			);
			return res.redirect(`/combine/${match_id}/${league}?confirmed`);
		}
	}

	await db.end();
	await send_bot_message(
		league,
		actor,
		'error',
		'Game Complete',
		'This game has already ended. The score cannot be reported again.',
		match
	);
	res.redirect(`/combine/${match_id}/${league}?error=AlreadyReported`);
});

router.get(['/combine/:match_id', '/combine/:match_id/:league'], (req, res) => {
	const match_id = req.params.match_id;

	const league = req.params.league ? parseInt(req.params.league) : 3;
	const SEASON = league === 3 ? res.locals.combines.season : res.locals.combines_2s.season;
	let team_size = 3;
	if (league === 2) {
		team_size = 2;
	}

	const match_query = `
		SELECT 
			id, match_dtg, season, league, lobby_user, lobby_pass, home_mmr, away_mmr,
			home_wins, away_wins, reported_rsc_id, confirmed_rsc_id, completed, cancelled,
			home_mmr AS tier
		FROM 
			combine_matches 
		WHERE id = ?
	`;
	req.db.query(match_query, [match_id], (err, results) => {
		if (err) { throw err; }

		if ( results && results.length ) {
			const match = results[0];
			match.tier = getTierFromMMR(Math.floor(match.tier/team_size), league);

			if ( league !== match.league ) {
				return res.redirect(`/combine/${match.id}/${match.league}`);
			}
			
			match.players = {
				home: [],
				away: [],
			};

			const players_query = `
				SELECT 
					p.id, p.rsc_id, p.team, p.start_mmr, p.end_mmr,
					t.name,t.effective_mmr,t.wins,t.losses,t.tier
				FROM combine_match_players AS p
				LEFT JOIN tiermaker AS t ON p.rsc_id = t.rsc_id AND t.season = ? AND t.league = ?
				WHERE p.match_id = ?
			`;

			req.db.query(players_query, [ SEASON, league, match_id ], (err, results) => {
				if ( err ) { throw err; }

				if ( results && results.length ) {
					for ( let i = 0; i < results.length; ++i ) {
						const p = results[i];
						match.players[p.team].push(p);
					}
				}

				let success = false;
				if ('reported' in req.query ) {
					success = 'reported';
				}

				const replay_query = `
					SELECT match_id,rsc_id,replay
					FROM combine_replays 
					WHERE match_id = ?
				`;
				req.db.query(replay_query, [ match_id ], (err, results) => {
					if ( err ) { throw err; }

					match.replays = results;
					res.render('combine_match', {
						match: match,
						error: req.query.error,
						success: success,
					});
				});
			});
		}
	});
});

module.exports = router;
