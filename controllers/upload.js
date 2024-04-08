const multer = require('multer');

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'static/replays/');
	},
});

const upload = multer({ storage: storage });

module.exports = upload;
