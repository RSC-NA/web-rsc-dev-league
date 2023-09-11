const express = require('express');
const router = express.Router();

// /tournaments
// /tournament/:t_id
// /tournament/:t_id/signup
// /tournament/:t_id/signup_solo

const POINTS = {
	'Premier': 9,
	'Master': 8,
	'Elite': 7,
	'Veteran': 6,
	'Rival': 5,
	'Challenger': 4,
	'Prospect': 3,
	'Contender': 2,
	'Amateur': 1,
};

router.get('/tournaments', (req, res) => {
	res.locals.title = `RSC Tournaments`;

	const query = `
		SELECT
			id,title,format,open,active,start_dtg,
			signup_close_dtg,team_size,team_cap,allow_external,
			description
		FROM tournaments
		WHERE start_dtg > now() OR active = 1
	`;
	req.db.query(query, (err, results) => {
		if ( err ) { throw err; }

		const tournaments = {
			'open':     {},
			'active':   {},
			'upcoming': {},
		};	
		for ( let i = 0; i < results.length; ++i ) {
			const row = results[i];
			if ( row['active'] ) {
				tournaments['active'][ row['id'] ] = row;
			} else if ( row['open'] ) {
				tournaments['open'][ row['id'] ] = row;
			} else {
				tournaments['upcoming'][ row['id'] ] = row;
			}
		}
		res.render('tournaments', { tournaments: tournaments });
	});
});

router.get('/tournament/', (_req, res) => {
	return res.redirect('/tournaments');
});

router.post(['/tournament/:t_id/signup', '/tournament/:t_id/signup_solo'], (req, res) => {
	const SOLO   = req.url.split('/').pop().includes('solo');

	const d_id = req.body.discord_id;
	const tracker_link = 'tracker_link' in req.body ? req.body.tracker_link : '';
	const name = 'name' in req.body ? req.body.name : null;

	if ( SOLO && d_id ) {
		const query = `
			SELECT 
				c.rsc_id,c.name,c.mmr,c.tier,c.status,c.active_2s,c.active_3s,
				p.id
			FROM players AS p
			LEFT JOIN contracts AS c
			ON p.discord_id = c.discord_id
			WHERE p.discord_id = ?
		`;
		req.db.query(query, [ d_id ], (err, results) => {
			if ( err ) { throw err; }

			if ( results ) {
				const player = results[0];

				const p_query = `
					INSERT INTO tournament_players 
						(t_id, player_id, discord_id, 
						tier, cap_value, mmr,
						tracker_link)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				`;
				const p_params = [
					req.params.t_id, player.id, d_id,
					player.tier, POINTS[ player.tier ], player.mmr,
					tracker_link
				];
				req.db.query(p_query, p_params, (err, _results) => {
					if ( err ) { throw err; }

					return res.redirect(`/tournament/${req.params.t_id}/signup_solo`);
				});
			}
		});
	} else if ( ! SOLO && d_id && name ) {
		const query = `
			SELECT 
				c.rsc_id,c.name,c.mmr,c.tier,c.status,c.active_2s,c.active_3s,
				p.id
			FROM players AS p
			LEFT JOIN contracts AS c
			ON p.discord_id = c.discord_id
			WHERE p.discord_id = ?
		`;
		req.db.query(query, [ d_id ], (err, results) => {
			if ( err ) { throw err; }

			if ( results ) {
	
				const player = results[0];
				
				const t_query = `INSERT INTO tournament_teams (t_id,name) VALUES (?, ?)`;
				req.db.query(t_query, [ req.params.t_id, name ], (err, results) => {
					if ( err ) { throw err; }

					const team_id = results.insertId;

					const p_query = `
						INSERT INTO tournament_players 
							(t_id, player_id, team_id, discord_id, 
							tier, cap_value, mmr,
							tracker_link)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					`;
					const p_params = [
						req.params.t_id, player.id, team_id, d_id,
						player.tier, POINTS[ player.tier ], player.mmr,
						tracker_link
					];
					req.db.query(p_query, p_params, (err, _results) => {
						if ( err ) { throw err; }

						return res.redirect(`/tournament/${req.params.t_id}/signup_solo`);
					});
				});
			}
		});
	} else {
		return res.redirect(`/tournament/${req.params.t_id}/signup_solo`);
	}
});

router.get(['/tournament/:t_id', '/tournament/:t_id/signup', '/tournament/:t_id/signup_solo'], (req, res) => {
	res.locals.title = `RSC Tournaments`;

	const SIGNUP = req.url.split('/').pop().includes('signup');
	const SOLO   = req.url.split('/').pop().includes('solo');

	console.log(req.session);
	const query = `
		SELECT
			id,title,format,open,active,start_dtg,
			signup_close_dtg,team_size,team_cap,allow_external,
			description
		FROM tournaments
		WHERE id = ?
	`;
	req.db.query(query, [ req.params.t_id ], (err, results) => {
		if ( err ) { throw err; }
		
		if ( results && results.length === 0 ) {
			return res.send('Tournament not found.');
		} 

		const tournament = results[0];
		tournament.SIGNUP = SIGNUP;
		tournament.SOLO   = SOLO;

		const teamsQuery = `
			SELECT 
				id,name,checked_in,assigned,signup_dtg 
			FROM tournament_teams 
			WHERE t_id = ?
		`;
		req.db.query(teamsQuery, [ req.params.t_id ], (err, results) => {
			if ( err ) { throw err; }
			
			tournament.teams   = { full: {}, open: {}, unsorted: {} };
			tournament.players = {};
			for ( let i = 0; i < results.length; ++i ) {
				const team = results[i];
				tournament.teams.unsorted[ team.id ] = team;
				tournament.teams.unsorted[ team.id ]['players'] = {};
			}

			const playersQuery = `
				SELECT
					id,team_id,tier,
					cap_value,mmr,tracker_link,signup_dtg
				FROM tournament_players
				WHERE t_id = ?
			`;
			req.db.query(playersQuery, [ req.params.t_id ], (err, results) => {
				if ( err ) { throw err; }

				if ( results && results.length ) {
					for ( let i = 0; i < results.length; ++i ) {
						const player = results[i];
						if ( player.team_id && player.team_id in tournament.teams.unsorted ) {
							tournament.teams.unsorted[ player.team_id ].players[ player.id ] = player;
						} else {
							tournament.players[ player.id ] = player;
						}
					}

				}

				const team_size = tournament.team_size;
				for ( const team_id in tournament.teams.unsorted ) {
					const team = tournament.teams.unsorted[ team_id ];
					const cur_team_size = Object.keys(team.players).length;
					if ( cur_team_size === team_size ) {
						tournament.teams.full[ team_id ] = team;
					} else {
						tournament.teams.open[ team_id ] = team;
					}
				}

				console.log(tournament);
				if ( SIGNUP ) {
					res.render('tournament_signup', { tournament: tournament, POINTS: POINTS });
				} else {
					res.render('tournament', { tournament: tournament, POINTS: POINTS });
				}
			});
		});
	});
});

module.exports = router;
