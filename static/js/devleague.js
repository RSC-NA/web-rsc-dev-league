document.addEventListener('DOMContentLoaded', () => {
	const timeEls = document.querySelectorAll('.timeago');
	if ( timeEls && timeEls.length ) {
		for ( let i = 0; i < timeEls.length; ++i ) {
			const dateStr = timeEls[i].getAttribute('datetime');
			if ( dateStr ) {
				const d = new Date(dateStr).getTime() - (new Date().getTimezoneOffset() * 60000);
				timeEls[i].setAttribute('datetime', d);
			}
		}
		timeago.render(timeEls);
	}
});
