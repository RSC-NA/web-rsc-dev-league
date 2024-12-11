// matchDays.js -> exports const matchDays

// this object needs to be updated with all official "game day" dates
// for the season. This list is displayed on the dashboard, and is also
// used in the dashboard template to show/hide the checkin button.

module.exports = {
	'3s' : {
		//'2024-05-03': 'holiday', // nice - end of season blowout
		'2024-12-09': 1,
		'2024-12-11': 2,
		'2024-12-13': 3,
		'2024-12-16': 4,
		'2024-12-18': 5,
		'2024-12-20': 6,
		'2024-12-23': 'holiday',
		'2024-12-25': 'holiday',
		'2024-12-27': 'holiday',
		'2024-12-27': 'holiday',
		'2024-12-30': 'holiday',
		'2025-01-01': 'holiday',
		'2025-01-03': 'holiday',
		'2025-01-06': 7,
		'2025-01-08': 8,
		'2025-01-10': 9,
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
