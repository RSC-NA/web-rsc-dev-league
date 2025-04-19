const DevLeague = {
	game_count: 0,
	in_game: false,
	do_ping: true,
	threshold: 8,
	playBoop: function() {
		var audio = new Audio('/sounds/check_in_ready.mp3');
		audio.play();
		DevLeague.threshold += 1;
	},
	playReady: function() {
		var audio = new Audio('/sounds/match_ready.mp3');
		audio.play();
		DevLeague.threshold += 1;
	},
}

document.addEventListener('DOMContentLoaded', () => {
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
});

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
