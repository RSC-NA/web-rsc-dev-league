const express = require('express');
const router  = express.Router();
const { _mmrRange, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.get('/change_tier/:rsc_id/:new_tier', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const query = 'UPDATE contracts SET tier = ? WHERE rsc_id = ?';
	req.db.query(query, [ req.params.new_tier, req.params.rsc_id], (err, _results) => {
		if ( err ) { throw err; }

		return res.redirect('/process_gameday');
	});
});

router.post('/generate_team/:tier', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	// TODO (err trapping with invalid values)
	const numPlayers = req.body.player_count;
	const numTeams = numPlayers / 3;
	const tier = req.params.tier;

	const players = [];
	const teams = {};

	for ( let i = 0; i < numPlayers; i++ ) {
		players.push(parseInt(req.body['player_id_' + i]));
	}

	for ( let i = 1; i <= numTeams; i++ ) {
		teams[tier + '_' + i] = {
			home: i % 2 ? true : false,
			away: i % 2 ? false : true,
			match_day: req.body.match_day,
			season: req.body.season,
			team_number: i,
			players: [],
			mmr: 0,
		};
	}

	let playersQuery = 'select p.id,c.name,c.mmr,c.tier from players as p left join contracts as c on p.discord_id = c.discord_id where p.id in (?) ORDER BY c.mmr DESC';
	req.db.query(playersQuery, [ players ], (err, results) => {
		if ( err ) { throw err; }

		const playerList = [];
		for ( let i = 0; i < results.length; i++ ) {
			playerList.push(results[i]);
		}

		let curTeam = 1;
		let direction = 'up';

		while ( playerList.length ) {
			const player = playerList.pop();
			const mmr = player['mmr'];

			teams[tier + '_' + curTeam]['players'].push(player);
			teams[tier + '_' + curTeam]['mmr']+= mmr;

			if ( direction == 'up' ) {
				curTeam += 1;
				if ( curTeam == numTeams ) {
					direction = 'down';

					if ( playerList.length ) {
						const playerTwo = playerList.pop();
						const playerTwoMmr = playerTwo['mmr'];

						teams[tier + '_' + curTeam]['players'].push(playerTwo);
						teams[tier + '_' + curTeam]['mmr'] += playerTwoMmr;
					}
				}
			} else {
				curTeam -= 1;

				if ( curTeam == 1 ) {
					direction = 'up';

					if ( playerList.length ) {
						const playerTwo = playerList.pop();
						const playerTwoMmr = playerTwo['mmr'];

						teams[tier + '_' + curTeam]['players'].push(playerTwo);
						teams[tier + '_' + curTeam]['mmr'] += playerTwoMmr;
					}
				}
			}
		}

		// id, team_number, tier
		// ['Elite_1', 'Elite_2' ] => [ [1, 'Elite' ], [2, 'Elite'] ]
		const teamParams = Object.keys(teams).map(tierString => [ tierString.split('_')[1], tierString.split('_')[0] ] );
		const teamsQuery = 'INSERT INTO teams (team_number, tier) VALUES ?';
		req.db.query(teamsQuery, [ teamParams ], (err, results) => {
			if ( err ) { throw err; }
			console.log(results);
			let insertId = results.insertId;

			const playerParams = [];

			const matchParams = [];
			let matchInfo = [];

			for ( const team in teams ) {
				teams[ team ]['team_id'] = insertId;

				// set up match params for home team, finish it for away
				const matchDate = new Date();
				if ( teams[ team ].home ) {
					matchInfo = [
						matchDate,
						teams[ team ].season,
						teams[ team ].match_day,
						insertId,
						null,
						team,
						null
					];
				} else if ( teams[ team ].away ) {
					matchInfo[4] = insertId;
					matchInfo[6] = team;
					matchParams.push(matchInfo);
				}
				
				for ( let i = 0; i < teams[team].players.length; i++ ) {
					playerParams.push([insertId, teams[team].players[i].id ]);
				}

				// move to next team
				insertId++;
			}

			const playersQuery = 'INSERT INTO team_players (team_id, player_id) VALUES ?';
			req.db.query(playersQuery, [ playerParams ], (err, _results) => {
				if ( err ) { throw err; }

				// season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass
				const matchQuery = 'INSERT INTO matches (match_dtg, season, match_day, home_team_id, away_team_id, lobby_user, lobby_pass) VALUES ?';
				req.db.query(matchQuery, [ matchParams ], (err, _results) => {
					if ( err ) { throw err; }

					// finally, mark all selected players as "rostered"
					const updateQuery = `
						UPDATE signups 
						SET rostered = 1 
						WHERE ( 
							DATE(signup_dtg) = CURDATE() OR 
							DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() 
						) 
						AND player_id IN (?)`;
					req.db.query(updateQuery , [players], (err, _results) => {
						if ( err ) { throw err; }

						res.redirect('/process_gameday');
					}); // final query, update players as rostered
				}); // end query to create match details
			}); // end query to insert players onto team roster
			//res.json(teams);
		}); // end query to generate team	
	}); // end query to select players from provided list.
});

router.get('/make_active/:signup_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const query = 'UPDATE signups SET active = 1 WHERE id = ?';
	req.db.query(query, [ req.params.signup_id ], () => {
		res.redirect('/process_gameday');
	});
});

router.get('/make_inactive/:signup_id', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const query = 'UPDATE signups SET active = 0 WHERE id = ?';
	req.db.query(query, [ req.params.signup_id ], () => {
		res.redirect('/process_gameday');
	});
});

router.get('/activate_everyone/:match_day', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	if ( ! req.params.match_day ) {
		return res.redirect('/');
	}

	const query = 'UPDATE signups SET active = 1 WHERE match_day = ? AND season = ?';
	req.db.query(query, [ req.params.match_day, res.locals.settings.season ], () => {
		return res.redirect('/process_gameday');
	});

});

router.get('/process_gameday', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Process Gameday - ${res.locals.title}`;

	// TODO(erh): think about resorting this by signup date, or perhaps just in the front-end?
	const signups_query = `
	SELECT 
		s.id,s.player_id,s.season,s.match_day,s.active,s.rostered,
		p.discord_id,c.rsc_id,c.name,c.mmr,c.tier,c.status
	FROM 
		signups AS s
	LEFT JOIN players AS p 
		ON s.player_id = p.id
	LEFT JOIN contracts AS c
		ON p.discord_id = c.discord_id
	WHERE ( 
		DATE(signup_dtg) = CURDATE() OR 
		DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() 
	)
	ORDER BY s.id ASC
	`; 

	req.db.query(signups_query, (err, results) => {
		if ( err ) { throw err; }

		const signups = {};
		let match_day = null;
		for ( let i = 0; i < results.length; i++ ) {
			// combine master/prem, ammy/contender
			if ( results[i]['tier'] === 'Master' ) {
				results[i]['tier'] = 'Premier';
			} else if ( results[i]['tier'] === 'Amateur' ) {
				results[i]['tier'] = 'Contender';
			}

			if ( ! ( results[i]['tier'] in signups ) ) {
				match_day = results[i]['match_day'];
				signups[ results[i]['tier'] ] = {
					'season': results[i]['season'],
					'match_day': results[i]['match_day'],
					'fa': [],
					'sub': [],
				};
			}
			
			if ( results[i]['active'] == 1 ) {
				signups[ results[i]['tier'] ]['fa'].push(results[i]);
			} else {
				signups[ results[i]['tier'] ]['sub'].push(results[i]);
			}


		}
		console.log(signups);
		res.render('process', { signups: signups, match_day: match_day });
	});
});

router.get('/import_contracts/:contract_sheet_id', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(req.params.contract_sheet_id);
	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["Players"];
	const rows = await sheet.getRows();

	const players = {};

	console.log('Importing contracts...');

	for ( let i = 0; i < rows.length; i++ ) {
		if ( ! rows[i]['Player Name'] || ! rows[i]['RSC Unique ID'] || ! rows[i]['Discord ID'] ) {
			continue;
		}
		players[ rows[i]['RSC Unique ID'] ] = {
			'rsc_id': rows[i]['RSC Unique ID'],
			'name': rows[i]['Player Name'],
			'discord_id': rows[i]['Discord ID'],
			'active_2s': false,
			'active_3s': false,
			'status': 'Non-playing',
		};
		if ( rows[i]['3v3 Active/ Returning'] == "TRUE" ) { 
			players[ rows[i]['RSC Unique ID'] ].active_3s = true;
		}
	}

	console.log(`    Players populated...${Object.keys(players).length}`);

	const mmrSheet = doc.sheetsByTitle["Count/Keeper"];
	const mmrRows = await mmrSheet.getRows();

	for ( let i = 0; i < mmrRows.length; i++ ) {
		if ( mmrRows[i]['RSC ID'] in players ) {
			players[ mmrRows[i]['RSC ID'] ]['mmr'] = mmrRows[i]['Effective MMR'];
			players[ mmrRows[i]['RSC ID'] ]['tier'] = mmrRows[i]['Tier'];
		}
	}

	console.log(`     MMRs/tiers loaded`);

	const contractSheet = doc.sheetsByTitle['Master Contracts'];
	const contractRows = await contractSheet.getRows();

	for ( let i = 0; i < contractRows.length; i++ ) {
		if ( contractRows[i]['RSC Unique ID'] in players ) {

			// perm FAs don't show up in Count/Keeper sheet. We need to 
			// calc their tier from MMR.
			if ( ! ('tier' in players[ contractRows[i]['RSC Unique ID'] ]) ) {
				players[contractRows[i]['RSC Unique ID']]['mmr'] = contractRows[i]['Current MMR'];
				players[contractRows[i]['RSC Unique ID']]['tier'] = getTierFromMMR(parseInt(contractRows[i]['Current MMR']));
			}

			players[ contractRows[i]['RSC Unique ID'] ]['status'] = contractRows[i]['Contract Status'];

		}
	}
	
	console.log('import processing finished');
	// always add "tehblister" to the list in case he isn't playing
	// Added for development in S17 so that I could test things 
	// while non-playing.
	/*
	let tehblister_id = 'RSC000302';
	let tehblister_discord_id = '207266416355835904';
	if ( ! (tehblister_id in players) ) {
		players[tehblister_id] = {
			'rsc_id': tehblister_id,
			'name': 'tehblister',
			'discord_id': tehblister_discord_id,
			'mmr': 1550,
			'tier': 'Elite',
			'status': 'Free Agent',
		};
	}
	*/
	players['RSC000967'].mmr       = 1310;
	players['RSC000967'].tier      = 'Rival';
	players['RSC000967'].status    = 'Free Agent';
	players['RSC000967'].active_3s = true;

	req.db.query('TRUNCATE TABLE contracts', (err) => {
		if ( err ) {  throw err; }
		console.log('truncate table');
		
		const playersArray = [];
		for ( const rsc_id in players ) {
			const player = players[rsc_id];

			if ( ! player['tier'] ) {
				player['tier'] = 'NONE';
			}

			// discord_id, rsc_id, mmr, tier, status
			if ( player['tier'] == 'Master' ) {
				//player['tier'] = 'Premier';
			} else if ( player['tier'] == 'Amateur' ) {
				//player['tier'] = 'Contender';
			}
			if ( ! player['mmr'] ) {
				player['mmr'] = 0;
			}
			if ( ! player['status'] ) {
				player['status'] = 'Non-playing';
			}

			playersArray.push([ player['discord_id'], player['rsc_id'], player['name'], player['mmr'], player['tier'], player['status'], player['active_3s'], player['active_2s'] ]);
		}

		const insertQuery = `
			INSERT INTO contracts 
				(discord_id, rsc_id, name, mmr, tier, status, active_3s, active_2s) 
			VALUES ?
		`;
		req.db.query(
			insertQuery,
			[ playersArray ],
			(err, results) => {
				if (err) { /*throw err;*/ writeError(err.toString()); console.log('error!', err); }
				console.log(`Inserting records`, results);
				res.redirect('/manage_league');
		});
	});
});

router.get('/manage_league', (req, res) => { 
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	res.locals.title = `Manage League - ${res.locals.title}`;

	const counts_query = `
		SELECT 
			count(*) AS count,tier,status 
		FROM contracts 
		WHERE 
			tier != "" AND 
			tier != "NONE" 
		GROUP BY tier,status 
		ORDER BY tier,status`;
	req.db.query(counts_query, (err, results) => {
		if ( err ) { throw err; }

		// hardcoded tier names so we can get correct sort order.
		const tiers = {
			'all': { 'total': 0, 'fa': 0 },
			'Premier': { 'total': 0, 'fa': 0 },
			'Master': { 'total': 0, 'fa': 0 },
			'Elite': { 'total': 0, 'fa': 0 },
			'Veteran': { 'total': 0, 'fa': 0 },
			'Rival': { 'total': 0, 'fa': 0 },
			'Challenger': { 'total': 0, 'fa': 0 },
			'Prospect': { 'total': 0, 'fa': 0 },
			'Contender': { 'total': 0, 'fa': 0 },
			'Amateur': { 'total': 0, 'fa': 0 },
		};
		for ( let i = 0; i < results.length; i++ ) {
			tiers[ results[i]['tier'] ]['total'] += results[i]['count'];
			tiers['all']['total'] += results[i]['count'];

			if ( results[i]['status'] == 'Free Agent' ) {
				tiers[ results[i]['tier'] ]['fa'] += results[i]['count'];
				tiers['all']['fa'] += results[i]['count'];
			}
		}

		const settings_query = `
		SELECT 
			id,season,contract_url,
			amateur,contender,prospect,challenger,rival,
			veteran,elite,master,premier
		FROM 
			league_settings 
		ORDER by id DESC 
		LIMIT 1
		`;
		req.db.query(settings_query, (err, results) => { 
			if (err) { throw err; }
			const contract_sheet_id = results[0].contract_url.split('/')[5];
			res.render('manage', { tiers: tiers, settings: results[0], contract_sheet_id: contract_sheet_id });
		});

	});

});

router.post('/manage_league', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	} 

	const amateur    = "amateur"    in req.body ? 1 : 0;
	const contender  = "contender"  in req.body ? 1 : 0;
	const prospect   = "prospect"   in req.body ? 1 : 0;
	const challenger = "challenger" in req.body ? 1 : 0;
	const rival      = "rival"      in req.body ? 1 : 0;
	const veteran    = "veteran"    in req.body ? 1 : 0;
	const elite      = "elite"      in req.body ? 1 : 0;
	const master     = "master"     in req.body ? 1 : 0;
	const premier    = "premier"    in req.body ? 1 : 0;

	const settings_query = `
	INSERT INTO league_settings
		(
			season,contract_url,amateur,contender,prospect,challenger,
			rival,veteran,elite,master,premier
		)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	req.db.query(
		settings_query,
		[
			req.body.season, req.body.contract_url, amateur, contender, prospect,
			challenger, rival, veteran, elite, master, premier
		],
		(err) => {
			if ( err ) { throw err; }
			res.redirect('/manage_league');
		}
	);
});

module.exports = router;