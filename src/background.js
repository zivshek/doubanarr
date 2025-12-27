const detectedSubjects = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Doubanarr: received message', message.type, message);

    if (message.type === 'SUBJECT_DETECTED') {
        const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
        if (tabId) {
            handleSubjectDetected(tabId, message)
                .then(updatedInfo => {
                    console.log('Doubanarr: subject processed', updatedInfo);
                    sendResponse(updatedInfo);
                })
                .catch(err => {
                    console.error('Doubanarr: error processing subject', err);
                    sendResponse({ success: false, error: err.message });
                });
            return true;
        }
    }

    if (message.type === 'GET_DETECTED_SUBJECT') {
        sendResponse(detectedSubjects.get(message.tabId));
        return;
    }

    if (message.type === 'TEST_CONNECTION') {
        testConnection(message.service, message.url, message.apiKey)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'FETCH_METADATA') {
        fetchMetadata(message.service, message.url, message.apiKey)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'ADD_TO_ARR') {
        addToArr(message.service, message.id, message.mediaType, message.profileId, message.rootFolder)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

async function fetchMetadata(service, url, apiKey) {
    try {
        const [profilesResp, foldersResp] = await Promise.all([
            fetch(`${url}/api/v3/qualityprofile?apiKey=${apiKey}`),
            fetch(`${url}/api/v3/rootfolder?apiKey=${apiKey}`)
        ]);

        if (!profilesResp.ok || !foldersResp.ok) {
            throw new Error(`Failed to fetch metadata (Profiles: ${profilesResp.status}, Folders: ${foldersResp.status})`);
        }

        return {
            success: true,
            profiles: await profilesResp.json(),
            folders: await foldersResp.json()
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function handleSubjectDetected(tabId, info) {
    const settings = await chrome.storage.sync.get(['radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey']);

    const imdbId = info.id || info.imdbId;
    if (!imdbId) {
        console.warn('Doubanarr: Subject detected but no ID found', info);
        return { ...info, tabId };
    }

    let baseUrl = info.service === 'radarr' ? settings.radarrUrl : settings.sonarrUrl;
    const apiKey = info.service === 'radarr' ? settings.radarrApiKey : settings.sonarrApiKey;

    if (baseUrl && baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    let libraryStatus = { inLibrary: false, statusText: 'Not in Library' };

    if (baseUrl && apiKey && imdbId) {
        console.log(`Doubanarr: checking library status for ${imdbId} on ${info.service} at ${baseUrl}`);
        try {
            // 1. Check if in library and get basic status
            let localItem = null;
            if (info.service === 'radarr') {
                const url = `${baseUrl}/api/v3/movie/lookup?term=imdb:${imdbId}&apiKey=${apiKey}`;
                const resp = await fetch(url);
                if (resp.ok) {
                    const results = await resp.json();
                    localItem = results.find(m => m.id && m.id !== 0);
                }
            } else {
                const url = `${baseUrl}/api/v3/series/lookup?term=imdb:${imdbId}&apiKey=${apiKey}`;
                const resp = await fetch(url);
                if (resp.ok) {
                    const results = await resp.json();
                    localItem = results.find(s => s.id && s.id !== 0);
                }
            }

            if (localItem) {
                libraryStatus.inLibrary = true;

                // 2. Check queue for "Downloading" status
                const queueResp = await fetch(`${baseUrl}/api/v3/queue?apiKey=${apiKey}`);
                if (queueResp.ok) {
                    const queue = await queueResp.json();
                    const queueItems = queue.records || [];
                    const isInQueue = queueItems.some(item =>
                        (info.service === 'radarr' && item.movieId === localItem.id) ||
                        (info.service === 'sonarr' && item.seriesId === localItem.id)
                    );

                    if (isInQueue) {
                        libraryStatus.statusText = 'Downloading';
                        // Short circuit if downloading
                        const updatedInfo = { ...info, id: imdbId, libraryStatus, tabId };
                        detectedSubjects.set(tabId, updatedInfo);
                        chrome.action.setBadgeText({ text: '', tabId: tabId });
                        return updatedInfo;
                    }
                }

                // 3. Determine Downloaded/Monitored status
                if (info.service === 'radarr') {
                    if (localItem.hasFile || (localItem.movieFileId && localItem.movieFileId > 0)) {
                        libraryStatus.statusText = 'Downloaded';
                    } else if (localItem.monitored) {
                        libraryStatus.statusText = 'Monitored';
                    } else {
                        libraryStatus.statusText = 'In Library';
                    }
                } else {
                    const stats = localItem.statistics;
                    if (stats && stats.episodeFileCount === stats.episodeCount && stats.episodeCount > 0) {
                        libraryStatus.statusText = 'Downloaded';
                    } else if (stats && stats.episodeFileCount > 0) {
                        libraryStatus.statusText = 'Partially Downloaded';
                    } else if (localItem.monitored) {
                        libraryStatus.statusText = 'Monitored';
                    } else {
                        libraryStatus.statusText = 'In Library';
                    }
                }
            }
        } catch (err) {
            console.error('Doubanarr: Status check failed', err);
        }
    }

    const updatedInfo = { ...info, id: imdbId, libraryStatus, tabId };

    // Only show badge if NOT in library
    if (baseUrl && apiKey && !libraryStatus.inLibrary) {
        chrome.action.setBadgeText({ text: '1', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: tabId });
    } else {
        chrome.action.setBadgeText({ text: '', tabId: tabId });
    }

    detectedSubjects.set(tabId, updatedInfo);
    return updatedInfo;
}

// Clear info when tab is closed or navigates away
chrome.tabs.onRemoved.addListener((tabId) => {
    detectedSubjects.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && changeInfo.url) {
        if (!changeInfo.url.includes('movie.douban.com/subject/')) {
            detectedSubjects.delete(tabId);
            chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
    }
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

async function addToArr(service, id, mediaType, profileId, rootFolder) {
    const settings = await chrome.storage.sync.get([
        'radarrUrl', 'radarrApiKey',
        'sonarrUrl', 'sonarrApiKey'
    ]);
    const baseUrl = service === 'radarr' ? settings.radarrUrl : settings.sonarrUrl;
    const apiKey = service === 'radarr' ? settings.radarrApiKey : settings.sonarrApiKey;

    if (!baseUrl || !apiKey) {
        throw new Error(`${service} URL or API Key not configured`);
    }

    if (service === 'radarr') {
        return handleRadarrAdd(baseUrl, apiKey, id, profileId, rootFolder);
    } else {
        return handleSonarrAdd(baseUrl, apiKey, id, profileId, rootFolder);
    }
}

async function handleRadarrAdd(baseUrl, apiKey, imdbId, profileId, rootFolder) {
    const lookupUrl = `${baseUrl}/api/v3/movie/lookup?term=imdb:${imdbId}&apiKey=${apiKey}`;
    const lookupResp = await fetch(lookupUrl);
    if (!lookupResp.ok) throw new Error('Radarr lookup failed');
    const movieDataArr = await lookupResp.json();
    if (!movieDataArr.length) throw new Error('Movie not found for addition');
    const movieData = movieDataArr[0];

    if (movieData.id && movieData.id !== 0) {
        return { success: false, error: 'Movie already in library' };
    }

    let preferredProfileId = profileId;
    let preferredRootFolder = rootFolder;

    if (!preferredProfileId || !preferredRootFolder) {
        const rootFolders = await (await fetch(`${baseUrl}/api/v3/rootfolder?apiKey=${apiKey}`)).json();
        const qualityProfiles = await (await fetch(`${baseUrl}/api/v3/qualityprofile?apiKey=${apiKey}`)).json();
        if (!rootFolders.length || !qualityProfiles.length) throw new Error('Could not find root folder or quality profile');
        preferredProfileId = preferredProfileId || qualityProfiles[0].id;
        preferredRootFolder = preferredRootFolder || rootFolders[0].path;
    }

    const addPayload = {
        ...movieData,
        rootFolderPath: preferredRootFolder,
        qualityProfileId: parseInt(preferredProfileId),
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

async function handleSonarrAdd(baseUrl, apiKey, imdbId, profileId, rootFolder) {
    const lookupUrl = `${baseUrl}/api/v3/series/lookup?term=imdb:${imdbId}&apiKey=${apiKey}`;
    const lookupResp = await fetch(lookupUrl);
    if (!lookupResp.ok) throw new Error('Sonarr lookup failed');
    const seriesDataArr = await lookupResp.json();
    if (!seriesDataArr.length) throw new Error('Series not found by IMDb ID');
    const seriesData = seriesDataArr[0];

    if (seriesData.id && seriesData.id !== 0) {
        return { success: false, error: 'Series already in library' };
    }

    let preferredProfileId = profileId;
    let preferredRootFolder = rootFolder;

    if (!preferredProfileId || !preferredRootFolder) {
        const rootFolders = await (await fetch(`${baseUrl}/api/v3/rootfolder?apiKey=${apiKey}`)).json();
        const qualityProfiles = await (await fetch(`${baseUrl}/api/v3/qualityprofile?apiKey=${apiKey}`)).json();
        if (!rootFolders.length || !qualityProfiles.length) throw new Error('Could not find root folder or quality profile');
        preferredProfileId = preferredProfileId || qualityProfiles[0].id;
        preferredRootFolder = preferredRootFolder || rootFolders[0].path;
    }

    const addPayload = {
        ...seriesData,
        rootFolderPath: preferredRootFolder,
        qualityProfileId: parseInt(preferredProfileId),
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
