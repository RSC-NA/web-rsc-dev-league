// matchDays.js -> exports const matchDays

// this object needs to be updated with all official "game day" dates
// for the season. This list is displayed on the dashboard, and is also
// used in the dashboard template to show/hide the checkin button.

module.exports = {
	'3s' : {
		//'2024-05-03': 'holiday', // nice - end of season blowout
		'2025-12-08': 1,
		'2025-12-10': 2,
		'2025-12-15': 3,
		'2025-12-17': 4,
		'2025-12-27': 5,
		'2025-12-29': 6,
		'2025-01-05': 7,
		'2025-01-07': 8,
		// '2025-08-18': 7,
		// '2025-08-20': 8,
		// '2025-08-22': 9,
	},
	'2s': {
		'2024-08-26': 1,
		'2024-08-27': 1,
		'2024-08-29': 2,
		'2024-09-03': 3,
		'2024-09-05': 4,
		'2024-09-06': 4,
		'2024-09-10': 5,
		'2024-09-11': 5,
		'2024-09-12': 6,
		'2024-09-13': 6,
		'2024-09-17': 7,
		'2024-09-18': 7,
		'2024-09-19': 8,
		'2024-09-20': 8,
	}
};
