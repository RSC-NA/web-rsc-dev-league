const express = require('express');
const router = express.Router();

// /tournaments
// /tournament_admin/:t_id
// /tournament_admin/:t_id/start
// /tournament_team_admin/:team_id/
// /tournament_team_admin/:team_id/:player_id

router.get('/tournaments_admin/:t_id', (req, res) => {
	res.locals.title = `${req.params.t_id} - Tournament Administration`;
	res.send('tournamen_admin - ' + req.params.t_id);
});

module.exports = router;
