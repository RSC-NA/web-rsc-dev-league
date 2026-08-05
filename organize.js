
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

const replay_query = `
	SELECT 
		id,season,match_day,replay 
	FROM combine_replays
	LIMIT 10
`;
const [results] = await db.query(replay_query);
if ( results ) {
	for ( let i = 0; i < results.length; ++i ) {
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
				//fs.renameSync(current_path, new_path);
				console.log(`moved file to ${new_path}`);
			} else {
				console.log(`[SKIPPED] ${current_path}`);
			}
		}
	}
}

await db.end();
