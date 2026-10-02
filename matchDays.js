// matchDays.js -> exports const matchDays

// this object needs to be updated with all official "game day" dates
// for the season. This list is displayed on the dashboard, and is also
// used in the dashboard template to show/hide the checkin button.

module.exports = {
	//'2024-05-03': 'holiday', // nice - end of season blowout
	// '2025-09-01': 'holiday',
	'2026-09-02': 0,
	'2026-09-07': 1,
	// '2026-09-07': 1,
	'2026-09-09': 2,
	'2026-09-14': 3,
	'2026-09-16': 4,
	'2026-09-21': 5,
	'2026-09-23': 6,
	'2026-09-24': {
		'type': 'offnight',
		'match_day': 7,
		'times': ['19:00', '19:45', '21:30' ],
	},
	'2026-09-28': 8,
	'2026-09-30': 9,
	'2026-10-01': {
		'type': 'offnight',
		'match_day': 10,
		'times': ['20:00', '20:45', '21:30' ],
	},
	'2026-10-02': {
		'type': 'offnight',
		'match_day': 11,
		'times': ['20:00', '20:45', '21:30' ],
	},
	'2026-10-05': 11,
	'2026-10-06': {
		'type': 'offnight',
		'match_day': 12,
		'times': ['20:00', '20:45', '21:30' ],
	},
	'2026-10-07': 13,
	'2026-10-12': {
		'type': 'holiday',
		'game': true,
		'match_day': 14,
	},
	// '2026-10-12': 11,
	'2026-10-14': 15,
	'2026-10-19': 16,
	'2026-10-21': 17,
	'2026-10-26': 18,
	'2026-10-28': 19,
	'2026-11-02': 20,
	'2026-11-04': 21,
	'2026-11-09': 22,
	'2026-11-11': 23,
	'2026-11-16': 24,

	// playoffs
	'2026-11-18': {
		'type': 'championship',
		'match_day': 99,
		'tiers': ['F', 'E', 'D', 'C'],
	},
	'2026-11-23': {
		'type': 'championship',
		'match_day': 99,
		'tiers': ['B', 'A', 'S', 'SPLUS'],
	},
};
