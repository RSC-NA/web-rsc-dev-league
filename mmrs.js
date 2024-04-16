// mmrs.js -> exports const mmrRange, getTierFromMMR()

// define the tiers and their max/min MMRs. We use these values in 
// several places. The tier names are used in several template loops for
// displaying the tiers in a specific order, and the max/min MMRs are used
// for players that aren't assigned to a tier, but have an MMR listed in
// the contracts sheet
const mmrRange = {
	'Premier': { 
		'max': 3010,
		'min': 1780,
	},
	'Master': { 
		'max': 1775,
		'min': 1680,
	},
	'Elite': { 
		'max': 1675,
		'min': 1530,
	},
	'Veteran': { 
		'max': 1525,
		'min': 1420,
	},
	'Rival': { 
		'max': 1415,
		'min': 1270,
	},
	'Challenger': { 
		'max': 1265,
		'min': 1130,
	},
	'Prospect': { 
		'max': 1125,
		'min': 1040,
	},
	'Contender': { 
		'max': 1035,
		'min': 930,
	},
	'Amateur': { 
		'max': 925,
		'min': 0,
	},
};

// export our mmrRange const object
exports.mmrRange = mmrRange;

// this function is used to return a tier
exports.getTierFromMMR = (mmr) => {
	mmr = Math.ceil((mmr + 1) / 5) * 5;
	for ( let tier in mmrRange ) {
		if ( mmr >= mmrRange[tier]['min'] && mmr <= mmrRange[tier]['max'] ) {
			return tier;
		}
	}
};
