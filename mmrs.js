// mmrs.js -> exports const mmrRange, getTierFromMMR()

// define the tiers and their max/min MMRs. We use these values in 
// several places. The tier names are used in several template loops for
// displaying the tiers in a specific order, and the max/min MMRs are used
// for players that aren't assigned to a tier, but have an MMR listed in
// the contracts sheet
const mmrRange_3s = {
	'Legend': { 
		'max': 3000,
		'min': 1800,
	},
	'Premier': { 
		'max': 1795,
		'min': 1655,
	},
	'Master': { 
		'max': 1650,
		'min': 1545,
	},
	'Elite': { 
		'max': 1540,
		'min': 1450,
	},
	'Veteran': { 
		'max': 1445,
		'min': 1360,
	},
	'Rival': { 
		'max': 1355,
		'min': 1250,
	},
	'Challenger': { 
		'max': 1245,
		'min': 1135,
	},
	'Prospect': { 
		'max': 1130,
		'min': 1005,
	},
	'Contender': { 
		'max': 1000,
		'min': 875,
	},
	'Amateur': { 
		'max': 870,
		'min': 0,
	},
	/*
	*/
};

const mmrRange_dev = {
	'S': { 
		'max': 3000,
		'min': 1755,
	},
	'A': { 
		'max': 1750,
		'min': 1675,
	},
	'B': { 
		'max': 1670,
		'min': 1505,
	},
	'C': { 
		'max': 1500,
		'min': 1360,
	},
	'D': { 
		'max': 1355,
		'min': 1210,
	},
	'E': { 
		'max': 1205,
		'min': 1055,
	},
	'F': { 
		'max': 1050,
		'min': 935,
	},
	'G': { 
		'max': 930,
		'min': 0,
	},
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
exports.mmrRange_3s  = mmrRange_3s;
exports.mmrRange_dev = mmrRange_dev;
exports.mmrRange_2s  = mmrRange_2s;

// this function is used to return a tier
exports.getTierFromDevMMR = (mmr) => {
	let ranges = mmrRange_dev;

	mmr = Math.ceil((mmr - 1) / 5) * 5;
	for ( let tier in ranges ) {
		if ( mmr >= ranges[tier]['min'] && mmr <= ranges[tier]['max'] ) {
			return tier;
		}
	}
};

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
