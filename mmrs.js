// mmrs.js -> exports const mmrRange, getTierFromMMR()

// define the tiers and their max/min MMRs. We use these values in 
// several places. The tier names are used in several template loops for
// displaying the tiers in a specific order, and the max/min MMRs are used
// for players that aren't assigned to a tier, but have an MMR listed in
// the contracts sheet
const mmrRange = {
	'Premier': { 
		'max': 2010,
		'min': 1750,
	},
	'Master': { 
		'max': 1745,
		'min': 1650,
	},
	'Elite': { 
		'max': 1645,
		'min': 1505,
	},
	'Veteran': { 
		'max': 1500,
		'min': 1415,
	},
	'Rival': { 
		'max': 1410,
		'min': 1300,
	},
	'Challenger': { 
		'max': 1295,
		'min': 1170,
	},
	'Prospect': { 
		'max': 1165,
		'min': 1050,
	},
	'Contender': { 
		'max': 1045,
		'min': 920,
	},
	'Amateur': { 
		'max': 915,
		'min': 500,
	},
};

// export our mmrRange const object
exports.mmrRange = mmrRange;

// this function is used to return a tier
exports.getTierFromMMR = (mmr) => {
	for ( let tier in mmrRange ) {
		if ( mmr >= mmrRange[tier]['min'] && mmr <= mmrRange[tier]['max'] ) {
			return tier;
		}
	}
};