const express = require('express');
const router  = express.Router();
const { mmrRange_3s, mmrRange_2s, getTierFromMMR } = require('../mmrs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

const { roles } = require('../roles');

router.get(['/search','/search/:needle'], (req,res) => {
	const needle = req.params.needle ? req.params.needle : req.query.find;
	const needle_f = `%${needle}%`;
	console.log(`Search for "${needle}"`);
	if ( needle ) {
		const query = `
			SELECT 
				c.rsc_id,
				any_value(p.nickname) AS nickname, any_value(c.discord_id) AS discord_id,
				any_value(c.name) AS name, any_value(c.mmr) AS mmr, any_value(c.tier) AS tier, 
				any_value(c.status) AS status, any_value(c.active_2s) AS active_2s, any_value(c.active_3s) AS active_3s
			FROM contracts AS c
			LEFT JOIN players AS p ON p.discord_id = c.discord_id
			LEFT JOIN trackers AS t ON t.rsc_id = c.rsc_id
			WHERE (
				p.nickname like ? OR
				c.name like ? OR
				c.discord_id like ? OR
				c.rsc_id like ? OR
				t.tracker_link like ?
			)
			GROUP BY c.rsc_id
		`;

		//res.send(query.replaceAll('?', `'${needle_f}'`));

		req.db.query(query, [needle_f,needle_f,needle_f,needle_f,needle_f], (err,results) => {
			if ( err ) { throw err; }
			//if ( results.length === 1 ) {
				//return res.redirect(`/player/${results[0].rsc_id}`);
			//} else {
				return res.render('search', { needle: needle, results: results });
			//}
		});
	} else {
		return res.render('search', { needle: '', results: [] });
	}
});

router.get('/player/:rsc_id/promote/:role', (req, res) => {
	const rsc_id = req.params.rsc_id;
	if ( ! req.session.is_admin ) {
		return res.redirect(`/player/${rsc_id}`);
	} 
	
	const queries = {
		'admin': 'UPDATE players SET admin = 1 WHERE rsc_id = ?',
		'devleague-admin': 'UPDATE players SET devleague_admin = 1 WHERE rsc_id = ?',
		'combines-admin': 'UPDATE players SET combines_admin = 1 WHERE rsc_id = ?',
		'stats-admin': 'UPDATE players SET stats_admin = 1 WHERE rsc_id = ?',
	};
	req.db.query(queries[req.params.role], [rsc_id], (err,results) => {
		if ( err ) { throw err; }

		return res.redirect(`/player/${rsc_id}`);
	});
});

router.get('/player/:rsc_id/demote/:role', (req, res) => {
	const rsc_id = req.params.rsc_id;

	if ( ! req.session.is_admin ) {
		return res.redirect(`/player/${rsc_id}`);
	}

	const queries = {
		'admin': 'UPDATE players SET admin = 0 WHERE rsc_id = ?',
		'devleague-admin': 'UPDATE players SET devleague_admin = 0 WHERE rsc_id = ?',
		'combines-admin': 'UPDATE players SET combines_admin = 0 WHERE rsc_id = ?',
		'stats-admin': 'UPDATE players SET stats_admin = 0 WHERE rsc_id = ?',
	};

	req.db.query(queries[req.params.role], [rsc_id], (err,results) => {
		if ( err ) { throw err; }
		return res.redirect(`/player/${rsc_id}`);
	});
});

router.get('/player/:rsc_id', (req, res) => {
	if ( ! req.session.discord_id ) {
		//return res.redirect('/login');
	}

	const query = `
		SELECT
			c.rsc_id, c.discord_id, c.name, c.tier, c.status, c.mmr, c.active_3s, c.active_2s,
			p.admin,p.tourney_admin,p.devleague_admin,p.stats_admin,p.combines_admin
		FROM contracts AS c
		LEFT JOIN players AS p 
			ON c.rsc_id = p.rsc_id
		WHERE c.rsc_id = ?
	`;

	const player = {
		rsc_id    : '',
		discord_id: '',
		name      :   '',
		tier      :   '',
		status    : '',
		mmr       :     0,
		trackers  : {},
		pulls     :    [],
		combines  : false,
		active_3s : false,
		active_2s : false,
		user_roles : [],
	};

	const role_map = {
		'admin': '400096325678530580',
		'tourney_admin' : '400097117684760597',
		'devleague_admin': '1155946438652604517',
		'stats_admin': '400096994552578055',
		'combines_admin': '607719471196536843',
	};

	console.log(`RSC_ID: ${req.params.rsc_id}`);
	req.db.query(query, [ req.params.rsc_id ], (err, results) => {
		if ( err ) { return res.send(`Error: ${err}`); }
		
		// console.log(`results:`, results);

		if ( ! results || results.length === 0 ) {
			return res.render('404_player', {
				rsc_id: req.params.rsc_id,
				name: '',
				user_roles: [],
			});
		}

		player.rsc_id     = req.params.rsc_id;
		player.discord_id = results[0].discord_id;
		player.name       = results[0].name;
		player.tier       = results[0].tier;
		player.mmr        = results[0].mmr;
		player.status     = results[0].status;
		player.active_3s  = results[0].active_3s;
		player.active_2s  = results[0].active_2s;

		player.admin           = results[0].admin;
		player.tourney_admin   = results[0].tourney_admin;
		player.devleague_admin = results[0].devleague_admin;
		player.stats_admin     = results[0].stats_admin;
		player.combines_admin  = results[0].combines_admin;

		if ( results[0].admin ) {
			player.user_roles.push(role_map['admin']);
		}
		if ( results[0].tourney_admin ) {
			player.user_roles.push(role_map['tourney_admin']);
		}
		if ( results[0].devleague_admin ) {
			player.user_roles.push(role_map['devleague_admin']);
		}
		if ( results[0].stats_admin ) {
			player.user_roles.push(role_map['stats_admin']);
		}
		if ( results[0].combines_admin ) {
			player.user_roles.push(role_map['combines_admin']);
		}
		
		res.locals.title = `${player.rsc_id}: ${player.name} [${player.tier}]`;
		res.locals.description = `${player.name} in ${player.tier} @ ${player.mmr}MMR`;

		const tracker_query = 'SELECT tracker_link FROM trackers WHERE rsc_id = ?';
		req.db.query(tracker_query, [ req.params.rsc_id ], (err, results) => {
			if ( err ) { return res.send(`Error: ${err}`); }

			for ( let i = 0; i < results.length; ++i ) {
				player.trackers[ results[i]['tracker_link'] ] = {
					pulls: 0,
					registered: true,
				};
			}
			
			const data_query = `
				SELECT
					psyonix_season AS season, tracker_link, date_pulled,
					threes_games_played as gp_3s, threes_rating as mmr_3s, threes_season_peak as peak_3s,
					twos_games_played as gp_2s, twos_rating as mmr_2s, twos_season_peak as peak_2s,
					ones_games_played as gp_1s, ones_rating as mmr_1s, ones_season_peak as peak_1s
				FROM
					tracker_data 
				WHERE rsc_id = ?
				ORDER BY psyonix_season DESC, date_pulled DESC
			`;
			
			req.db.query(data_query, [ req.params.rsc_id ], (err, results) => {
				if ( err ) { return res.send(`Error: ${err}`); }
	
				for ( let i = 0; i < results.length; ++i ) {
					
					if ( ! (results[i]['tracker_link'] in player.trackers) ) {
						player.trackers[ results[i]['tracker_link'] ] = {
							pulls: 0,
							registered: false,
						};
					}
					player.trackers[ results[i]['tracker_link'] ].pulls++;

					player.pulls.push(results[i]);
				}

				const sorted_trackers = Object.keys(player.trackers)
					.sort((link_1, link_2) => 
						player.trackers[ link_2 ].pulls - player.trackers[ link_1 ].pulls
					)
					.reduce((obj, key) => ({
						...obj,
						[key]: player.trackers[ key ]
					}), {});
				player.trackers = sorted_trackers;

				if ( 'json' in req.query ) {
					return res.json(player);
				}

				const combines_query = `
					SELECT 
						c.id,c.home_wins,c.away_wins,c.home_mmr,c.away_mmr,p.team,
						p.start_mmr,p.end_mmr
					FROM 
						combine_matches AS c 
					LEFT JOIN combine_match_players AS p 
					ON c.id = p.match_id 
					WHERE 
						c.season = ? AND c.league = 3 AND c.completed = 1 AND p.rsc_id = ? 
				`;

				req.db.query(combines_query, 
					[ res.locals.combines.season, req.params.rsc_id ], 
					(err, results) => {
					
					const record = { wins: 0, losses: 0 };

					if ( err ) { console.log(err); throw err; } 
					
					for ( let i = 0; i < results.length; ++i ) {
						const r = results[i];
						results[i].tier = getTierFromMMR(r.home_mmr / 3, 3);
						if ( r.team === 'home' ) {
							record.wins += r.home_wins;
							record.losses += r.away_wins;
							results[i].wins = r.home_wins;
							results[i].losses = r.away_wins;
						} else {
							record.wins += r.away_wins;
							record.losses += r.home_wins;
							results[i].wins = r.away_wins;
							results[i].losses = r.home_wins;
						}
					}

					player.combines = results;
					//console.log('combines',results);
					console.log(player.user_roles);
					return res.render('player', {
						player: player,
						roles: roles,
						user_roles: player.user_roles,
					});
				});

				//return res.render('player', { player: player });
			});
		});
	});
});

module.exports = router;
