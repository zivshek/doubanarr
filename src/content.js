(function () {
    console.log('DoubanArr content script loaded');

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
        // Douban usually has "上映日期" (Release Date) for movies and "首播" (First Aired) for TV shows.
        // Or check the category in the breadcrumbs / meta.
        const isTV = info.innerText.includes('首播') || info.innerText.includes('集数') || info.innerText.includes('季');
        const service = isTV ? 'sonarr' : 'radarr';
        const serviceName = isTV ? 'Sonarr' : 'Radarr';

        // 3. Send message to background script
        chrome.runtime.sendMessage({
            type: 'SUBJECT_DETECTED',
            service,
            id: imdbId,
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
                    imdbId: imdbMatch ? imdbMatch[0] : null,
                    isTV: isTV
                });
            } else {
                sendResponse(null);
            }
        }
    });
})();
