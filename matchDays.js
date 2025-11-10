// matchDays.js -> exports const matchDays

// this object needs to be updated with all official "game day" dates
// for the season. This list is displayed on the dashboard, and is also
// used in the dashboard template to show/hide the checkin button.

module.exports = {
	//'2024-05-03': 'holiday', // nice - end of season blowout
	'2025-09-01': 'holiday',
	'2025-09-08': 0,
	'2025-09-10': 1,
	'2025-09-15': 3,
	'2025-09-17': 3,
	'2025-09-22': 4,
	'2025-09-24': 5,
	'2025-09-29': 6,
	'2025-10-01': 7,
	'2025-10-06': 8,
	'2025-10-08': 9,
	'2025-10-13': 29,
	'2025-10-15': 10,
	'2025-10-20': 11,
	'2025-10-22': 12,
	'2025-10-27': 13,
	'2025-10-29': 14,
	'2025-11-03': 15,
	'2025-11-05': 16,
	'2025-11-10': 17,
	'2025-11-12': 18,
	// playoffs
	'2025-11-19': 19,
	'2025-11-24': 19,
};
