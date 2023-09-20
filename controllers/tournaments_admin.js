const express = require('express');
const router = express.Router();

// /tournaments
// /tournament_admin/:t_id
// /tournament_admin/:t_id/start
// /tournament_team_admin/:team_id/
// /tournament_team_admin/:team_id/:player_id

router.post('/tournament/:t_id/edit', (req, res) => {
	if ( ! res.locals.is_admin && ! res.locals.is_tourney_admin ) {
		return res.redirect('/tournaments');
	}
	
	const b = req.body;
	const params = [
		b.title, b.format, b.start_dtg, b.signup_close_dtg, 
		b.team_size, b.cap_type, b.team_cap, 'allow_external' in b ? 1 : 0,
		b.description,
		req.params.t_id
	];

	const query = `
		UPDATE tournaments
		SET
			title = ?, format = ?, start_dtg = ?, signup_close_dtg = ?,
			team_size = ?, cap_type = ?, team_cap = ?, allow_external = ?,
			description = ?
		WHERE id = ?
	`;
	req.db.query(query, params, (err, _results) => {
		if ( err ) { throw err; }

		return res.redirect(`/tournament/${req.params.t_id}`);
	});
});

module.exports = router;
