const express = require('express');
const router  = express.Router();
const { mmrRange, getTierFromMMR } = require('../mmrs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

router.get('/player/:rsc_id', (req, res) => {
	if ( ! req.session.discord_id ) {
		//return res.redirect('/login');
	}

	const query = `
SELECT
	c.rsc_id, c.name, c.tier, c.status, c.mmr
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
ORDER BY psyonix_season DESC
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

				return res.render('player', { player: player });
			});
		});
	});
});

module.exports = router;
