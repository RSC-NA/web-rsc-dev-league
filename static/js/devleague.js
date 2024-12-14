const DevLeague = {
	in_game: false,
	do_ping: true,
	threshold: 6,
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
});
