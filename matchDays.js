// matchDays.js -> exports const matchDays

// this object needs to be updated with all official "game day" dates
// for the season. This list is displayed on the dashboard, and is also
// used in the dashboard template to show/hide the checkin button.

module.exports = {
	//'2024-05-03': 'holiday', // nice - end of season blowout
	// '2025-09-01': 'holiday',
	'2026-09-02': 0,
	'2026-09-07': 'holiday',
	// '2026-09-07': 1,
	'2026-09-09': 2,
	'2026-09-14': 3,
	'2026-09-16': 4,
	'2026-09-21': 5,
	'2026-09-23': 6,
	'2026-09-28': 7,
	'2026-09-30': 8,
	'2026-10-05': 9,
	'2026-10-07': 10,
	'2026-10-12': 'holiday',
	// '2026-10-12': 11,
	'2026-10-14': 12,
	'2026-10-19': 13,
	'2026-10-21': 14,
	'2026-10-26': 15,
	'2026-10-28': 16,
	'2026-11-02': 17,
	'2026-11-04': 18,
	'2026-11-09': 19,
	'2026-11-11': 20,
	'2026-11-16': 21,
	'2026-11-18': 22,

	// playoffs
	'2026-11-23': 99,
	'2026-11-25': 99,
};
