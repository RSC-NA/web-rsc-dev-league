
// Server app code below
const express = require('express');
const app = express();
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const connection = require('./core/database').databaseConnection;

// controllers
const auth_controller = require('./controllers/authentication');
const devleague_controller = require('./controllers/devleague');
const devleague_admin_controller = require('./controllers/devleague_admin');
const stats_api_controller = require('./controllers/api');
const stats_api_admin_controller = require('./controllers/api_admin');
const player_controller = require('./controllers/player');

/* tournament controllers */
const tournaments_controller = require('./controllers/tournaments');
const tournaments_admin_controller = require('./controllers/tournaments_admin');

// csv output
const { stringify } = require('csv-stringify');

/* DEPRECATED. REMOVE SOON 
const mysqlP = require('mysql2/promise');
const btoa = require('btoa');
const atob = require('atob');
const e = require('express');
*/

const API_HOST = '24.151.184.156';

// pull in our two manually defined configuration objects
// TODO(erh): this can probably be moved into a database table
const matchDays = require('./matchDays');
const { mmrRange, getTierFromMMR } = require('./mmrs');

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

const { GoogleSpreadsheet } = require('google-spreadsheet');

require('dotenv').config();

app.use( express.urlencoded({ extended: true }) );

const title = 'RSC Development League';
const description = 'Welcome to the RSC Development League! Matches are open to all active players in RSC and run at 8:15 on match nights.';

// set up session
app.use(session({
	secret: 'rsc-dev-league',
	resave: true,
	saveUninitialized: true
}));

app.use(cors({
	origin: '*'
}));

app.use( express.static('static') ); 
app.set('view engine', 'ejs');

app.use(bodyParser.json());

// grab a DB handle and attach it to our req
app.use((req, res, next) => {
	req.db = connection;

	next();
});

// correct server URL middleware
// TODO(erh): Once I shut down heroku, we can turn this off
app.use((req, res, next) => {
	// if you want to run this program locally, make sure you
	// either comment this section out, or add a check for 'localhost'
	// as the host
	const host = req.headers.host;
	if ( ! (host == 'devleague.rscstream.com' || host == 'api.rscstream.com') ) {
		return res.redirect('https://devleague.rscstream.com');
	}

	next();
});

// primary middleware -- check user session, set up local vars
// for templates, etc. 
//
// this middleware also fetches the "settings" from the database
// configured in the /manage_league route
app.use((req, res, next) => {
	res.locals.requestUrl = req.originalUrl;

	res.locals.menu = {
		'dashboard': '',
		'tracker': '',
		'match': '',
		'process_gameday': '',
		'matches': '',
		'manage_league': '',
	};

	console.log('url: ' + req.originalUrl);
	let current_view = req.originalUrl.split('/')[1];
	if ( current_view == '' ) { current_view = 'dashboard'; }
	if ( current_view in res.locals.menu ) {
		res.locals.menu[ current_view ] = 'active';
	}

	res.locals.callbackUrl = encodeURIComponent('https://devleague.rscstream.com/oauth2');

	res.locals.user_id = req.session.user_id;
	res.locals.nickname = req.session.nickname;
	res.locals.discord_id = req.session.discord_id;
	res.locals.is_admin = req.session.is_admin;
	res.locals.user = req.session.user || {};
	res.locals.rostered = req.session.rostered;

	res.locals.SEND_TO_API_SERVER = SEND_TO_API_SERVER;

	res.locals.title = title;
	res.locals.description = description;

	// a count of how many trackers need to be
	// "sent" to the official API.
	let settings = {
		season: 18,
		premier: false,
		master: false,
		elite: false,
		veteran: false,
		rival: false,
		challenger: false,
		prospect: false,
		contender: false,
		amateur: false
	};

	res.locals.settings = settings;

	let tiersQuery = 'SELECT season,amateur,contender,prospect,challenger,rival,veteran,elite,master,premier FROM league_settings ORDER BY id DESC LIMIT 1';
	connection.query(tiersQuery, (err, results) => {
		if ( err ) { throw err; }

		if ( results.length ) {
			res.locals.settings = {
				season: results[0].season,
				amateur: results[0].amateur, 
				contender: results[0].contender,
				prospect: results[0].prospect,
				challenger: results[0].challenger,
				rival: results[0].rival,
				veteran: results[0].veteran,
				elite: results[0].elite,
				master: results[0].master,
				premier: results[0].premier,
			};
		}
		next();
	});
});

// checked in middleware.
// only really needed if the user is logged in AND it's a game day
app.use((req, res, next) => {
	res.locals.checked_in = false;
	
	const date = new Date(new Date().setHours(12)).toISOString().split('T')[0];
	res.locals.today = date;
	res.locals.match_day = false;
	if ( date in matchDays ) {
		res.locals.match_day = matchDays[date];
	}

	if ( res.locals.match_day && req.session.user_id ) {
		connection.query(
			'SELECT id,active,rostered FROM signups WHERE player_id = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
			[ req.session.user_id ],
			(_err, results) => {
				if ( results && results.length > 0 ) {
					req.session.checked_in = true;
					req.session.rostered = results[0].rostered;
					res.locals.checked_in = req.session.checked_in;
					res.locals.rostered = req.session.rostered;
					next();
				} else {
					next();
				}
			}
		);
	} else {
		next();
	}
});

// fetch a count of pending trackers
app.use((req, res, next) => {
	res.locals.pending_trackers = 0;
	res.locals.bad_pending_trackers = 0;
	if ( req.session.is_admin ) {
		connection.query('SELECT count(id) AS pending_trackers FROM tracker_data WHERE sent_to_api = 0', (err, results) => {
			if ( err ) { console.error('Error fetching tracker count:', err); throw err; }

			res.locals.pending_trackers = results[0].pending_trackers;

			connection.query('SELECT count(id) AS bad_pending_trackers FROM bad_trackers WHERE sent_to_api = 0', (err, results) => {
				if ( err ) { console.error('Error fetching bad tracker count:', err); throw err; }
			
				res.locals.bad_pending_trackers = results[0].bad_pending_trackers;

				next();
			});
		});
	} else {
		next();
	}
});

// express setup

/*******************************************************
 ******************** Player Views *********************
 ******************************************************/
app.get('/', (req, res) => {
	// TODO(load template)
	res.render('dashboard', { match_days: matchDays });
});

// Authentication handled by /controllers/authentication.js
app.use(auth_controller);

// dev league functions for players are handled by /controllers/devleague.js
app.use(devleague_controller);
app.use(devleague_admin_controller);

// stats api routes handled by /controllers/api.js
app.use(stats_api_controller);

// stats admin api routes handled by /controllers/api_admin.js
app.use(stats_api_admin_controller);

// player routes controlled by /controllers/players.js
app.use(player_controller);

// tournaments
app.use(tournaments_controller);
app.use(tournaments_admin_controller);

app.get('/test', (_req, res) => {
	res.send('record inserted on ' + new Date(new Date().setHours(12)).toISOString());
});

/*
 * RSC_ID -> Numbers output
 */
app.get('/mmr/:rsc_id', (req, res) => {
	const query = `
SELECT 
	psyonix_season,tracker_link,rsc_id,
	threes_games_played as gp_3s, threes_rating as mmr_3s, threes_season_peak as peak_3s,
	twos_games_played as gp_2s, twos_rating as mmr_2s, twos_season_peak as peak_2s,
	ones_games_played as gp_1s, ones_rating as mmr_1s, ones_season_peak as peak_1s,
	date_pulled, pulled_by
FROM tracker_data
WHERE rsc_id = ?
ORDER BY psyonix_season DESC
	`;
	connection.query(query, [ req.params.rsc_id ], (err, results) => {
		if ( err ) { return res.send(`Error: ${err}`); }
			
		if ( 'json' in req.query ) {
			return res.json(results);
		}

		return res.render('mmr', { pulls: results });
	});
});

/*
 * RSC ID Player Name Tracker Link 1s MMR 1s Season Peak 1s GP 2s MMR 2s Season Peak 2s GP 3s MMR 3s Season Peak 3s GP Date Pulled
 */ 
app.get('/numbers/:date', (req, res) => {
	const date = req.params?.date ?? '2023-01-01';
	const query = `
SELECT 
	td.id, t.rsc_id as "RSC ID",t.name AS "Player Name",td.tracker_link AS "Tracker Link",
	ones_rating AS "1s MMR",ones_season_peak AS "1s Season Peak",ones_games_played AS "1s GP",
	twos_rating AS "2s MMR",twos_season_peak AS "2s Season Peak",twos_games_played AS "2s GP",
	threes_rating AS "3s MMR",threes_season_peak AS "3s Season Peak",threes_games_played AS "3s GP",
	td.date_pulled AS "Date Pulled", td.psyonix_season AS "Psyonix Season"
FROM 
	tracker_data AS td
LEFT JOIN
	trackers AS t ON td.tracker_link = t.tracker_link OR td.rsc_id = t.rsc_id
WHERE td.date_pulled > ? AND t.name IS NOT NULL AND t.rsc_id IS NOT NULL
GROUP BY td.id, t.rsc_id, t.name
ORDER BY td.rsc_id, td.psyonix_season
	`;
	connection.query(query, [ date ], (err, results) => {
		if ( err ) {
			res.send(err);
		}
		res.header('Content-type', 'text/csv');
		res.attachment(`MMR Pull from ${date}.csv`);
		const columns = [
			'RSC ID', 'Player Name', 'Tracker Link', 
			'1s MMR', '1s Season Peak', '1s GP',
			'2s MMR', '2s Season Peak', '2s GP',
			'3s MMR', '3s Season Peak', '3s GP',
			'Date Pulled', 'Psyonix Season'
		];
		const stringifier = stringify({ header: true, columns: columns });
		stringifier.pipe(res);
		for ( let i = 0; i < results.length; ++i ) {
			results[i]["Date Pulled"] = new Date(results[i]['Date Pulled']).toString();
			if ( parseInt(results[i]['Psyonix Season']) <= 23 ) {
				results[i]['1s GP'] = 0;
				results[i]['2s GP'] = 0;
				results[i]['3s GP'] = 0;
			}
			stringifier.write(results[i]);
		}
		stringifier.end();
	});
});

// FLAG TO SEND TRACKER DATA STRAIGHT TO THE API.
// THIS WILL BE SET TO true AT RUNTIME, AND IF 
// THE SERVER EVER CRASHES, IT WILL BE FLIPPED TO FALSE
let SEND_TO_API_SERVER = true;
const EXTENSION_VERSION = '2.6.2';
const tracker_queue = {};

async function grabMoreTrackers() {
	let error = false;
	console.log(`Grabbing more trackers [${Object.keys(tracker_queue).length}]`);
	const url = `http://${API_HOST}:4443/api/v1/tracker-links/next/?format=json&limit=25`;
	const response = await fetch(url).catch(e => {console.log(`Error: ${e}`); error = true; });
	if ( error ) {
		console.log("Error fetching more trackers. Aborting...");
		return false;
	}
	const trackers = await response.json();

	const trackers_by_link = {};
	console.log('grabbed some trackers = ' + trackers.length);
	for ( let i = 0; i < trackers.length; ++i ) {
		if ( trackers[i].link in tracker_queue ) {
			continue;
		}
		trackers_by_link[ trackers[i].link ] = trackers[i];
	}
	console.log('have ' + Object.keys(trackers_by_link).length + ' trackers to use');
	const tracker_links = Object.keys(trackers_by_link);
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

		for ( const tracker_link in trackers_by_link ) {
			tracker_queue[ tracker_link ] = trackers_by_link[ tracker_link ];
		}

		console.log('finished! ' + Object.keys(tracker_queue).length);	
		return true;
	});
}

// /send_tracker_data pushes all new trackers to the official RSC
// API for storage
function send_tracker_data_to_server(tracker_id, tracker_data, pulled_by) {
	fetch(`http://${API_HOST}:4443/api/v1/numbers/mmr/bulk_submit/`, {
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
		}
	})
	.then(data => {
		//console.log(data);
		// update the records to 1
		//res.json(data);
		if (  typeof data !== 'string' ) {
			//console.log(data);
			if ( tracker_id !== 'from_api' ) {
				console.log('SAVE Tracker:', tracker_data[0].tracker_link.link, 'Auto:', SEND_TO_API_SERVER, 'TrackerId:', tracker_id, 'Pulled:', pulled_by);
				connection.query('UPDATE tracker_data SET sent_to_api = 1 WHERE id = ?', [ tracker_id ], (err, results) => {
					if ( err ) { console.error('Error updating trackers to "complete"', err); throw err; }
					//res.json(data);
					//res.json({ mmrs: tracker_data });
					return true;
				});
			} else {
				console.log("From API, skipping updates");
				return true;
			}
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
	fetch(`http://${API_HOST}:4443/api/v1/tracker-links/invalidate_links/`, {
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
			if ( 'count' in data && data.count === 0 ) {
				console.log('fixing url?', tracker_link);
				if ( tracker_link.includes('/overview') ) {
					return send_bad_tracker_to_server(bad_tracker_id, tracker_link.replace('/overview', ''));
				}
			}
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
	}).catch(e => {
		console.log('Error sending back tracker to server.');
	});
}

// when we load for the first time, grab 25 trackers
if ( SEND_TO_API_SERVER ) {
	grabMoreTrackers();
}

app.get('/tracker/:rsc_name', (req, res) => {
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
	connection.query(query, [ pulled_by ], (err, results) => {
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
		connection.query(badQuery, [ pulled_by ], (err, results) => {
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

app.get('/tracker', (req, res) => {

	let query = `
SELECT
	count(t.id) as good, t.pulled_by,
	(SELECT count(bt.pulled_by) FROM bad_trackers AS bt WHERE bt.pulled_by = t.pulled_by GROUP by bt.pulled_by) AS bad
FROM tracker_data AS t
GROUP BY t.pulled_by
ORDER BY good + bad DESC
	`;
	connection.query(query, (err, results) => {
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

app.get('/get_tracker', async (req, res) => {
	let DELETE = false;
	if ( req.query.delete ) {
		DELETE = true;
	}

	if ( ! SEND_TO_API_SERVER ) {
		console.log('API is Off', SEND_TO_API_SERVER);
		return res.json({ tracker: false, remaining: 0 });
	}
	const len = Object.keys(tracker_queue).length;
	console.log('getting tracker --> [' + len + ']');
	if ( len < 5 ) {
		await grabMoreTrackers();
	}

	const output = {
		version: EXTENSION_VERSION,
	};
	if ( len ) {
		const tracker_key = Object.keys(tracker_queue)[ Math.floor(Math.random() * len) ];
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

app.get('/send_tracker_data', (req, res) => {
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
	connection.query(tracker_data_query, [ limit ], (err, results) => {
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
			fetch(`http://${API_HOST}:4443/api/v1/numbers/mmr/bulk_submit/`, {
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
					connection.query('UPDATE tracker_data SET sent_to_api = 1 WHERE id in (?)', [ record_ids ], (err, results) => {
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
app.get('/send_bad_trackers', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 
	
// get trackers that haven't been sent
	connection.query('SELECT id,tracker_link FROM bad_trackers WHERE sent_to_api = 0', (err, results) => {
		if ( err ) { console.error("error grabbing bad trackers!", err); throw err; }

		const bad_trackers = [];
		if ( results && results.length ) {
			for ( let i = 0; i < results.length; ++i ) {
				bad_trackers.push(results[i].tracker_link);
			}
		}

// send them to api
		// fetch()
		fetch(`http://${API_HOST}:4443/api/v1/tracker-links/invalidate_links/`, {
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
			connection.query('UPDATE bad_trackers SET sent_to_api = 1', (err, results) => {
				if ( err ) { console.error("error updating bad trackers!", err); throw err; }

				res.redirect('/');
			});
		}).catch(e => {
			console.log('ERROR SENDING TRACKERS TO API SERVER:', e);
		});
	});	
});

app.get('/import_trackers', async (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	} 

	// fetch all active players from contracts
	const active_players = {};
	
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

		const active = (rows[i]._rawData[3] === "TRUE" || rows[i]._rawData[4] === "TRUE" );
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

	connection.query('TRUNCATE trackers', (err, results) => {
		if ( err ) { throw err; }

		console.log('Inserting trackers', trackers.length);
		connection.query('INSERT INTO trackers (rsc_id, name, tracker_link) VALUES ?', [trackers], (err,results) => {
			if ( err ) {
				console.error('Error inserting:',err);
			}
			res.redirect('/');
		});
	});

});

app.get('/bump_api', (req, res) => {
	if ( ! req.session.is_admin ) {
		return res.redirect('/');
	}

	console.log(`SEND_TO_API_SERVER = ${SEND_TO_API_SERVER}`);
	SEND_TO_API_SERVER = ! SEND_TO_API_SERVER;
	console.log(`Done! = ${SEND_TO_API_SERVER}`);
	res.redirect('/');
});

app.post('/bad_tracker', (req, res) => {
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
		connection.query('INSERT INTO bad_trackers (tracker_link,pulled_by) VALUES (?,?)', [ tracker_link, body.pulled_by ], (err, results) => {
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

app.post('/save_mmr', (req, res) => {

	let delete_today = false;
	if ( 'first' in req.query ) {
		console.log("WE'RE GOING TO DELETE!");
		delete_today = true;
	}

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
	const from_api = req.body?.from_api ? req.body.from_api : false;
	if ( d.status && d.status == 'NEW' ) {
		force_insert = true;
		from_button  = true;
	}

	const decoded_user_id = decodeURIComponent(req.body.user_id);

	const tracker_data = {
		psyonix_season: d.psyonix_season,
		tracker_link: { link: d.tracker_link.link },
		rsc_id: null,
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
	for ( const field in tracker_data ) {
		if ( field.includes('_peak') || field.includes('_rating') ) {
			if ( ! tracker_data[ field ] ) {
				tracker_data[ field ] = 0;
			}
		} 
	}

	if ( d.psyonix_season === null ) {
		connection.query('INSERT INTO bad_trackers (tracker_link,pulled_by) VALUES (?,?)', [ d.tracker_link.link, d.pulled_by ], (err, results) => {
			if ( SEND_TO_API_SERVER ) {
				send_bad_tracker_to_server(results.insertId, d.tracker_link.link); 
			}
			return res.json({ success: false, error: 'This tracker contained no data.' });
		});
	} else {
		let recent_query = 'SELECT id,tracker_link FROM tracker_data WHERE tracker_link = ? AND date_pulled > date_sub(now(), INTERVAL 1 day)';	
		if ( delete_today ) {
			console.log('prepare for deleting... :)');
			recent_query = 'DELETE FROM tracker_data WHERE tracker_link = ? AND date_pulled > date_sub(now(), INTERVAL 1 day)';
		}
		connection.query(recent_query, [ d.tracker_link.link ], (err, results) => {
			if ( err ) { console.error('Error!', err); throw err; }

			if ( ! delete_today && results && results.length > 5 && ! force_insert ) {
				res.json({ success: false, recent: true, error: 'This tracker was recently pulled.' });
			} else if ( ! delete_today && results && results.length > 15 && force_insert ) {
				res.json({ success: false, recent: true, error: 'This new player tracker was recently pulled.' });
			} else {
				console.log('Huh?', d.platform, d.user_id, `%${d.platform}/${d.user_id}%`);
				connection.query('SELECT rsc_id,name FROM trackers WHERE tracker_link like ? OR tracker_link LIKE ? OR tracker_link LIKE ?', 
					[ `%${d.platform}/${d.user_id}%`, `%${old_platforms[d.platform]}/${d.user_id}%`, `%${d.platform}/${decoded_user_id}%` ], (err, results) => {
					if ( err ) { console.error('ERROR', err); throw err; }

					if ( (results && results.length) || force_insert === true ) {
						let rsc_id = '';
						if ( results && results.length ) {
							rsc_id = results[0].rsc_id;
						}

						const query = `
						INSERT INTO tracker_data 
							(psyonix_season,tracker_link,rsc_id,threes_games_played,threes_rating,threes_season_peak,
							twos_games_played,twos_rating,twos_season_peak,ones_games_played,ones_rating,ones_season_peak,pulled_by)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						`;
						connection.query(
							query, 
							[ d.psyonix_season, d.tracker_link.link, rsc_id, d.threes_games_played, d.threes_rating, d.threes_season_peak,
							d.twos_games_played, d.twos_rating, d.twos_season_peak, d.ones_games_played, d.ones_rating, d.ones_season_peak, d.pulled_by ],
							(err, results) => {
								if ( err ) { console.error('Insert error:', err); throw err; }

								// send it to the server immediately
								tracker_data.rsc_id = rsc_id;
								if ( SEND_TO_API_SERVER ) {
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
					} else if ( from_api ) {
							try {
								// We are going to force the update to the API
								// even though we don't have this record locally.
								send_tracker_data_to_server('from_api', [tracker_data], d.pulled_by);
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
							res.json({ 
								success: true, 
								status: d.status, 
								from_api: from_api,
								message: 'Forced an update to API because it came from them.',
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

app.listen( process.env.PORT || 3000 , () => console.log("Server running..."));
