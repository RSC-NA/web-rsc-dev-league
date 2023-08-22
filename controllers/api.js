const express = require('express');
const router  = express.Router();

/********************************************************
 ********************** API Views ***********************
 *******************************************************/
router.get('/teams', (req, res) => {
	let isTwos = req.get('league');
	if ( 'league' in req.query ) {
		isTwos = true;
	}
	let tableName = 'StreamTeamStats';
	if ( isTwos ) {
		tableName = 'StreamTeamStats2';
	}

	let query = `SELECT id, season, franchise, teamName, tier, wins, loss, winPct, \`rank\`, gm, conference, division, gamesPlayed, shotPct, points, goals, assists, saves, shots, goalDiff, oppShotPct, oppPoints, oppGoals, oppAssists, oppSaves, oppShots FROM ${tableName} ORDER BY teamName`;
	req.db.query(query, (err, results) => {
		if (err) { 
			res.json(err);
		}
		res.json(results);
	});
});
router.get('/teams/:tier', (req, res) => {
	let isTwos = req.get('league');
	if ( 'league' in req.query ) {
		isTwos = true;
	}
	let tableName = 'StreamTeamStats';
	if ( isTwos ) {
		tableName = 'StreamTeamStats2';
	}

	let query = `SELECT id, season, franchise, teamName, tier, wins, loss, winPct, \`rank\`, gm, conference, division, gamesPlayed, shotPct, points, goals, assists, saves, shots, goalDiff, oppShotPct, oppPoints, oppGoals, oppAssists, oppSaves, oppShots FROM ${tableName} WHERE tier = ? ORDER BY teamName`;
	req.db.query(query, [req.params.tier], (err, results) => {
		if (err) { 
			res.json(err);
		}
		res.json(results);
	});

});
router.get('/players', (req, res) => {
	let isTwos = req.get('league');
	if ( 'league' in req.query ) {
		isTwos = true;
	}
	let tableName = 'StreamPlayerStats';
	if ( isTwos ) {
		tableName = 'StreamPlayerStats2';
	}

	let query = `SELECT id, season, tier, teamName, playerName, gp, gw, gl, wPct, mvPs, pts, goals, assists, saves, shots, shotPct, ppg, gpg, apg, svPG, soPG, cycles, hatTricks, playmakers, saviors FROM ${tableName} ORDER BY playerName`;
	req.db.query(query, (err, results) => {
		res.json(results);
	});
});
router.get('/players/:teamName', (req, res) => {
	let isTwos = req.get('league');
	if ( 'league' in req.query ) {
		isTwos = true;
	}
	let tableName = 'StreamPlayerStats';
	if ( isTwos ) {
		tableName = 'StreamPlayerStats2';
	}

	let query = `SELECT id, season, tier, teamName, playerName, gp, gw, gl, wPct, mvPs, pts, goals, assists, saves, shots, shotPct, ppg, gpg, apg, svPG, soPG, cycles, hatTricks, playmakers, saviors FROM ${tableName} WHERE teamName = ? ORDER BY playerName`;
	req.db.query(query, [req.params.teamName], (err, results) => {
		res.json(results);
	});
});
router.get('/tiers', (req, res) => {
	let isTwos = req.get('league');
	if ( 'league' in req.query ) {
		isTwos = true;
	}
	let tiers = [ 'Premier', 'Master', 'Elite', 'Veteran', 'Rival', 'Challenger', 'Prospect', 'Contender', 'Amateur'];
	if ( isTwos ) {
		tiers = [ 'Premier', 'Elite', 'Veteran', 'Rival', 'Challenger', 'Prospect', 'Contender', 'Amateur'];
	}
	res.json( tiers.map(el => { return {'name': el} }) );
});

/********************************************************
 ********************** /API Views ***********************
 *******************************************************/

module.exports = router;
