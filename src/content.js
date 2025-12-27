(function () {
    console.log('Doubanarr content script loaded');

    function getTitle() {
        const titleEl = document.querySelector('h1 span[property="v:itemreviewed"]');
        if (titleEl) {
            return titleEl.innerText.trim();
        }
        return document.title.replace('(豆瓣)', '').trim();
    }

    function init() {
        const info = document.getElementById('info');
        if (!info) return;

        // 1. Extract IMDb ID
        const imdbMatch = info.innerHTML.match(/tt\d+/);
        if (!imdbMatch) {
            console.log('Doubanarr: No IMDb ID found on this page.');
            return;
        }
        const imdbId = imdbMatch[0];

        // 2. Identify if it's a Movie or TV Show
        const isTV = info.innerText.includes('首播') || info.innerText.includes('集数') || info.innerText.includes('季');
        const service = isTV ? 'sonarr' : 'radarr';
        const title = getTitle();

        // 3. Send message to background script
        chrome.runtime.sendMessage({
            type: 'SUBJECT_DETECTED',
            service,
            id: imdbId,
            title,
            isTV
        });
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Listen for requests from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GET_PAGE_INFO') {
            const info = document.getElementById('info');
            if (info) {
                const imdbMatch = info.innerHTML.match(/tt\d+/);
                const isTV = info.innerText.includes('首播') || info.innerText.includes('集数') || info.innerText.includes('季');
                sendResponse({
                    id: imdbMatch ? imdbMatch[0] : null,
                    title: getTitle(),
                    isTV: isTV
                });
            } else {
                sendResponse(null);
            }
        }
    });
})();
