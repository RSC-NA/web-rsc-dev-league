// matchDays.js -> exports const matchDays

// this object needs to be updated with all official "game day" dates
// for the season. This list is displayed on the dashboard, and is also
// used in the dashboard template to show/hide the checkin button.

module.exports = {
	'3s' : {
		//'2024-05-03': 'holiday', // nice - end of season blowout
		'2024-08-05': 1,
		'2024-08-07': 2,
		'2024-08-12': 3,
		'2024-08-14': 4,
		'2024-08-19': 5,
		'2024-08-21': 6,
	},
	'2s': {
		'2024-08-27': 1,
		'2024-08-29': 2,
		'2024-09-03': 3,
		'2024-09-05': 4,
		'2024-09-10': 5,
		'2024-09-12': 6,
		'2024-09-17': 7,
		'2024-09-19': 8,
	}
};
