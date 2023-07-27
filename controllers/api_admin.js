const express = require('express');
const router  = express.Router();

const mysqlP = require('mysql2/promise');
const { GoogleSpreadsheet } = require('google-spreadsheet');

function forceInt(val) {
	if ( parseInt(val) == NaN ) {
		return 0;
	}

	return parseInt(val);
}

async function pull_stats(req, res) {
	if ( ! req.session.is_admin ) {
		//return res.redirect('/');
	} 

	let sheetId          = '1qulf-2ehBrZ8A2-E6kQsezSQ4V_2fQ9IHCm7RWlRXwA';
	let teamStatsTable   = 'StreamTeamStats';
	let playerStatsTable = 'StreamPlayerStats';
	if ( req.route.path == '/pull_stats_2' ) {
		teamStatsTable   = 'StreamTeamStats2';
		playerStatsTable = 'StreamPlayerStats2';
		sheetId = '1CzIjrTdc7e7qK0blwl1rudhJxaCIxSI6WIiycHzMurY';
	}
	let output = [];

	const conn2 = await mysqlP.createPool({
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		port: process.env.DB_PORT,
		database: process.env.DB_SCHEMA,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0
	});

	// 1. create google sheets object
	const doc = new GoogleSpreadsheet(sheetId);

	// 2. authenticate
	doc.useApiKey(process.env.GOOGLE_API_KEY);

	// 3. pull all relevant fields
	await doc.loadInfo();

	// sheets = Team List, Team Stats, Player Stats, Team Standings, Variables
	const TeamSheet = doc.sheetsByTitle["Team List"];
	const TeamRows = await TeamSheet.getRows();
	let teams = [];
	let franchiseByTeam = {};
	let tierByTeam = {};
	// Team Name, Franchise, Tier
	// StreamTeamStats, StreamTeamStats2
	// SELECT Id, Season, Franchise, TeamName, Tier, Wins, Loss, WinPct, `Rank`, GM, Conference, Division, GamesPlayed, ShotPct, Points, Goals, Assists, Saves, Shots, GoalDiff, OppShotPct, OppPoints, OppGoals, OppAssists, OppSaves, OppShots FROM {teamStatsTable} ORDER BY TeamName
	for ( let i = 0; i < TeamRows.length; i++ ) {
		let teamRow = TeamRows[i];
		let teamName = teamRow._rawData[0];
		let franchise = teamRow._rawData[1];
		let tierName = teamRow._rawData[2];
		teams.push({ name: teamName, franchise: franchise, tier: tierName });
		franchiseByTeam[ teamName ]  = franchise;
		tierByTeam[ teamName ]       = tierName;
	}
	// log tiers
	//
	const StandingsSheet = doc.sheetsByTitle['Team Standings'];
	const StandingsRows  = await StandingsSheet.getRows();
	const dataRows = StandingsRows.slice(1);
	let divisionsByTeam = {};
	let ranksByTeam =  {};
	for ( let i = 0; i < dataRows.length; i++ ) {
		let team     = dataRows[i]._rawData[1];
		let division = dataRows[i]._rawData[3];
		let rank     = dataRows[i]._rawData[4];
		//console.log(team, division, rank);
		divisionsByTeam[ team ] = division;
		ranksByTeam[ team ] = rank;
	}

	// log divisions
	//console.log(divisionsByTeam);

	let teamStats = [];
	const TeamStatsSheet = doc.sheetsByTitle['Team Stats'];
	const TeamStatsRows  = await TeamStatsSheet.getRows();
	for ( let i = 0; i < TeamStatsRows.length; i++ ) {
		teamStats.push({
			'Season'     : res.locals.settings.season,// external
			'Franchise'  : franchiseByTeam[ TeamStatsRows[i]['Team'] ] ?? '',
			'TeamName'   : TeamStatsRows[i]['Team'] ?? '',
			'Tier'       : tierByTeam[ TeamStatsRows[i]['Team'] ] ?? '',
			'Wins'       : TeamStatsRows[i]['W'] ?? 0,
			'Loss'       : TeamStatsRows[i]['L'] ?? 0,
			'WinPct'     : TeamStatsRows[i]['W%'].replace(/\%/,'') ?? 0,
			'Rank'       : ranksByTeam[ TeamStatsRows[i]['Team'] ] ?? 0, 
			'GM'         : TeamStatsRows[i]['GM'] ?? '',
			'Conference' : TeamStatsRows[i]['Conference'] ?? '',
			'Division'   : divisionsByTeam[ TeamStatsRows[i]['Team'] ] ?? '', 
			'GamesPlayed': TeamStatsRows[i]['GP'] ?? 0,
			'ShotPct'    : TeamStatsRows[i]['Shot %'].replace(/\%/,'') ?? 0,
			'Points'     : TeamStatsRows[i]['Points'] ?? 0,
			'Goals'      : TeamStatsRows[i]['Goals'] ?? 0,
			'Assists'    : TeamStatsRows[i]['Assists'] ?? 0,
			'Saves'      : TeamStatsRows[i]['Saves'] ?? 0,
			'Shots'      : TeamStatsRows[i]['Shots'] ?? 0,
			'GoalDiff'   : TeamStatsRows[i]['Goal Dif.'] ?? 0,
			'OppShotPct' : TeamStatsRows[i]['Opp. Shot %'].replace(/\%/,'') ?? 0,
			'OppPoints'  : TeamStatsRows[i]['Opp. Points'] ?? 0,
			'OppGoals'   : TeamStatsRows[i]['Opp. Goals'] ?? 0,
			'OppAssists' : TeamStatsRows[i]['Opp. Assists'] ?? 0,
			'OppSaves'   : TeamStatsRows[i]['Opp. Saves'] ?? 0,
			'OppShots'   : TeamStatsRows[i]['Opp. Shots'] ?? 0,
		});
	}

	// clear our tables
	await conn2.execute(`TRUNCATE ${teamStatsTable}`);
	output.push({ 'process': `Truncating ${teamStatsTable}`});

	// insert into ${teamStatsTable}
	let keys = Object.keys(teamStats[0]).map(el => '`' + el + '`').join(', ');
	let placeholders = Object.keys(teamStats[0]).map(el => '?').join(', ');
	let teamStatsQuery = `INSERT INTO ${teamStatsTable} (${keys}) VALUES (${placeholders})`;
	console.log(teamStatsQuery);
	for ( let i = 0; i < teamStats.length; i++ ) {
		//console.log(Object.values(teamStats[i]));
		await conn2.execute(teamStatsQuery, Object.values(teamStats[i]));
	}

	const PlayerStatsSheet = doc.sheetsByTitle['Player Stats'];
	const PlayerStatsRows  = await PlayerStatsSheet.getRows();
	// SELECT 
	let playerStats = [];
	//res.write(' ');
	for ( let i = 0; i < PlayerStatsRows.length; i++ ) {
		let row = PlayerStatsRows[i];
		if ( row['Name'] === '' || row['Name'] === undefined ) { // skip empty records
			continue;
		}
		let shotPct = row['Shot Pct'].replace(/\%/, '');
		playerStats.push({
			Season: res.locals.settings.season, 
			Tier: tierByTeam[ row['Team'] ] ?? '',
			TeamName: row['Team'] ?? '', 
			PlayerName: row['Name'] ?? '', 
			GP: forceInt(row['GP']), 
			GW: forceInt(row['GW']), 
			GL: forceInt(row['GL']), 
			WPct: row['W%'].replace(/\%/,''), 
			MVPs: forceInt(row['MVPs']), 
			Pts: forceInt(row['Pts']), 
			Goals: forceInt(row['Goals']), 
			Assists: forceInt(row['Assists']), 
			Saves: forceInt(row['Saves']),
			Shots: forceInt(row['Shots']),
			ShotPct: shotPct != '' ? shotPct : 0.0, 
			PPG: row['PPG'] ?? 0, 
			GPG: row['GPG'] ?? 0, 
			APG: row['APG'] ?? 0, 
			SvPG: row['SvPG'] ?? 0, 
			SoPG: row['SoPG'] ?? 0, 
			Cycles: forceInt(row['Cycles']),
			HatTricks: forceInt(row['Hat Tricks']), 
			Playmakers: forceInt(row['Playmakers']),
			Saviors: forceInt(row['Saviors']),
		});
	}

	await conn2.execute(`TRUNCATE ${playerStatsTable}`);
	output.push({ 'process': `Truncating ${playerStatsTable}`});

	// insert into ${playerStatsTable}
	let playerKeys = Object.keys(playerStats[0]).map(el => '`' + el + '`').join(', ');
	let playerPlaceholders = Object.keys(playerStats[0]).map(el => '?').join(', ');
	let playerStatsQuery = `INSERT INTO ${playerStatsTable} (${playerKeys}) VALUES (${playerPlaceholders})`;
	console.log(playerStatsQuery);
	console.log(playerStats.length);
	console.log(playerStats[4]);
	for ( let i = 0; i < playerStats.length; i++ ) {
		if ( i % 100 == 0 ) { console.log(`Keepalive ping ${i}`); /*res.write(' ');*/ } // make sure we keep our connection through heroku alive
		await conn2.execute(playerStatsQuery, Object.values(playerStats[i]));
	}

	output.push({ 'process': 'Done!' });

	res.send('<pre>' + JSON.stringify(output) + '</pre>');
}

router.get('/pull_stats', pull_stats);
router.get('/pull_stats_2', pull_stats);

module.exports = router;
