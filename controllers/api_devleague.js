const express = require('express');
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.use((req, res, next) => {
	res.locals.discord_id = null;
	res.locals.player_id = null;
	res.locals.checked_in = false;
	
	if ( req.method === 'GET') {
		res.locals.discord_id = req.query.discord_id;
	} else {
		res.locals.discord_id = req.body.discord_id;
	}
	if ( res.locals.discord_id ) {
		req.db.query('SELECT id FROM players WHERE discord_id = ?', [res.locals.discord_id], (err,results) => {
			if ( err ) { throw err; }
			
			console.log('	player_info', results);
			if ( results && results[0] ) {
				res.locals.player_id = results[0].id;
				console.log('	Found Player Id', res.locals.player_id, res.locals.settings.season, res.locals.match_day);

				req.db.query('SELECT id FROM signups WHERE player_id = ? AND season = ? AND match_day = ?', [
					res.locals.player_id,
					res.locals.settings.season,
					res.locals.match_day
				], (err, results) => {
					if ( err ) { throw err; }

					if ( results && results[0] ) {
						res.locals.checked_in = results[0].id ? true : false;
					}

					console.log('	checked_in?', res.locals.checked_in);
					next();
				});
			}
			console.log('	no signup info');
			next();
		});
	} else {
		console.log('No discord_id provided');	
		next();
	}
});

router.all('/check_in', (req, res) => {
	// TODO(get season and match day from somewhere)
	const season = res.locals.settings.season;
	const discord_id = res.locals.discord_id;
	const match_day = res.locals.match_day;

	if ( ! res.locals.checked_in ) {
		req.db.query('SELECT active_3s,status FROM contracts WHERE discord_id = ?', [discord_id], (err, results) => {
			if ( err ) { throw err; }

			if ( results && results[0] ) {
				const active = results[0].status == 'Free Agent' ? 1 : 0;
				const status = results[0].status;

				req.db.query(
					'INSERT INTO signups (player_id, signup_dtg, season, match_day, active, status) VALUES (?, ?, ?, ?, ?, ?)',
					[ req.session.user_id, new Date(), season, match_day, active, status],
					function(err, _results) {
						if ( err ) throw err;

						req.session.checked_in = true;

						return res.json({ 'success': 'You are checked in!' });
					}
				);
			}
		});
	} else {
		return res.json({'error': 'You are already checked in.'});
	}

});

router.get('/check_out', (req, res) => {
	// TODO(get season and match day from somewhere)
	const discord_id = res.locals.discord_id;
	const match_day = res.locals.match_day;
	const player_id = res.locals.player_id;

	console.log('	check_out', player_id, discord_id, match_day);

	if ( res.locals.checked_in ) {
		console.log('	deleting the record');
		req.db.query(
			'DELETE FROM signups WHERE player_id = ? AND match_day = ? AND ( DATE(signup_dtg) = CURDATE() OR DATE_ADD(DATE(signup_dtg), INTERVAL 1 DAY) = CURDATE() )',
			[ player_id, match_day ],
			function(err, _results) {
				if ( err ) throw err;

				return res.json({'success': 'You are checked out.'});
			}
		);
	} else {
		return res.json({'error': 'You were not checked in.' });
	}
});

module.exports = router;
