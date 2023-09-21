const express = require('express');
const router  = express.Router();
const { mmrRange, getTierFromMMR } = require('../mmrs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

router.get(['/search','/search/:needle'], (req,res) => {
	const needle = req.params.needle ? req.params.needle : req.query.find;
	const needle_f = `%${needle}%`;
	console.log(`Search for "${needle}"`);
	if ( needle ) {
		const query = `
			SELECT 
				p.id,p.nickname,p.discord_id,c.rsc_id,
				c.name,c.mmr,c.tier,c.status,c.active_2s,c.active_3s
			FROM players AS p
			LEFT JOIN contracts AS c ON p.discord_id = c.discord_id
			LEFT JOIN trackers AS t ON t.rsc_id = c.rsc_id
			WHERE (
				p.nickname like ? OR
				p.discord_id like ? OR
				c.name like ? OR
				c.discord_id like ? OR
				t.tracker_link like ?
			)
			GROUP BY 
				p.id, c.rsc_id, c.name, c.mmr, c.tier, 
				c.status, c.active_2s, c.active_3s
		`;

		//res.send(query.replaceAll('?', `'${needle_f}'`));

		req.db.query(query, [needle_f,needle_f,needle_f,needle_f,needle_f], (err,results) => {
			if ( err ) { throw err; }
			console.log('search =',results);			
			if ( results.length === 1 ) {
				return res.redirect(`/player/${results[0].rsc_id}`);
			} else {
				return res.render('search', { needle: needle, results: results });
			}
		});
	} else {
		return res.render('search', { needle: '', results: [] });
	}
});

router.get('/player/:rsc_id', (req, res) => {
	if ( ! req.session.discord_id ) {
		//return res.redirect('/login');
	}

	const query = `
SELECT
	c.rsc_id, c.name, c.tier, c.status, c.mmr, c.active_3s, c.active_2s
FROM contracts AS c
WHERE c.rsc_id = ?
`;

	const player = {
		rsc_id: '',
		name:   '',
		tier:   '',
		status: '',
		mmr:     0,
		trackers: {},
		pulls:    [],
		active_3s: false,
		active_2s: false,
	};

	console.log(`RSC_ID: ${req.params.rsc_id}`);
	req.db.query(query, [ req.params.rsc_id ], (err, results) => {
		if ( err ) { return res.send(`Error: ${err}`); }
		
		console.log(`results:`, results);

		if ( ! results || results.length === 0 ) {
			return res.render('404_player', {
				rsc_id: req.params.rsc_id,
				name: '',
			});
		}

		player.rsc_id = req.params.rsc_id;
		player.name   = results[0].name;
		player.tier   = results[0].tier;
		player.mmr    = results[0].mmr;
		player.status = results[0].status;
		player.active_3s = results[0].active_3s;
		player.active_2s = results[0].active_2s;
		
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
				return res.render('player', { player: player });
			});
		});
	});
});

module.exports = router;
