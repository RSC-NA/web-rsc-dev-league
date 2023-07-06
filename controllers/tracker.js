// FLAG TO SEND TRACKER DATA STRAIGHT TO THE API.
// THIS WILL BE SET TO true AT RUNTIME, AND IF 
// THE SERVER EVER CRASHES, IT WILL BE FLIPPED TO FALSE
let SEND_TO_API_SERVER = true;
const EXTENSION_VERSION = '2.4.1';
const tracker_queue = {};

const express = require('express');
const router  = express.Router();

const { GoogleSpreadsheet } = require('google-spreadsheet');

require('dotenv').config();

async function grabMoreTrackers(connection) {
	console.log(`Grabbing more trackers [${Object.keys(tracker_queue).length}]`);
	let url = 'http://24.176.157.36:4443/api/v1/tracker-links/next/?format=json&limit=25';
	let response = await fetch(url);
	let trackers = await response.json();

	let trackers_by_link = {};
	console.log('grabbed some trackers = ' + trackers.length);
	for ( let i = 0; i < trackers.length; ++i ) {
		if ( trackers[i].link in tracker_queue ) {
			continue;
		}
		trackers_by_link[ trackers[i].link ] = trackers[i];
	}
	console.log('have ' + Object.keys(trackers_by_link).length + ' trackers to use');
	let tracker_links = Object.keys(trackers_by_link);
	connection.query('SELECT rsc_id,name,tracker_link FROM trackers WHERE tracker_link IN (?)', [ tracker_links ], (err, results) => {
		if ( err ) { console.error('Error with the query!', err); throw err; }

		console.log('in query');

		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				if ( results[i].tracker_link in trackers_by_link ) {
					// any record we have in our database is an existing player. force it to 
					// "stale"
					//trackers_by_link[ results[i].tracker_link ].status = 'STALE';
					trackers_by_link[ results[i].tracker_link ].rsc_id = results[i].rsc_id;
					trackers_by_link[ results[i].tracker_link ].name = results[i].name;
				}
			}
		}

		for ( let tracker_link in trackers_by_link ) {
			tracker_queue[ tracker_link ] = trackers_by_link[ tracker_link ];
		}

		console.log('finished! ' + Object.keys(tracker_queue).length);	
		return true;
	});
}

// /send_tracker_data pushes all new trackers to the official RSC
// API for storage
function send_tracker_data_to_server(tracker_id, tracker_data, pulled_by) {
	fetch('http://24.176.157.36:4443/api/v1/numbers/mmr/bulk_submit/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Api-Key ${process.env.RSC_API_KEY}`,
		},
		body: JSON.stringify({ mmrs: tracker_data })
	})
	.then(response => {
		if ( response.ok ) {
			console.log('tracker sent', tracker_data[0].tracker_link.link);
			return response.json();
		} else {
			return response.text();
			throw new Error('Processing failed');
		}
	})
	.then(data => {
		//console.log(data);
		// update the records to 1
		//res.json(data);
		if (  typeof data !== 'string' ) {
			//console.log(data);
			console.log('SAVE Tracker:', tracker_data[0].tracker_link.link, 'Auto:', SEND_TO_API_SERVER, 'TrackerId:', tracker_id, 'Pulled:', pulled_by);
			connection.query('UPDATE tracker_data SET sent_to_api = 1 WHERE id = ?', [ tracker_id ], (err, results) => {
				if ( err ) { console.error('Error updating trackers to "complete"', err); throw err; }
				//res.json(data);
				//res.json({ mmrs: tracker_data });
				return true;
			});
		} else {
			//console.log(tracker_data);
			console.error('Something went wrong');
			writeError(data);
			console.log(tracker_data);
		}
	}).catch(error => {
		console.error(error);
	});
}

function send_bad_tracker_to_server(bad_tracker_id, tracker_link) {
	fetch('http://24.176.157.36:4443/api/v1/tracker-links/invalidate_links/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			//'Authorization': `Api-Key ${process.env.RSC_API_KEY}`,
		},
		body: JSON.stringify({ links: [tracker_link] })
	})
	.then(response => {
		if ( response.ok ) {
			return response.json()
		} else {
			return response.text();
		}
	})
	.then(data => {
// update the records to 1
		if ( typeof data !== 'string' ) {
			console.log(data);
			console.log('BAD TRACKER', tracker_link);
			connection.query('UPDATE bad_trackers SET sent_to_api = 1 WHERE id = ?', [ bad_tracker_id ], (err, results) => {
				if ( err ) { console.error("error updating bad trackers!", err); throw err; }

				return true;
			});
		} else {
			console.log('Error saving bad tracker', tracker_link);
			throw new Error('Error saving the bad tracker.');
		}
	});
}

// // when we load for the first time, grab 25 trackers
// if ( SEND_TO_API_SERVER ) {
// 	grabMoreTrackers(dbConnection);
// }

router.get('/tracker/:rsc_name', (req, res) => {
	let pulled_by = req.params.rsc_name;

	let query = `
SELECT
	count(t.id) as pulls, c.name, t.pulled_by
FROM tracker_data AS t
LEFT JOIN contracts AS c ON t.pulled_by = c.name
WHERE t.pulled_by = ?
GROUP BY t.pulled_by
ORDER BY pulls DESC
	`;
	req.db.query(query, [ pulled_by ], (err, results) => {
		if ( err ) { console.error('Leaderboard error:', err); throw err; }

		let leaderboard = {};
		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				leaderboard[ results[i].pulled_by ] = { count: results[i].pulls, name: results[i].name };
			}
		}

		let badQuery = `
SELECT
	count(t.id) as pulls, c.name, t.pulled_by
FROM bad_trackers AS t
LEFT JOIN contracts AS c ON t.pulled_by = c.name
WHERE t.pulled_by = ?
GROUP BY t.pulled_by
ORDER BY pulls DESC
		`;
		req.db.query(badQuery, [ pulled_by ], (err, results) => {
			if ( err ) { console.error('Leaderboard error:', err); throw err; }

			if ( results && results.length ) {
				for ( let i = 0; i < results.length; ++i ) {
					if ( results[i].pulled_by in leaderboard ) {
						leaderboard[ results[i].pulled_by ]['count'] += results[i].pulls;
					} else {
						leaderboard[ results[i].pulled_by ] = { count: results[i].pulls, name: results[i].name };
					}
				}
			}

			if ( leaderboard[ pulled_by ] ) {
				res.json({ total: leaderboard[ pulled_by ]['count'] });
			} else {
				res.json({ total: 0 });
			}
		});
	});
});

router.get('/tracker', (req, res) => {

	let query = `
SELECT
	count(t.id) as good, t.pulled_by,
	(SELECT count(bt.pulled_by) FROM bad_trackers AS bt WHERE bt.pulled_by = t.pulled_by GROUP by bt.pulled_by) AS bad
FROM tracker_data AS t
GROUP BY t.pulled_by
ORDER BY good + bad DESC
	`;
	req.db.query(query, (err, results) => {
		if ( err ) { console.error('Leaderboard error:', err); throw err; }

		res.locals.title = 'RSC MMR Leaderboard';

		let leaderboard = {};
		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				leaderboard[ results[i].pulled_by ] = { count: results[i].good + results[i].bad, name: results[i].name };
			}
		}

		res.render('tracker', { leaderboard: leaderboard });
	});
});

/********************************************************
 ****************** TRACKER/MMR TOOL ********************
 *******************************************************/

router.get('/get_tracker', async (req, res) => {
	let DELETE = false;
	if ( req.query.delete ) {
		DELETE = true;
	}

	if ( ! SEND_TO_API_SERVER ) {
		console.log('API is Off', SEND_TO_API_SERVER);
		return res.json({ tracker: false, remaining: 0 });
	}
	let len = Object.keys(tracker_queue).length;
	console.log('getting tracker --> [' + len + ']');
	if ( len < 5 ) {
		await grabMoreTrackers(req.db);
	}

	let output = {
		version: EXTENSION_VERSION,
	};
	if ( len ) {
		let tracker_key = Object.keys(tracker_queue)[ Math.floor(Math.random() * len) ];
		output.tracker = tracker_queue[ tracker_key ];

		console.log(output.tracker.name, output.tracker.link, `Status: ${output.tracker.status}`); 
		// only "delete" the record if we're actually trying to process
		// a tracker. If I'm just testing, leave it in the array.	
		if ( DELETE ) {
			delete tracker_queue[ tracker_key ];
		}

		output.remaining = len - 1;
		return res.json(output);
	} else {
		output.tracker = false;
		output.remaining = len;
		return res.json(output);
	}
});

router.get('/send_tracker_data', (req, res) => {
	// if ( ! req.session.is_admin ) {
	// 	return res.redirect('/');
	// } 

	let limit = 25;
	if ( 'limit' in req.query ) {
		limit = parseInt(req.query.limit);
	}
// get trackers that haven't been sent
	let tracker_data_query = `
		SELECT 
			id,psyonix_season,tracker_link,rsc_id, date_pulled,
			threes_games_played,threes_rating,threes_season_peak,
			twos_games_played,twos_rating,twos_season_peak,
			ones_games_played,ones_rating,ones_season_peak
		FROM tracker_data
		WHERE sent_to_api = 0
		LIMIT ?
	`;
	req.db.query(tracker_data_query, [ limit ], (err, results) => {
		if ( err ) { console.error('Error grabbing tracker data:', err); throw err; }

		let tracker_data = [];
		let record_ids = [];
		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				record_ids.push(results[i].id);
				let td = {
					psyonix_season: results[i].psyonix_season,
					tracker_link: { link: results[i].tracker_link },
					rsc_id: results[i].rsc_id ?? '',
					date_pulled: results[i].date_pulled,
					threes_games_played: results[i].threes_games_played ?? 0,
					threes_rating: results[i].threes_rating ?? 0,
					threes_season_peak: results[i].threes_season_peak ? results[i].threes_season_peak : results[i].threes_rating,
					twos_games_played: results[i].twos_games_played ?? 0,
					twos_rating: results[i].twos_rating ?? 0,
					twos_season_peak: results[i].twos_season_peak ? results[i].twos_season_peak : results[i].twos_rating,
					ones_games_played: results[i].ones_games_played ?? 0,
					ones_rating: results[i].ones_rating ?? 0,
					ones_season_peak: results[i].ones_season_peak ? results[i].ones_season_peak : results[i].ones_rating,
				};
				for ( let key in td ) {
					if ( key.includes('_peak') || key.includes('_rating') ) {
						if ( ! td[ key ] ) {
							td[ key ] = 0;
						}
					}
				}
				tracker_data.push(td);
			}
		}

		if ( tracker_data.length ) {
// send them to api
			console.log(tracker_data);
			fetch('http://24.176.157.36:4443/api/v1/numbers/mmr/bulk_submit/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Api-Key ${process.env.RSC_API_KEY}`,
				},
				body: JSON.stringify({ mmrs: tracker_data })
			})
			.then(response => {
				if ( response.ok ) {
					console.log('here');
					return response.json();
				} else {
					return response.text();
					throw new Error('Processing failed');
				}
			})
			.then(data => {
				//console.log(data);
				// update the records to 1
				//res.json(data);
				if (  typeof data !== 'string' ) {
					//console.log(data);
					req.db.query('UPDATE tracker_data SET sent_to_api = 1 WHERE id in (?)', [ record_ids ], (err, results) => {
						if ( err ) { console.error('Error updating trackers to "complete"', err); throw err; }
						//res.json(data);
						//res.json({ mmrs: tracker_data });
						res.redirect('/');
					});
				} else {
					//console.log(tracker_data);
					res.send(data);
				}
			}).catch(error => {
				console.error(error);
			});

		} else {
			res.redirect('/');
		}
	});

});

// /send_bad_trackers fetches all bad tracker links and sends them
// to the API to be removed from the sheet
router.get('/send_bad_trackers', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 
	
// get trackers that haven't been sent
	req.db.query('SELECT id,tracker_link FROM bad_trackers WHERE sent_to_api = 0', (err, results) => {
		if ( err ) { console.error("error grabbing bad trackers!", err); throw err; }

		let bad_trackers = [];
		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				bad_trackers.push(results[i].tracker_link);
			}
		}

// send them to api
		// fetch()
		fetch('http://24.176.157.36:4443/api/v1/tracker-links/invalidate_links/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				//'Authorization': `Api-Key ${process.env.RSC_API_KEY}`,
			},
			body: JSON.stringify({ links: bad_trackers })
		})
		.then(response => response.json())
		.then(data => {
// update the records to 1
			console.log('api-response - bad trackers', data);
			req.db.query('UPDATE bad_trackers SET sent_to_api = 1', (err, results) => {
				if ( err ) { console.error("error updating bad trackers!", err); throw err; }

				res.redirect('/');
			});
		});
	});	
});

router.get('/import_trackers', async (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	// fetch all active players from contracts
	let active_players = {};
	
	// check to see if the player is active in MMS
	const doc = new GoogleSpreadsheet('1u74mgGPFPWfEiXyCnU2yj6BO9PNCKhIfyGliJvTsZw4');
	doc.useApiKey(process.env.GOOGLE_API_KEY);
	await doc.loadInfo();
	const sheet = doc.sheetsByTitle['Members'];
	const rows = await sheet.getRows();
	
	for ( let i = 0; i < rows.length; ++i ) {
		if ( ! rows[i]._rawData[0] ) {
			console.log(`Exiting at ${i}`);
			break;
		}

		let active = (rows[i]._rawData[3] === "TRUE" || rows[i]._rawData[4] === "TRUE" );
		if ( active ) {
			active_players[ rows[i]._rawData[0] ] = {
				'rscid': rows[i]._rawData[0],
				'name': rows[i]._rawData[1],
				'3s': rows[i]._rawData[3] === "TRUE",
				'2s': rows[i]._rawData[4] === "TRUE",
				'active': active,
			};
		}
	}
	console.log(`${Object.keys(active_players).length} active players across both leagues`);
	console.log('grabbing trackers from sheet');

	// 1. create google sheets object
	const trackerDoc = new GoogleSpreadsheet('1HLd_2yMGh_lX3adMLxQglWPIfRuiSiv587ABYnQX-0s');
	// 2. authenticate
	trackerDoc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await trackerDoc.loadInfo();

	const trackerSheet = trackerDoc.sheetsByTitle["Link List"];
	const trackerRows = await trackerSheet.getRows();

	let trackers = [];

	for ( let i = 0; i < trackerRows.length; i++ ) {
		let rsc_id = trackerRows[i]._rawData[0];
		let player_name = trackerRows[i]._rawData[1];
		let tracker = trackerRows[i]._rawData[2];

		if ( ! (rsc_id in active_players) ) {
			continue;
		}

		trackers.push([ rsc_id, player_name, tracker ]);
	}

	req.db.query('TRUNCATE trackers', (err, results) => {
		if ( err ) { throw err; }

		console.log('Inserting trackers', trackers.length);
		req.db.query('INSERT INTO trackers (rsc_id, name, tracker_link) VALUES ?', [trackers], (err,results) => {
			if ( err ) {
				console.error('Error inserting:',err);
			}
			res.redirect('/');
		});
	});

});

router.get('/bump_api', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	}

	console.log(`SEND_TO_API_SERVER = ${SEND_TO_API_SERVER}`);
	SEND_TO_API_SERVER = ! SEND_TO_API_SERVER;
	console.log(`Done! = ${SEND_TO_API_SERVER}`);
	res.redirect('/');
});

router.post('/bad_tracker', (req, res) => {
	const body = req.body;
	let tracker_link = body.tracker_link;
	if ( tracker_link && tracker_link.includes('profile') ) {
		let tracker_parse = tracker_link.split('profile')[1];
		tracker_parse = tracker_parse.split('/');
		let platform = tracker_parse[1];
		let player_id = tracker_parse[2];
		let queryVar = `%${platform}/${player_id}%`;
		let pulled_by = '';
		if ( 'pulled_by' in body && body.pulled_by ) {
			pulled_by = body.pulled_by.trim();
		} else {
			pulled_by = '';
		}
		req.db.query('INSERT INTO bad_trackers (tracker_link,pulled_by) VALUES (?,?)', [ tracker_link, body.pulled_by ], (err, results) => {
			if ( err ) { console.error('ERROR', err); throw err; }

			let bad_tracker_id = results.insertId;

			if ( SEND_TO_API_SERVER ) {
				try {
					send_bad_tracker_to_server(bad_tracker_id, tracker_link);
				} catch(e) {
					console.log('API SERVER ERROR!');
					console.log('API SERVER ERROR!');
					console.log('API SERVER ERROR!');
					console.log('Error:', e);
					SEND_TO_API_SERVER = false;
					console.log('API SERVER ERROR!');
					console.log('API SERVER ERROR!');
					console.log('API SERVER ERROR!');
				}
			}

			res.json({'success': true, 'ref': queryVar });
		});
	} else {
		res.json({'success': false, 'error': 'Must provide a tracker link'});
	}
});

router.post('/save_mmr', (req, res) => {
	const old_platforms = {
		'xbox': 'xbl',
		'xbl': 'xbox',
		'psn': 'ps',
		'ps': 'psn',
		'epic': 'epic',
		'steam': 'steam',
		'switch': 'switch',
	};

	const d = req.body;
	//console.log(d);
	let force_insert = false;
	let from_button  = false;
	if ( d.status && d.status == 'NEW' ) {
		force_insert = true;
		from_button  = true;
	}

	if ( d.psyonix_season === null ) {
		req.db.query('INSERT INTO bad_trackers (tracker_link,pulled_by) VALUES (?,?)', [ d.tracker_link.link, d.pulled_by ], (err, results) => {
			if ( SEND_TO_API_SERVER ) {
				send_bad_tracker_to_server(results.insertId, d.tracker_link.link); 
			}
			return res.json({ success: false, error: 'This tracker contained no data.' });
		});
	} else {

		req.db.query('SELECT id,tracker_link FROM tracker_data WHERE tracker_link = ? AND date_pulled > date_sub(now(), INTERVAL 1 day)', [ d.tracker_link.link ], (err, results) => {
			if ( err ) { console.error('Error!', err); throw err; }

			if ( results && results.length > 1 && ! force_insert ) {
				res.json({ success: false, recent: true, error: 'This tracker was recently pulled.' });
			} else if ( results && results.length > 5 && force_insert ) {
				res.json({ success: false, recent: true, error: 'This new player tracker was recently pulled.' });
			} else {
				req.db.query('SELECT rsc_id,name FROM trackers WHERE tracker_link like ? OR tracker_link LIKE ?', [ `%${d.platform}/${d.user_id}%`, `%${old_platforms[d.platform]}/${d.user_id}%` ], (err, results) => {
					if ( err ) { console.error('ERROR', err); throw err; }

					if ( (results && results.length) || force_insert === true ) {
						let rsc_id = '';
						if ( results && results.length ) {
							rsc_id = results[0].rsc_id;
						}
						let query = `
						INSERT INTO tracker_data 
							(psyonix_season,tracker_link,rsc_id,threes_games_played,threes_rating,threes_season_peak,
							twos_games_played,twos_rating,twos_season_peak,ones_games_played,ones_rating,ones_season_peak,pulled_by)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						`;
						req.db.query(
							query, 
							[ d.psyonix_season, d.tracker_link.link, rsc_id, d.threes_games_played, d.threes_rating, d.threes_season_peak,
							d.twos_games_played, d.twos_rating, d.twos_season_peak, d.ones_games_played, d.ones_rating, d.ones_season_peak, d.pulled_by ],
							(err, results) => {
								if ( err ) { console.error('Insert error:', err); throw err; }

								// send it to the server immediately
								if ( SEND_TO_API_SERVER ) {
									let tracker_data = {
										psyonix_season: d.psyonix_season,
										tracker_link: { link: d.tracker_link.link },
										rsc_id: rsc_id,
										date_pulled: new Date(),
										threes_games_played: d.threes_games_played ?? 0,
										threes_rating: d.threes_rating ?? 0,
										threes_season_peak: d.threes_season_peak ? d.threes_season_peak : d.threes_rating,
										twos_games_played: d.twos_games_played ?? 0,
										twos_rating: d.twos_rating ?? 0,
										twos_season_peak: d.twos_season_peak ? d.twos_season_peak : d.twos_rating,
										ones_games_played: d.ones_games_played ?? 0,
										ones_rating: d.ones_rating ?? 0,
										ones_season_peak: d.ones_season_peak ? d.ones_season_peak : d.ones_rating,
									};
									for ( let field in tracker_data ) {
										if ( field.includes('_peak') || field.includes('_rating') ) {
											if ( ! tracker_data[ field ] ) {
												tracker_data[ field ] = 0;
											}
										} 
									}

									try {
										send_tracker_data_to_server(results.insertId, [tracker_data], d.pulled_by);
									} catch(e) {
										SEND_TO_API_SERVER = false;
										console.log('API SERVER ERROR!');
										console.log('API SERVER ERROR!');
										console.log('API SERVER ERROR!');
										console.log('Error:', e);
										console.log('API SERVER ERROR!');
										console.log('API SERVER ERROR!');
										console.log('API SERVER ERROR!');
									}
								}

								res.json({ success: true, status: d.status });
						});
					} else {
						res.json({ success: false, not_found: true, 'error': 'This tracker is not attached to an RSC player.' });
					}
				});
			}
		});
	} // end of null data check
});
/********************************************************
 ****************** /TRACKER/MMR TOOL ********************
 *******************************************************/

module.exports = {
	SEND_TO_API_SERVER,
	EXTENSION_VERSION,
	tracker_queue,
	router,
};