const express = require('express');
const router = express.Router();


router.get('/login_with_discord', (req, res) => {
	const referrer = req.get('Referrer');
	if ( referrer ) {
		req.session.login_return_url = referrer;
	}
	const discord_url = `https://discord.com/api/oauth2/authorize?client_id=1006600605265055876&redirect_uri=${res.locals.callbackUrl}&response_type=token&scope=identify`;
	res.redirect(discord_url);
});

router.get('/login', (_req, res) => {
	res.render('login');
});

router.get('/logout', (req, res) => {
	if ( req.session ) {
		req.session.destroy(err => {
			if ( err ) {
				res.status(400).send('Unable to log out');
			} else {
				res.redirect('/');
			}
		});
	} else {
		res.redirect('/');
	}
});

router.get('/oauth2', (_req, res) => {
	res.render('login');
});

router.get('/callback', (req, res) => {
	res.json(req.body);
});

router.get('/process_login', (req, res) => {
	if ( ! req.query.rsc ) {
		res.redirect('/');
	}

	const token = atob(req.query.rsc).split(':');

	// 1. check DB for existing user, if it exists, create session and redirect
	const nickname = token[0] + '#' + token[1];
	const discord_id = token[2];
	
	const query = `
		SELECT 
			p.id,p.admin,p.tourney_admin,p.devleague_admin,p.stats_admin,
			p.combines_admin,c.name,c.mmr,c.tier,c.status,p.rsc_id,
			c.active_3s,c.active_2s 
		FROM players AS p 
		LEFT JOIN contracts AS c 
		ON p.discord_id = c.discord_id WHERE p.discord_id = ?
	`;
	req.db.query(
		query, 
		[ discord_id ],
		function(err, results) {
			if ( err ) {
				console.error(err);
				throw err;
			}

			let exists = false;
			if ( results.length ) {
				exists = true;
				req.session.nickname = nickname;
				req.session.discord_id = discord_id;
				req.session.user_id = results[0].id;

				const user = {
					user_id: results[0].id,
					nickname: nickname,
					name: results[0].name,
					mmr: results[0].mmr,
					tier: results[0].tier,
					status: results[0].status,
					rsc_id: results[0].rsc_id,
					discord_id: discord_id,
					active_3s: results[0].active_3s,
					active_2s: results[0].active_2s,
					is_admin: results[0].admin ? true: false,
					is_tourney_admin: results[0].tourney_admin ? true: false,
					is_devleague_admin: results[0].devleague_admin ? true: false,
					is_stats_admin: results[0].stats_admin ? true: false,
					is_combines_admin: results[0].combines_admin ? true: false,
				};

				req.session.user = user;
				console.log(user);

				req.session.is_admin = results[0].admin ? true : false;
				req.session.is_tourney_admin = results[0].tourney_admin ? true: false;
				req.session.is_devleague_admin = results[0].devleague_admin ? true: false;
				req.session.is_stats_admin = results[0].stats_admin ? true: false;
				req.session.is_combines_admin = results[0].combines_admin ? true: false;
				if ( req.session.login_return_url ) {
					res.redirect(req.session.login_return_url);
				} else {
					res.redirect('/');
				}
			}

			// user doesn't exist, create the account.
			if ( ! exists ) {
				req.db.query(
					'INSERT INTO players (nickname,discord_id) VALUES (?, ?)',
					[ nickname, discord_id ],
					function (err, _results) {
						if (err) throw err;
						
						req.db.query(
							'SELECT p.id,c.name,c.mmr,c.tier,c.status,c.rsc_id,c.active_3s,c.active_2s FROM players AS p LEFT JOIN contracts AS c on p.discord_id = c.discord_id WHERE p.discord_id = ?',
							[ discord_id ],
							(_err, results) => {
								const user = {
									user_id: results[0].id,
									nickname: nickname,
									name: results[0].name,
									mmr: results[0].mmr,
									tier: results[0].tier,
									status: results[0].status,
									rsc_id: results[0].rsc_id,
									discord_id: discord_id,
									active_3s: results[0].active_3s ? true : false,
									active_2s: results[0].active_2s ? true : false,
									is_admin: false,
									is_tourney_admin: false,
									is_devleague_admin: false,
									is_stats_admin: false,
									is_combines_admin: false,
								};
				
								req.session.user = user;
								req.session.is_admin = false;
								req.session.is_tourney_admin = false;
								req.session.is_devleague_admin = false;
								req.session.is_stats_admin = false;
								req.session.is_combines_admin = false;
								if ( req.session.login_return_url ) {
									res.redirect(req.session.login_return_url);
								} else {
									res.redirect('/');
								}
						});
					}
				);
			}
		}
	);
});

module.exports = router;
