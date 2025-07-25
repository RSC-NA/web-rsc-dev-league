// mmrs.js -> exports const mmrRange, getTierFromMMR()

// define the tiers and their max/min MMRs. We use these values in 
// several places. The tier names are used in several template loops for
// displaying the tiers in a specific order, and the max/min MMRs are used
// for players that aren't assigned to a tier, but have an MMR listed in
// the contracts sheet
const mmrRange_3s = {
	'Premier': { 
		'max': 2200,
		'min': 1820,
	},
	'Master': { 
		'max': 1815,
		'min': 1715,
	},
	'Elite': { 
		'max': 1710,
		'min': 1535,
	},
	'Veteran': { 
		'max': 1530,
		'min': 1390,
	},
	'Rival': { 
		'max': 1385,
		'min': 1245,
	},
	'Challenger': { 
		'max': 1240,
		'min': 1075,
	},
	'Prospect': { 
		'max': 1070,
		'min': 955,
	},
	'Amateur': { 
		'max': 950,
		'min': 0,
	},
	/*
	'Contender': { 
		'max': 1025,
		'min': 900,
	},
	*/
};

const mmrRange_2s = {
	'Premier': { 
		'max': 3000,
		'min': 1575,
	},
	'Elite': { 
		'max': 1570,
		'min': 1505,
	},
	'Veteran': { 
		'max': 1500,
		'min': 1425,
	},
	'Rival': { 
		'max': 1420,
		'min': 1350,
	},
	'Challenger': { 
		'max': 1345,
		'min': 1265,
	},
	'Prospect': { 
		'max': 1260,
		'min': 1180,
	},
	'Contender': { 
		'max': 1175,
		'min': 1080,
	},
	'Amateur': { 
		'max': 1075,
		'min': 0,
	},
};

// export our mmrRange const object
exports.mmrRange_3s = mmrRange_3s;
exports.mmrRange_2s = mmrRange_2s;

// this function is used to return a tier
exports.getTierFromMMR = (mmr, league=3) => {
	let ranges = mmrRange_3s;
	if ( league === 2 ) {
		ranges = mmrRange_2s;
	}

	mmr = Math.ceil((mmr - 1) / 5) * 5;
	for ( let tier in ranges ) {
		if ( mmr >= ranges[tier]['min'] && mmr <= ranges[tier]['max'] ) {
			return tier;
		}
	}
};
