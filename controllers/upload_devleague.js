const multer = require('multer');
const fs = require('fs');

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const season = parseInt(req.params.season) ?? null;
		const day = parseInt(req.params.match_day) ?? null;
		if ( season && day ) {
			const replay_path = `static/devleague_replays/s${season}/md${day}`;
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
