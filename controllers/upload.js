const multer = require('multer');
const fs = require('fs');

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const season = parseInt(req.body.season) ?? null;
		const match_day = parseInt(req.body.match_day) ?? null;
		if ( season !== null && match_day !== null ) {
			const replay_path = `static/replays/s${season}/md${match_day}`;
			console.log(season, match_day, replay_path, file.originalname);
			if (!fs.existsSync(replay_path)){
				fs.mkdirSync(replay_path, { recursive: true });
			}
			cb(null, replay_path);
		}
	},
	filename: (req, file, cb) => {
		cb(null, file.originalname);
	}
});

const upload = multer({ storage: storage });

module.exports = upload;
