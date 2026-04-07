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

router.post('/generate', async (req, res) => {
	if ( ! req.session.is_admin && ! req.session.is_devleague_admin ) {
		return res.redirect('/');
	}

	// 135E24RWpTJqBdFqwoD4dOU0O_hb0KALtsv_gBVBYNlo
	const db = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

	const season = req.body.season;
	const k_factor = req.body.k_factor;
	const stat_sheet_id = req.body.stats_sheet_url.split('/')[5];

	console.log(`Generating MMRs for Season ${season} with k_factor ${k_factor} from ${stat_sheet_id}`);

	const doc = new GoogleSpreadsheet(stat_sheet_id);
	doc.useApiKey(process.env.GOOGLE_API_KEY);
	await doc.loadInfo();

	const sheet = doc.sheetsByTitle["Stats"];
	const rows = await sheet.getRows();

	if ( ! rows ) {
		return res.json({'error': 'Google sheet rows was empty. :(', });
	}

	const row_count = sheet.rowCount;
	console.log(`THIS SHEET HAS ${row_count} ROWS`);

	const players = {};
	const game_data = {};
	let match = null;

	const games = {};
	for ( let i = 0; i < rows.length; i += 6 ) {
		const p = rows[i];
		const team_key = p.Team.replaceAll(' ', '_');
		const away_key = p['Team Against'].replaceAll(' ', '_');
		const match_num = `m${p['Match #']}`;
		const match_key = `${team_key}-${away_key}-${match_num}`; 

		if ( ! ( p.Tier in games ) ) {
			games[p.Tier] = {};
		}

		if ( ! ( match_num in games[p.Tier]) ) {
			games[p.Tier][match_num] = [];
		}

		games[p.Tier][match_num] = {
			home: p.Team,
			away: p['Team Against'],
			games: [],
		};

		if ( i > 100 ) {
			break;
		}
	}

	console.log(games);

	/*
	for ( let i = 0; i < rows.length; i++ ) {
		const p = rows[i];
		const rsc_id = p['RSC ID'];

		if ( ! (rsc_id in players) ) {
			players[rsc_id] = {
				name: p.Name,
				tier: p.Tier,
				team: p.Team,
				wins: 0,
				loss: 0,
				goals: 0,
				assists: 0,
				shots: 0,
				saves: 0,
				mvps: 0,
			};
		}


		if ( ! ( match_key in game_data ) ) {
			game_data[match_key] = {

			}
		}
	
		if ( ! match ) {
			match = {
				key: match_key,
				games: [],
			}
		}
	}
	*/



	// close DB handle
	await db.end();

	res.render('manage_elo', {
		stats_url: 'https://docs.google.com/spreadsheets/d/17XHJcJ64gGVBaDfkJ7FvWgE8S8-v_dg9kzcxcmpBT3E/edit?gid=483192611#gid=483192611'
	});
});

module.exports = router;
