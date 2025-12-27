const detectedSubjects = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SUBJECT_DETECTED') {
        handleSubjectDetected(sender.tab.id, message);
        return;
    }

    if (message.type === 'GET_DETECTED_SUBJECT') {
        sendResponse(detectedSubjects.get(message.tabId));
        return;
    }

    if (message.type === 'TEST_CONNECTION') {
        testConnection(message.service, message.url, message.apiKey)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async response
    }

    if (message.type === 'ADD_TO_ARR') {
        addToArr(message.service, message.id, message.mediaType)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

async function handleSubjectDetected(tabId, info) {
    const settings = await chrome.storage.sync.get(['radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey']);

    // Check if the relevant service is configured
    const isConfigured = info.service === 'radarr'
        ? (settings.radarrUrl && settings.radarrApiKey)
        : (settings.sonarrUrl && settings.sonarrApiKey);

    if (isConfigured) {
        chrome.action.setBadgeText({ text: '1', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: tabId });
    }

    detectedSubjects.set(tabId, info);
}

// Clear info when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    detectedSubjects.delete(tabId);
});

async function testConnection(service, url, apiKey) {
    const endpoint = service === 'radarr' ? '/api/v3/system/status' : '/api/v3/system/status';
    try {
        const response = await fetch(`${url}${endpoint}?apiKey=${apiKey}`);
        if (response.ok) {
            return { success: true };
        } else {
            const data = await response.json().catch(() => ({}));
            return { success: false, error: data.message || `HTTP ${response.status}` };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function addToArr(service, id, mediaType) {
    const settings = await chrome.storage.sync.get(['radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey']);
    const baseUrl = service === 'radarr' ? settings.radarrUrl : settings.sonarrUrl;
    const apiKey = service === 'radarr' ? settings.radarrApiKey : settings.sonarrApiKey;

    if (!baseUrl || !apiKey) {
        throw new Error(`${service} URL or API Key not configured`);
    }

    if (service === 'radarr') {
        return handleRadarrAdd(baseUrl, apiKey, id);
    } else {
        return handleSonarrAdd(baseUrl, apiKey, id);
    }
}

async function handleRadarrAdd(baseUrl, apiKey, imdbId) {
    // 1. Lookup movie by IMDb ID
    const lookupUrl = `${baseUrl}/api/v3/movie/lookup/imdb?imdbId=${imdbId}&apiKey=${apiKey}`;
    const lookupResp = await fetch(lookupUrl);
    if (!lookupResp.ok) throw new Error('Radarr lookup failed');
    const movieData = await lookupResp.json();

    if (movieData.id) {
        return { success: false, error: 'Movie already in library' };
    }

    // 2. Get root folders and profiles
    const rootFolders = await (await fetch(`${baseUrl}/api/v3/rootfolder?apiKey=${apiKey}`)).json();
    const qualityProfiles = await (await fetch(`${baseUrl}/api/v3/qualityprofile?apiKey=${apiKey}`)).json();

    if (!rootFolders.length || !qualityProfiles.length) throw new Error('Could not find root folder or quality profile');

    // 3. Add movie
    const addPayload = {
        ...movieData,
        rootFolderPath: rootFolders[0].path,
        qualityProfileId: qualityProfiles[0].id,
        monitored: true,
        addOptions: {
            searchForMovie: true
        }
    };

    const addResp = await fetch(`${baseUrl}/api/v3/movie?apiKey=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addPayload)
    });

    if (addResp.ok) return { success: true };
    const errorData = await addResp.json();
    throw new Error(errorData[0]?.errorMessage || 'Failed to add movie');
}

async function handleSonarrAdd(baseUrl, apiKey, imdbId) {
    // 1. Lookup series by IMDb ID (Sonarr supports term=imdb:tt...)
    const lookupUrl = `${baseUrl}/api/v3/series/lookup?term=imdb:${imdbId}&apiKey=${apiKey}`;
    const lookupResp = await fetch(lookupUrl);
    if (!lookupResp.ok) throw new Error('Sonarr lookup failed');
    const seriesDataArr = await lookupResp.json();
    if (!seriesDataArr.length) throw new Error('Series not found by IMDb ID');
    const seriesData = seriesDataArr[0];

    if (seriesData.id) {
        return { success: false, error: 'Series already in library' };
    }

    // 2. Get root folders and profiles
    const rootFolders = await (await fetch(`${baseUrl}/api/v3/rootfolder?apiKey=${apiKey}`)).json();
    const qualityProfiles = await (await fetch(`${baseUrl}/api/v3/qualityprofile?apiKey=${apiKey}`)).json();

    if (!rootFolders.length || !qualityProfiles.length) throw new Error('Could not find root folder or quality profile');

    // 3. Add series
    const addPayload = {
        ...seriesData,
        rootFolderPath: rootFolders[0].path,
        qualityProfileId: qualityProfiles[0].id,
        monitored: true,
        addOptions: {
            searchForMissingEpisodes: true
        }
    };

    const addResp = await fetch(`${baseUrl}/api/v3/series?apiKey=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addPayload)
    });

    if (addResp.ok) return { success: true };
    const errorData = await addResp.json();
    throw new Error(errorData[0]?.errorMessage || 'Failed to add series');
}
