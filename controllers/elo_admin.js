const express = require('express');
const router  = express.Router();
const mysqlP = require('mysql2/promise');
const { _mmrRange_3s, _mmrRange_2s, getTierFromMMR } = require('../mmrs');
const fs = require('fs');

const { GoogleSpreadsheet } = require('google-spreadsheet');

function writeError(error) {
	fs.writeFileSync('./errors.log', error + '\n', { flag: 'a+' });
}

function get_rand_word_devleague() {
	const words = [
		'octane', 'gizmo', 'breakout', 'merc', 'hotshot', 'gizmo', 'backfire',
		'x-devil', 'paladin', 'hog', 'road', 'venom', 'dominus', 'luigi', 
		'mario', 'samus', 'sweet', 'tooth', 'aftershock', 'grog', 'esper', 
		'marauder', 'masamune', 'proteus', 'ripper', 'scarab', 'takumi',
		'triton', 'vulcan', 'zippy', 'backfire', 'paladin', 'hotshot', 'gizmo',
		'animus', 'centio', 'cyclone', 'endo', 'dominusgt', 'dingo', 'diestro',
		'fennec', 'fox', 'imperator', 'jager', 'mantis', 'nimbus', 'zsr', 
		'peregrine', 'twinzer', 'sentinal', 'samurai', 'tygris', 'werewolf',
		'ecto', 'ford', 'mustang', 'nascar', 'toyota', 'chevy', 'camaro',
		'subaru', 'wrx', 'sti', 'astonmartin', 'batmobile', 'tumbler',
		'reaper', 'fiero', 'fiesta', 'jeep', 'wrangler', 'cake', 'tehblister',
		'treefrog', 'monty', 'tr1ppn', 'snacktime', 'nickm', 'rscbot', 'tinsel',
		'anthage', 'limon', 'feet', 'crimetime',
	];
	return words[ Math.floor(Math.random() * words.length) ];
}

function calculate_mmrs_devleague(team) {
	console.log('team mmr calc',team);
	if ( ! team ) { return 0; }
	if ( ! team.length ) { return 0; }
	let mmr = 0;
	for ( let i = 0; i < team.length; ++i ) {
		if ( 'season_mmr' in team[i] && team[i].season_mmr ) {
			mmr += team[i].season_mmr;
		} else if ( "mmr" in team[i] && team[i].mmr ) {
			mmr += team[i].mmr;
		}
	}

	return mmr;
}

/*******************************************************
 ******************** Admin Views *********************
 ******************************************************/
router.get('/settings', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	res.render('manage_elo', {
		stats_url: 'https://docs.google.com/spreadsheets/d/17XHJcJ64gGVBaDfkJ7FvWgE8S8-v_dg9kzcxcmpBT3E/edit?gid=483192611#gid=483192611'
	});
});

router.post('/generate', (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	const season = req.body.season;
	const k_factor = req.body.k_factor;
	const stat_sheet_id = req.body.stats_sheet_url.split('/')[5];

	console.log(`Generating MMRs for Season ${season} with k_factor ${k_factor} from ${stat_sheet_id}`);

	res.render('manage_elo', {
		stats_url: 'https://docs.google.com/spreadsheets/d/17XHJcJ64gGVBaDfkJ7FvWgE8S8-v_dg9kzcxcmpBT3E/edit?gid=483192611#gid=483192611'
	});
});

module.exports = router;
