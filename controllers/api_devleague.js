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

	console.log("\n", '--- START OF API ROUTE ---');

	if ( res.locals.discord_id ) {
		req.db.query('SELECT id FROM players WHERE discord_id = ?', [res.locals.discord_id], (err,results) => {
			if ( err ) { throw err; }
			
			//console.log('1. player_info', results);
			if ( results && results[0] ) {
				res.locals.player_id = results[0].id;
				console.log('2. Found Player Id', res.locals.player_id, res.locals.settings.season, res.locals.match_day);

				req.db.query('SELECT id FROM signups WHERE player_id = ? AND season = ? AND match_day = ?', [
					res.locals.player_id,
					res.locals.settings.season,
					res.locals.match_day
				], (err, results) => {
					if ( err ) { throw err; }
					
					//console.log('3. do we have signup info?', results);
					if ( results && results[0] ) {
						res.locals.checked_in = results[0].id ? true : false;
					}

					//console.log('4. checked_in?', res.locals.checked_in);
					next();
				});
			} else {
				const contract_query = 'SELECT id,rsc_id,name,tier,status FROM contracts WHERE discord_id = ?';
				req.db.query(contract_query, [res.locals.discord_id], (err, results) => {
					if ( err ) { throw err; }

					if ( results && results.length ) {
						const p = results[0];

						const new_query = 'INSERT INTO players (nickname,discord_id) VALUES (?, ?)';
						req.db.query(new_query, [p.name, res.locals.discord_id], (err, results) => {
							if ( err ) { throw err; }

							res.locals.player_id = results.insertId;
							res.locals.checked_in = false;

							next();
						});
					} else {
						next();
					}
				});
			}
		});
	} else {
		//console.log('6. No discord_id provided');	
		next();
	}
});

router.all('/status', (req, res) => {
	// TODO(get season and match day from somewhere)
	const season = res.locals.settings.season;
	const discord_id = res.locals.discord_id;
	const match_day = res.locals.match_day;

	req.db.query('SELECT rsc_id,name,tier,active_3s,status FROM contracts WHERE discord_id = ?', [discord_id], (err, results) => {
		if ( err ) { throw err; }

		if ( results && results[0] ) {
			const active = results[0].status == 'Free Agent' ? 1 : 0;
			const status = results[0].status;
			
			return res.json({
				'player': results[0].name,
				'rsc_id': results[0].rsc_id,
				'tier': results[0].tier,
				'checked_in': res.locals.checked_in,
			});
		} else {
			return res.json({
				'error': 'Player not found',
				'discord_id': discord_id,
			});
		}
	});
});

router.all('/check_in', (req, res) => {
	// TODO(get season and match day from somewhere)
	const season = res.locals.settings.season;
	const discord_id = res.locals.discord_id;
	const match_day = res.locals.match_day;
	const player_id = res.locals.player_id;

	if ( ! discord_id ) {
		return res.json({'error': 'You must provide a discord_id'});
	}
	
	if ( ! player_id ) {
		return res.json({'error': `Player with discord_id ${discord_id} not found.`, 'message': "If you are a player, go to https://devleague.rscna.com/login_with_discord to create your account.", url: 'https://devleague.rscna.com/login_with_discord' });
	}

	if ( ! res.locals.checked_in ) {

		req.db.query('SELECT active_3s,status,name FROM contracts WHERE discord_id = ?', [discord_id], (err, results) => {
			if ( err ) { throw err; }

			if ( results && results[0] ) {
				const active = results[0].status == 'Free Agent' ? 1 : 0;
				const status = results[0].status;

				req.db.query(
					'INSERT INTO signups (player_id, signup_dtg, season, match_day, active, status) VALUES (?, ?, ?, ?, ?, ?)',
					[ player_id, new Date(), season, match_day, active, status],
					function(err, _results) {
						if ( err ) throw err;

						req.session.checked_in = true;
						console.log('Check in complete -', discord_id, results[0].name);
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

	//console.log('7. check_out', res.locals.checked_in, player_id, discord_id, match_day);
	if ( ! discord_id ) {
		return res.json({'error': 'You must provide a discord_id'});
	}

	if ( res.locals.checked_in ) {
		//console.log('8. deleting the record');
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
