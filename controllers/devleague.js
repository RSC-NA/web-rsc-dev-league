const express = require('express');
const router = express.Router();

router.get('/championship', (req, res) => {
	const season = res.locals.settings.season;
	const query = `
		SELECT
			m.id AS m_id, m.home_team_id, m.home_wins,
			m.away_team_id, m.away_wins
		FROM matches AS m
		WHERE season = ?
	`;
	const leaderboards = {
		'PreMaster': null,
		'Elite': null,
		'Veteran': null,
		'Rival': null,
		'Challenger': null,
		'Prospect': null,
		'ContAmmy': null,
	};
	const team_wins = {};
	const team_match_map = {};
	const team_ids = [0];
	const players = {};
	req.db.query(query, [season], (err, results) => {
		if ( err ) { throw err; }

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
		req.db.query(playerQuery, [ team_ids ], (err, results) => {
			if ( err ) { throw err; }

			for ( let i = 0; i < results.length; ++i ) {
				const player = results[i];

				switch ( player.tier ) {
					case 'Premier':
					case 'Master':
						player.tier = 'PreMaster';
						break;
					case 'Contender':
					case 'Amateur':
						player.tier = 'ContAmmy';
						break;
				}

				if ( ! (player.player_id in players) ) {
					players[ player.player_id ] = {
						name: player.name,
						rsc_id: player.rsc_id,
						discord_id: player.discord_id,
						tier: player.tier,
						status: player.status,
						points: 0,
						series: 0,
						wins: 0,
					};
				}

				players[ player.player_id ].points++;
				players[ player.player_id ].series++;
				players[ player.player_id ].wins += team_wins[ player.team_id ];
				const win_points = team_wins[ player.team_id ] * .5;
				players[ player.player_id ].points += win_points;
			}
			
			const sorted_players = Object.keys(players);
			sorted_players.sort((a, b) => {
				return players[a].points - players[b].points;
			});

			while ( sorted_players.length ) {
				const p_id = sorted_players.pop();
				const player = players[ p_id ];
				if ( leaderboards[player.tier] === null ) {
					leaderboards[player.tier] = [];
				}
				if ( player.tier in leaderboards ) {
					leaderboards[player.tier].push(player);
				} else {
					console.log('wtf?', player.tier);
				}
			}
			res.render('championship', { leaderboards: leaderboards });
		});
	});
});

router.get('/check_in/:match_day', (req, res) => {
	if ( req.session.discord_id && ! req.session.checked_in && req.session.user.active_3s ) {
		// TODO(get season and match day from somewhere)
		const season = res.locals.settings.season;
		const match_day = req.params.match_day;
		const active = req.session.user['status'] == 'Free Agent' ? 1 : 0;
		const status = req.session.user['status'];
		req.db.query(
			'INSERT INTO signups (player_id, signup_dtg, season, match_day, active, status) VALUES (?, ?, ?, ?, ?, ?)',
			[ req.session.user_id, new Date(), season, match_day, active, status],
			function(err, _results) {
				if ( err ) throw err;

				req.session.checked_in = true;

				res.redirect('/');
			}
		);
	} else {	
		res.redirect('/');
	}
});

router.get('/check_out/:match_day', (req, res) => {
	if ( req.session.discord_id && req.session.checked_in ) {
		// TODO(get season and match day from somewhere)
		const match_day = req.params.match_day;
		req.db.query(
			'DELETE FROM signups WHERE player_id = ? AND match_day = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
			[ req.session.user_id, match_day ],
			function(err, _results) {
				if ( err ) throw err;

				req.session.checked_in = false;

				res.redirect('/');
			}
		);
	} else {
		res.redirect('/');
	}
});

router.get('/match', (req, res) => {
	const player_id = req.session.user_id;

	if ( ! player_id  ) {
		return res.redirect('/');
	}

	if ( ! res.locals.rostered ) {
		return res.redirect('/');
	}

	res.locals.title = 'Your Match Info - ' + res.locals.title;

	const matchQuery = `
		SELECT 
			m.id, m.season, m.match_day, m.lobby_user, m.lobby_pass, 
			tp.team_id, tp.player_id, c.name, c.mmr, c.rsc_id,
			m.home_wins, m.away_wins
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

	req.db.query(matchQuery, [ player_id, player_id ], (err, results) => {
		if ( err ) { throw err; }

		res.render('match', { 
			season: results[0].season, 
			match_day: results[0].match_day, 
			match_id: results[0].id,
			lobby_user: results[0].lobby_user, 
			lobby_pass: results[0].lobby_pass, 
			home_wins: results[0].home_wins,
			away_wins: results[0].away_wins,
			players: results,
		});
	});
});

router.post('/score/:match_id', (req, res) => {
	const home_wins = req.body.home_wins;
	const away_wins = req.body.away_wins;
	const scoreQuery = 'UPDATE matches SET home_wins = ?, away_wins = ? WHERE id = ?';
	req.db.query(scoreQuery, [ home_wins, away_wins, req.params.match_id ], (err, _results) => {
		if ( err ) { throw err; }

		return res.redirect(`/match/${req.params.match_id}`);
	});
});

router.get('/match/:match_id', (req, res) => {
	const matchQuery = `
		SELECT 
			m.id, m.season, m.match_day, m.lobby_user, m.lobby_pass, 
			tp.team_id, tp.player_id, c.name, c.mmr, c.rsc_id, c.discord_id,
			m.home_wins, m.away_wins
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
	const match_id = req.params.match_id;
	req.db.query(matchQuery, [ req.params.match_id ], (err, results) => {
		if ( err ) { throw err; }

		const scored = results[0].home_wins || results[0].away_wins ?  true : false;
		const tier = results[0].lobby_user.split('_')[0];	
		const home_team = results[0].lobby_user.split('_')[1];
		const away_team = results[0].lobby_pass.split('_')[1];
		let score_title = '';
		if ( scored ) {
			score_title = ` [Home:${results[0].home_wins}, Away:${results[0].away_wins}]`;
		}
		res.locals.title = `${tier} ${home_team}/${away_team}${score_title} (S${results[0].season}, MD${results[0].match_day}) - ${res.locals.title}`;
		res.render('match', { 
			season: results[0].season, 
			match_id: match_id,
			match_day: results[0].match_day, 
			lobby_user: results[0].lobby_user, 
			lobby_pass: results[0].lobby_pass, 
			home_wins: results[0].home_wins,
			away_wins: results[0].away_wins,
			scored: scored,
			players: results,
		});
	});

});

router.get('/matches', (req, res) => {
	res.locals.title = `Season ${res.locals.settings.season} Matches - ${res.locals.title}`;

	const matchesQuery = 'SELECT m.id,m.match_day,m.lobby_user,m.lobby_pass,t.tier FROM matches AS m LEFT JOIN teams AS t ON m.home_team_id = t.id WHERE m.season = ? ORDER BY m.match_day DESC';
	req.db.query(matchesQuery, [ res.locals.settings.season ], (err, results) => {
		if ( err ) { throw err; }

		res.render('matches', { matches: results });
	});
});

module.exports = router;
