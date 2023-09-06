const express = require('express');
const router = express.Router();

// /tournaments
// /tournament/:t_id
// /tournament/:t_id/signup
// /tournament/:t_id/signup_solo

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
					res.render('tournament_signup', { tournament: tournament });
				} else {
					res.render('tournament', { tournament: tournament });
				}
			});
		});
	});
});

router.get('/tournament/:t_id/signup', (req, res) => {
	
});

module.exports = router;
