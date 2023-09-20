const express = require('express');
const router = express.Router();

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

function getTimes(signup_close_dtg, start_dtg) {
	const timeNow = new Date().getTime();
	const check_in_hint = new Date(start_dtg);
	const check_in_start = new Date(start_dtg);
	const check_in_dtg = new Date(start_dtg);
	check_in_dtg.setTime( check_in_dtg.getTime() - (1000 * 60 * 30) ); // 30 minute cutoff
	check_in_start.setTime( check_in_dtg.getTime() - (1000 * 60 * 60 * 2) ); // 2 hour checkin
	check_in_hint.setTime( check_in_dtg.getTime() - (1000 * 60 * 60 * 4) ); // 4 hour hint

	const times = {
		signup: {
			active: timeNow > signup_close_dtg.getTime() ? false : true,
			dtg: signup_close_dtg,
			time: signup_close_dtg.getTime(),
			color: 'inherit',
		},
		check_in: {
			active: false,
			hint: check_in_hint,
			start: check_in_start,
			dtg: check_in_dtg,
			time: check_in_dtg.getTime(),
			color: 'inherit',
		},
		start: {
			dtg: start_dtg,
			time: start_dtg.getTime(),
		},
	};

	let check_in_color = 'inherit';
	if ( timeNow > check_in_dtg.getTime() ) { // too late
		check_in_color = '#dc3545';
	} else if ( timeNow > (check_in_dtg.getTime() - 1000 * 60 * 5) ) { // 5 min warning
		times.check_in.active = true;
		check_in_color = '#ffc107';
	} else if ( timeNow > check_in_start.getTime() ) {
		times.check_in.active = true;
		check_in_color = '#bcffbc';
	} else if ( timeNow > check_in_hint.getTime() ) { // 4 hour warning
		times.check_in.active = true;
		check_in_color = '#cde4ff';
	}
	times.check_in.color = check_in_color;

	if ( times.signup.active ) {
		times.signup.color = '#bcffbc';

		if (timeNow > (signup_close_dtg.getTime()-1000*60*60)) { // 1 hour signup warning
			times.signup.color = '#ffc107';
		}
	}

	return times;
}

router.get('/tournaments', (req, res) => {
	res.locals.title = `RSC Tournaments`;

	const query = `
		SELECT
			id,title,format,open,active,start_dtg,
			signup_close_dtg,team_size,cap_type,team_cap,allow_external,
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

router.get('/tournament/:t_id/team/:team_id/check_in', (req, res) => {
	const discord_id = res.locals.discord_id;
	const query = `
		UPDATE tournament_players 
		SET check_in_dtg = now()
		WHERE t_id = ? AND team_id = ? AND discord_id = ?
	`;
	req.db.query(query, [req.params.t_id, req.params.team_id, discord_id], (err, _results) => {
		if ( err ) { throw err; }

		return res.redirect(`/tournament/${req.params.t_id}/team/${req.params.team_id}`);
	});
});

router.get('/tournament/:t_id/team/:team_id', (req, res) => {
	let my_player = null;

	const query = `
		SELECT
			id,title,format,open,active,start_dtg,
			signup_close_dtg,team_size,cap_type,team_cap,allow_external,
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
		tournament.times = getTimes(tournament.signup_close_dtg, tournament.start_dtg);

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
				team.salary = 0;
				tournament.teams.unsorted[ team.id ] = team;
				tournament.teams.unsorted[ team.id ]['players'] = {};
			}

			const playersQuery = `
				SELECT
					tp.id,tp.team_id,tp.tier,tp.discord_id,tp.player_id,
					tp.cap_value,tp.mmr,tp.tracker_link,
					tp.check_in_dtg,tp.signup_dtg,
					p.nickname,c.name
				FROM tournament_players AS tp
				LEFT JOIN players AS p ON tp.discord_id = p.discord_id
				LEFT JOIN contracts AS c ON tp.discord_id = c.discord_id
				WHERE tp.t_id = ?
			`;
			req.db.query(playersQuery, [ req.params.t_id ], (err, results) => {
				if ( err ) { throw err; }

				if ( results && results.length ) {
					for ( let i = 0; i < results.length; ++i ) {
						const player = results[i];
						if ( player.discord_id === res.locals.discord_id ) {
							my_player = player;
						}
						if ( player.team_id && player.team_id in tournament.teams.unsorted ) {
							tournament.teams.unsorted[ player.team_id ].salary += player.cap_value;
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
			
				const team = tournament.teams.unsorted[ req.params.team_id ];
				res.locals.title = `${team.name} - ${tournament.name}`;

				console.log(tournament.teams.unsorted[req.params.team_id],tournament);
				res.render('tournament_team', {
					tournament: tournament,
					team: team,
					me: my_player,
					POINTS: POINTS,
				});
			});
		});
	});
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

					return res.redirect(`/tournament/${req.params.t_id}`);
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

						return res.redirect(`/tournament/${req.params.t_id}/team/${team_id}`);
					});
				});
			}
		});
	} else {
		return res.redirect(`/tournament/${req.params.t_id}/signup_solo`);
	}
});

router.all('/tournament/:t_id/leave', (req, res) => {
	if ( ! req.session.is_admin ) {
		//return res.redirect('/');
	} 

	const discord_id = req.body.discord_id;
	if ( discord_id !== res.locals.discord_id ) {
		if ( ! req.session.is_admin ) {
			return res.redirect(`/tournament/${req.params.t_id}`);
		}
	}

	const query = 'DELETE FROM tournament_players WHERE t_id = ? AND discord_id = ?';
	req.db.query(query, [ req.params.t_id, discord_id ], (err, _results) => {
		if ( err ) { throw err; }

		return res.redirect(`/tournament/${req.params.t_id}`);
	});
});

router.get(['/tournament/:t_id', '/tournament/:t_id/edit', '/tournament/:t_id/signup', '/tournament/:t_id/signup_solo'], (req, res) => {
	res.locals.title = `RSC Tournaments`;
	const action    = req.url.split('/').pop(); 
	const SIGNUP = action.includes('signup');
	const SOLO   = action.includes('solo');
	const EDIT   = action === 'edit' ? true : false; // admin only path

	let my_player = null;

	const query = `
		SELECT
			id,title,format,open,active,start_dtg,
			signup_close_dtg,team_size,cap_type,team_cap,allow_external,
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
		tournament.times = getTimes(tournament.signup_close_dtg, tournament.start_dtg);
		tournament.SIGNUP = SIGNUP;
		tournament.SOLO   = SOLO;
		tournament.EDIT   = EDIT;

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
				team.salary = 0;
				tournament.teams.unsorted[ team.id ] = team;
				tournament.teams.unsorted[ team.id ]['players'] = {};
			}

			const playersQuery = `
				SELECT
					tp.id,tp.team_id,tp.tier,tp.discord_id,tp.player_id,
					tp.cap_value,tp.mmr,tp.tracker_link,
					tp.check_in_dtg,tp.signup_dtg,
					p.nickname,c.name
				FROM tournament_players AS tp
				LEFT JOIN players AS p ON tp.discord_id = p.discord_id
				LEFT JOIN contracts AS c ON tp.discord_id = c.discord_id
				WHERE tp.t_id = ?
			`;
			req.db.query(playersQuery, [ req.params.t_id ], (err, results) => {
				if ( err ) { throw err; }

				if ( results && results.length ) {
					for ( let i = 0; i < results.length; ++i ) {
						const player = results[i];
						if ( player.discord_id === res.locals.discord_id ) {
							my_player = player;
						}
						if ( player.team_id && player.team_id in tournament.teams.unsorted ) {
							tournament.teams.unsorted[ player.team_id ].salary += player.cap_value;
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
		
				let team = {};
				if ( my_player && my_player.team_id ) {
					team = tournament.teams.unsorted[ my_player.team_id ];
					res.locals.title = `${team.name} - ${tournament.name}`;
				} else {
					res.locals.title = `${tournament.name}`;
				}

				console.log(tournament.teams.unsorted[req.params.team_id],tournament);
				res.render('tournament_team', {
					tournament: tournament,
					team: team,
					me: my_player,
					POINTS: POINTS,
				});
			});
		});
	});
});

module.exports = router;
