document.addEventListener('DOMContentLoaded', async () => {
    const radarrDot = document.getElementById('radarr-status');
    const sonarrDot = document.getElementById('sonarr-status');
    const pageInfo = document.getElementById('page-info');
    const discoveryActions = document.getElementById('discovery-actions');
    const subjectDetails = document.getElementById('subject-details');
    const libraryBadge = document.getElementById('library-badge');
    const addBtn = document.getElementById('add-btn');
    const configError = document.getElementById('config-error');
    const globalStatus = document.getElementById('global-status');

    const rootFolderSelect = document.getElementById('root-folder-select');
    const qualityProfileSelect = document.getElementById('quality-profile-select');
    const selectorsContainer = document.getElementById('selectors-container');

    // 1. Check connections
    const settings = await chrome.storage.sync.get(['radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey']);

    if (settings.radarrUrl && settings.radarrApiKey) {
        checkStatus('radarr', settings.radarrUrl, settings.radarrApiKey, radarrDot);
    }
    if (settings.sonarrUrl && settings.sonarrApiKey) {
        checkStatus('sonarr', settings.sonarrUrl, settings.sonarrApiKey, sonarrDot);
    }

    async function checkStatus(service, url, apiKey, element) {
        try {
            const resp = await chrome.runtime.sendMessage({
                type: 'TEST_CONNECTION',
                service,
                url,
                apiKey
            });
            if (resp.success) {
                element.className = 'dot green';
            } else {
                element.className = 'dot red';
            }
        } catch (e) {
            element.className = 'dot red';
        }
    }

    // 2. Check detected subject from background
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
        let info = await chrome.runtime.sendMessage({
            type: 'GET_DETECTED_SUBJECT',
            tabId: tab.id
        });

        // Fallback: Try to message the content script directly if not checked
        if (!info && tab.url.includes('movie.douban.com/subject/')) {
            try {
                const pageInfoFromContent = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
                if (pageInfoFromContent) {
                    const subjectData = {
                        ...pageInfoFromContent,
                        service: pageInfoFromContent.isTV ? 'sonarr' : 'radarr',
                        tabId: tab.id
                    };
                    // Re-trigger background check and WAIT for enriched info
                    info = await chrome.runtime.sendMessage({ type: 'SUBJECT_DETECTED', ...subjectData });
                }
            } catch (err) { }
        }

        if (info) {
            pageInfo.style.display = 'block';
            subjectDetails.textContent = `${info.title || info.id} (${info.isTV ? 'Series' : 'Movie'})`;

            if (info.libraryStatus) {
                libraryBadge.textContent = info.libraryStatus.statusText;
                if (info.libraryStatus.statusText === 'Downloaded') {
                    libraryBadge.className = 'badge badge-success';
                } else if (['Monitored', 'In Library', 'Downloading', 'Partially Downloaded'].includes(info.libraryStatus.statusText)) {
                    libraryBadge.className = 'badge badge-warning';
                } else {
                    libraryBadge.className = 'badge badge-neutral';
                }

                if (info.libraryStatus.inLibrary) {
                    selectorsContainer.style.display = 'none';
                    addBtn.style.display = 'none';
                } else {
                    setupSelectors(info, settings);
                }
            } else {
                setupSelectors(info, settings);
            }
        }
    }

    async function setupSelectors(info, settings) {
        const currentService = info.service;
        const baseUrl = currentService === 'radarr' ? settings.radarrUrl : settings.sonarrUrl;
        const apiKey = currentService === 'radarr' ? settings.radarrApiKey : settings.sonarrApiKey;

        if (baseUrl && apiKey) {
            selectorsContainer.style.display = 'block';
            addBtn.style.display = 'block';
            addBtn.textContent = 'Fetching metadata...';
            addBtn.disabled = true;

            try {
                const metaResponse = await chrome.runtime.sendMessage({
                    type: 'FETCH_METADATA',
                    service: currentService,
                    url: baseUrl,
                    apiKey: apiKey
                });

                if (metaResponse.success) {
                    const lastUsed = await chrome.storage.sync.get([
                        `${currentService}LastFolder`,
                        `${currentService}LastProfile`
                    ]);

                    rootFolderSelect.innerHTML = metaResponse.folders.map(f =>
                        `<option value="${f.path}" ${f.path === lastUsed[`${currentService}LastFolder`] ? 'selected' : ''}>${f.path}</option>`
                    ).join('');

                    qualityProfileSelect.innerHTML = metaResponse.profiles.map(p =>
                        `<option value="${p.id}" ${p.id == lastUsed[`${currentService}LastProfile`] ? 'selected' : ''}>${p.name}</option>`
                    ).join('');

                    addBtn.disabled = false;
                    addBtn.textContent = `Add to ${currentService.charAt(0).toUpperCase() + currentService.slice(1)}`;

                    addBtn.onclick = async () => {
                        const selectedFolder = rootFolderSelect.value;
                        const selectedProfile = qualityProfileSelect.value;

                        addBtn.disabled = true;
                        addBtn.textContent = 'Adding...';

                        try {
                            const response = await chrome.runtime.sendMessage({
                                type: 'ADD_TO_ARR',
                                service: currentService,
                                id: info.id,
                                mediaType: info.isTV ? 'tv' : 'movie',
                                profileId: selectedProfile,
                                rootFolder: selectedFolder
                            });

                            if (response.success) {
                                showGlobalStatus('Successfully added!', 'success');
                                addBtn.style.display = 'none';
                                selectorsContainer.style.display = 'none';
                                libraryBadge.textContent = 'Added';
                                libraryBadge.className = 'badge badge-warning';

                                const update = {};
                                update[`${currentService}LastFolder`] = selectedFolder;
                                update[`${currentService}LastProfile`] = selectedProfile;
                                chrome.storage.sync.set(update);
                            } else {
                                showGlobalStatus(`Error: ${response.error}`, 'error');
                                addBtn.disabled = false;
                                addBtn.textContent = `Add to ${currentService.charAt(0).toUpperCase() + currentService.slice(1)}`;
                            }
                        } catch (err) {
                            showGlobalStatus(`Error: ${err.message}`, 'error');
                            addBtn.disabled = false;
                        }
                    };
                } else {
                    throw new Error(metaResponse.error);
                }
            } catch (err) {
                showGlobalStatus(`Metadata Error: ${err.message}`, 'error');
                addBtn.style.display = 'none';
                selectorsContainer.style.display = 'none';
            }
        } else {
            configError.textContent = `⚠️ ${currentService.charAt(0).toUpperCase() + currentService.slice(1)} is not configured.`;
            configError.style.display = 'block';
            addBtn.style.display = 'none';
        }
    }

    function showGlobalStatus(text, type) {
        globalStatus.textContent = text;
        globalStatus.style.display = 'block';
        globalStatus.style.background = type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        globalStatus.style.color = type === 'success' ? '#22c55e' : '#ef4444';
        setTimeout(() => {
            globalStatus.style.display = 'none';
        }, 5000);
    }
});
