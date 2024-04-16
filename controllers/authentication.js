const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

router.use(bodyParser.text());


router.get('/login_with_discord', (req, res) => {
	const referrer = req.get('Referrer');
	if ( referrer ) {
		req.session.login_return_url = referrer;
	}
	const discord_url = `https://discord.com/api/oauth2/authorize?client_id=1006600605265055876&redirect_uri=${res.locals.callbackUrl}&response_type=code&scope=identify`;
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

router.get('/oauth2', async (req, res) => {
	const code = req.query.code;
	try {
		const params = new URLSearchParams({
			client_id: process.env.DISCORD_CLIENT_ID,
			client_secret: process.env.DISCORD_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code: code,
			redirect_uri: `${req.headers.host}/oauth2`,
			scope: 'identify'
		});
		const response = await fetch('https://discord.com/api/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params,
		});

		// You can now use accessToken to make requests to the Discord API on behalf of the user
		const data = await response.json(); 

		const token_type = data.token_type;
		const token = data.access_token;


		const user = await fetch('https://discord.com/api/users/@me', {
			headers: {
				Authorization: `${token_type} ${token}`,
			},
		});

		const user_obj = await user.json();

		if ( user_obj ) {
			const discord_id = user_obj.id;
			const nickname = user_obj.global_name;

			console.log('User Found', discord_id, nickname);

			const query = `
				SELECT 
					p.id,p.admin,p.tourney_admin,p.devleague_admin,p.stats_admin,
					p.combines_admin,c.name,c.mmr,c.tier,c.status,p.rsc_id,
					c.active_3s,c.active_2s,
					t.season,t.tier AS assigned_tier, t.count, t.keeper,
					t.base_mmr, t.effective_mmr,t.current_mmr, 
					t.wins,t.losses
				FROM players AS p 
				LEFT JOIN contracts AS c 
				ON p.discord_id = c.discord_id 
				LEFT JOIN tiermaker AS t 
				ON p.discord_id = t.discord_id
				WHERE p.discord_id = ?
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
							combines: {
								active: results[0].current_mmr ? true : false,
								season: results[0].season,
								base_mmr: results[0].base_mmr,
								effective_mmr: results[0].effective_mmr,
								current_mmr: results[0].current_mmr,
								losses: results[0].losses,
								wins: results[0].wins,
								tier: results[0].assigned_tier,
								count: results[0].count,
								keeper: results[0].keeper,
							},
							active_3s: results[0].active_3s,
							active_2s: results[0].active_2s,
							is_admin: results[0].admin ? true: false,
							is_tourney_admin: results[0].tourney_admin ? true: false,
							is_devleague_admin: results[0].devleague_admin ? true: false,
							is_stats_admin: results[0].stats_admin ? true: false,
							is_combines_admin: results[0].combines_admin ? true: false,
						};
						
						req.session.user = user;

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
						if ( ! discord_id ) {
							console.log('DISCORD_ID IS NULL', nickname);
						}
						req.db.query(
							'INSERT INTO players (nickname,discord_id) VALUES (?, ?)',
							[ nickname, discord_id ],
							function (err, _results) {
								if (err) throw err;
								
								const player_lookup_query =	`
									SELECT 
										p.id,c.name,c.mmr,c.tier,c.status,c.rsc_id,
										c.active_3s,c.active_2s,
										t.season,t.tier AS assigned_tier, t.count, t.keeper,
										t.base_mmr, t.effective_mmr,t.current_mmr, 
										t.wins,t.losses
									FROM players AS p 
									LEFT JOIN contracts AS c 
									ON p.discord_id = c.discord_id 
									LEFT JOIN tiermaker AS t 
									ON p.discord_id = t.discord_id
									WHERE p.discord_id = ?`;
								req.db.query(player_lookup_query, [discord_id], (err, results) => {

										const user = {
											user_id: results[0].id,
											nickname: nickname,
											name: results[0].name,
											mmr: results[0].mmr,
											tier: results[0].tier,
											status: results[0].status,
											rsc_id: results[0].rsc_id,
											discord_id: discord_id,
											combines: {
												active: results[0].current_mmr ? true : false,
												season: results[0].season,
												base_mmr: results[0].base_mmr,
												effective_mmr: results[0].effective_mmr,
												current_mmr: results[0].current_mmr,
												losses: results[0].losses,
												wins: results[0].wins,
												tier: results[0].assigned_tier,
												count: results[0].count,
												keeper: results[0].keeper,
											},
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
											return res.redirect(req.session.login_return_url);
										} else {
											return res.redirect('/');
										}
								});
							}
						);
					}
				}
			);
		} else {
			console.log(user_obj, 'does not exist');
			return res.redirect('/');
		}

	} catch (error) {
		console.error('Error exchanging code for token:', error);
		return res.status(500).send('Error logging in');
	}
});

router.get('/callback', (req, res) => {
	res.json(req.body);
});

router.get('/process_login', (req, res) => {
});

module.exports = router;
