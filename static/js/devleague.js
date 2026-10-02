const DevLeague = {
	game_count: 0,
	waiting_room: 0,
	ready_room: 0,
	in_game: false,
	do_ping: true,
	threshold: parseInt(localStorage.getItem('Dev.threshold') ?? 10),
	initialize: function() {
		const gc = parseInt(localStorage.getItem('Dev.game-count') ?? 0);
		const wr = parseInt(localStorage.getItem('Dev.waiting-room') ?? 0);
		const rr = parseInt(localStorage.getItem('Dev.ready-room') ?? 0);
		const th = parseInt(localStorage.getItem('Dev.threshold') ?? 10);
		// console.log('initialize()', 'threshold => ', th, 'wr => ', wr, 'rr => ', rr);
		if ( DevLeague.threshold > th ) {
			// console.log('Setting threshold based on initial load', th, DevLeague.threshold);
			DevLeague.threshold = 10;
		}

		if ( gc > 0 && gc !== DevLeague.game_count ) {
			DevLeague.game_count = gc;
		}

		if ( rr > 0 && rr !== DevLeague.ready_room ) {
			DevLeague.ready_room = rr;
		}

		if ( wr > 0 && wr !== DevLeague.waiting_room ) {
			DevLeague.waiting_room = wr;
			if ( wr > DevLeague.threshold ) {
				// console.log('Setting threshold based on current waiting room', wr, DevLeague.threshold);
				DevLeague.threshold = wr;
				setTimeout(DevLeague.playReady, 500);
			}
		}

		localStorage.setItem('Dev.threshold', DevLeague.threshold);
		// console.log('initialize(END)', 'threshold => ', DevLeague.threshold, 'wr => ', wr);
	},
	playBoop: function() {
		var audio = new Audio('/sounds/check_in_ready.mp3');
		audio.play();
		DevLeague.game_count = 0;
		localStorage.setItem('Dev.waiting-room', DevLeague.threshold);
	},
	playReady: function() {
		var audio = new Audio('/sounds/match_ready.mp3');
		audio.play();
		DevLeague.threshold = DevLeague.waiting_room;
		localStorage.setItem('Dev.threshold', DevLeague.threshold);
		localStorage.setItem('Dev.waiting-room', DevLeague.waiting_room);
	},
}

document.addEventListener('DOMContentLoaded', initialize_devleague); 

function initialize_devleague(_ev) {
	DevLeague.initialize();

	const timeEls = document.querySelectorAll('.timeago');
	if ( timeEls && timeEls.length ) {
		for ( let i = 0; i < timeEls.length; ++i ) {
			const dateStr = timeEls[i].getAttribute('datetime');
			if ( dateStr ) {
				// uncomment the line of server is set to UTC
				const d = new Date(dateStr).getTime(); // - (new Date().getTimezoneOffset() * 60000);
				timeEls[i].setAttribute('datetime', d);
			}
		}
		timeago.render(timeEls);
	}

	const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
	const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

	const copyBtns = document.querySelectorAll('.copy-to-clipboard');
	if ( copyBtns ) {
		for ( let i = 0; i < copyBtns.length; ++i ) {
			copyBtns[i].addEventListener('click', copyToClipboard);
		}
	}
}

async function copyToClipboard(ev) {
	const el = ev.target;

	el.classList.add('bg-Veteran', 'text-black');
	if ( 'copy' in el.dataset ) {
		try {
			await navigator.clipboard.writeText(el.dataset.copy);
			if ( 'copySuccess' in el.dataset ) {
				const success_msg = document.getElementById(el.dataset.copySuccess);
				success_msg.classList.remove('hidden');
				setTimeout(() => { success_msg.classList.add('hidden'); el.classList.remove('bg-Veteran', 'text-black'); }, 2000);
			}
		} catch(e) {
			console.error('Could not copy text to clipboard', el, e);
		}
	}
}
