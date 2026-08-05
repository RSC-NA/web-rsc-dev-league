
const fs = require('fs');
const mysqlP = require('mysql2/promise');

const db = mysqlP.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	port: process.env.DB_PORT,
	database: process.env.DB_SCHEMA,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

const bad_replay_query = `
	SELECT 
		m.id,m.season,m.match_day,
		r.id AS replay_id,r.match_id AS replay_match_id, 
		r.season AS replay_season,r.match_day AS replay_match_day
	FROM combine_replays AS r
	LEFT JOIN combine_matches AS m 
		ON r.match_id = m.id
	WHERE 
		m.season is not null AND m.match_day IS NOT null 
		AND r.season IS null AND r.match_day IS null
`;
const [match_replays] = await db.query(bad_replay_query);
const updates = [];
if ( match_replays ) { 
	for ( let i = 0; i < match_replays.length; ++i ) {
		const mr = match_replays[i];
		updates.push([
			mr.season, mr.match_day, mr.replay_id	
		]);
	}

	if ( updates ) {
		const update_query = `
			UPDATE combine_replays 
			SET season = ?, match_day = ? 
			WHERE id = ?
		`;
		for ( let i = 0; i < updates.length; ++i ) {
			const up = updates[i];
			await db.query(update_query, [up[0], up[1], up[2]]);
		}
	}
}

console.log(`Updated ${updates.length} records...`);

const replay_query = `
	SELECT 
		id,season,match_day,replay 
	FROM combine_replays
	WHERE match_day IS NOT null
`;
const [results] = await db.query(replay_query);
if ( results ) {
	for ( let i = 0; i < results.length; ++i ) {
		console.log(results[i]);
		const file = results[i];
		if ( file.season && file.match_day ) {
			const current_path = `static/replays/${file.replay}`;
			const new_path_folder = `static/replays/s${file.season}/md${file.match_day}`;
			const new_path = `${new_path_folder}/${file.replay}`;

			if (!fs.existsSync(new_path_folder)){
				fs.mkdirSync(new_path_folder, { recursive: true });
			}
		
			// move file from `current_path` to `new_path_folder/${file.replay}`
			if ( fs.existsSync(current_path) ) {
				fs.renameSync(current_path, new_path);
				//fs.copyFileSync(current_path, new_path);
				console.log(`moved file to ${new_path}`);
			} else {
				console.log(`[SKIPPED] ${current_path}`);
			}
		}
	}
}

await db.end();
