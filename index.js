
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
const trackerOutput = require('./controllers/tracker');
console.log(trackerOutput);
const tracker_controller = trackerOutput.router;

const mysqlP = require('mysql2/promise');

const btoa = require('btoa');
const atob = require('atob');
const e = require('express');

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

let title = 'RSC Development League';

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
	let host = req.headers.host;
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

	// a count of how many trackers need to be
	// "sent" to the official API.
	let settings = {
		season: 17,
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
	
	let date = new Date(new Date().setHours(12)).toISOString().split('T')[0];
	res.locals.today = date;
	res.locals.match_day = false;
	if ( date in matchDays ) {
		res.locals.match_day = matchDays[date];
	}

	if ( res.locals.match_day && req.session.user_id ) {
		connection.query(
			'SELECT id,active,rostered FROM signups WHERE player_id = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
			[ req.session.user_id ],
			(err, results) => {
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

// tracker chrome extension routes
app.use(tracker_controller);

// stats api routes handled by /controllers/api.js
app.use(stats_api_controller);

// stats admin api routes handled by /controllers/api_admin.js
app.use(stats_api_admin_controller);

app.get('/test', (req, res) => {
	connection.query(
		'INSERT INTO test (server_date) VALUES (?)',
		[ new Date() ],
		(err, results) => {
			res.send('record inserted on ' + new Date(new Date().setHours(12)).toISOString());
		}
	)
});

app.listen( process.env.PORT || 3000 , () => console.log("Server running..."));