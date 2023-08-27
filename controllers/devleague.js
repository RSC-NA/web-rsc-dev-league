const express = require('express');
const router = express.Router();

router.get('/check_in/:match_day', (req, res) => {
	if ( req.session.discord_id && ! req.session.checked_in ) {
		// TODO(get season and match day from somewhere)
		let season = res.locals.settings.season;
		let match_day = req.params.match_day;
		let active = req.session.user['status'] == 'Free Agent' ? 1 : 0;
		let status = req.session.user['status'];
		req.db.query(
			'INSERT INTO signups (player_id, signup_dtg, season, match_day, active, status) VALUES (?, ?, ?, ?, ?, ?)',
			[ req.session.user_id, new Date(), season, match_day, active, status],
			function(err, results) {
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
		let season = res.locals.settings.season;
		let match_day = req.params.match_day;
		req.db.query(
			'DELETE FROM signups WHERE player_id = ? AND match_day = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
			[ req.session.user_id, match_day ],
			function(err, results) {
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
	let player_id = req.session.user_id;

	if ( ! player_id  ) {
		return res.redirect('/');
	}

	if ( ! res.locals.rostered ) {
		return res.redirect('/');
	}

	res.locals.title = 'Your Match Info - ' + res.locals.title;

	let matchQuery = `
		SELECT 
			m.id, m.season, m.match_day, m.lobby_user, m.lobby_pass, 
			tp.team_id, tp.player_id, c.name, c.mmr, c.rsc_id
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
			lobby_user: results[0].lobby_user, 
			lobby_pass: results[0].lobby_pass, 
			players: results 
		});
	});
});

router.get('/match/:match_id', (req, res) => {
	res.locals.title = `Match ${req.params.match_id} Info - ${res.locals.title}`;

	let matchQuery = `
		SELECT 
			m.id, m.season, m.match_day, m.lobby_user, m.lobby_pass, 
			tp.team_id, tp.player_id, c.name, c.mmr, c.rsc_id
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

	req.db.query(matchQuery, [ req.params.match_id ], (err, results) => {
		if ( err ) { throw err; }

		res.render('match', { 
			season: results[0].season, 
			match_day: results[0].match_day, 
			lobby_user: results[0].lobby_user, 
			lobby_pass: results[0].lobby_pass, 
			players: results 
		});
	});

});

router.get('/matches', (req, res) => {
	res.locals.title = `Season ${res.locals.settings.season} Matches - ${res.locals.title}`;

	let matchesQuery = 'SELECT m.id,m.match_day,m.lobby_user,m.lobby_pass,t.tier FROM matches AS m LEFT JOIN teams AS t ON m.home_team_id = t.id WHERE m.season = ? ORDER BY m.match_day DESC';
	req.db.query(matchesQuery, [ res.locals.settings.season ], (err, results) => {
		if ( err ) { throw err; }

		res.render('matches', { matches: results });
	});
});

module.exports = router;
