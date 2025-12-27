document.addEventListener('DOMContentLoaded', async () => {
    const radarrDot = document.getElementById('radarr-status');
    const sonarrDot = document.getElementById('sonarr-status');
    const detectionMsg = document.getElementById('detection-msg');
    const discoveryActions = document.getElementById('discovery-actions');
    const subjectDetails = document.getElementById('subject-details');
    const addBtn = document.getElementById('add-btn');
    const configError = document.getElementById('config-error');
    const globalStatus = document.getElementById('global-status');

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
    if (tab) {
        const info = await chrome.runtime.sendMessage({
            type: 'GET_DETECTED_SUBJECT',
            tabId: tab.id
        });

        if (info) {
            detectionMsg.textContent = '✅ Douban Subject Detected';
            discoveryActions.style.display = 'block';
            subjectDetails.textContent = `${info.id} (${info.isTV ? 'Series' : 'Movie'})`;

            const serviceConfigured = info.service === 'radarr'
                ? (settings.radarrUrl && settings.radarrApiKey)
                : (settings.sonarrUrl && settings.sonarrApiKey);

            if (serviceConfigured) {
                addBtn.style.display = 'block';
                addBtn.textContent = `Add to ${info.service.charAt(0).toUpperCase() + info.service.slice(1)}`;
                addBtn.onclick = async () => {
                    addBtn.disabled = true;
                    addBtn.textContent = 'Adding...';

                    try {
                        const response = await chrome.runtime.sendMessage({
                            type: 'ADD_TO_ARR',
                            service: info.service,
                            id: info.id,
                            mediaType: info.isTV ? 'tv' : 'movie'
                        });

                        if (response.success) {
                            showGlobalStatus('Successfully added!', 'success');
                            addBtn.style.display = 'none';
                        } else {
                            showGlobalStatus(`Error: ${response.error}`, 'error');
                            addBtn.disabled = false;
                            addBtn.textContent = `Add to ${info.service.charAt(0).toUpperCase() + info.service.slice(1)}`;
                        }
                    } catch (err) {
                        showGlobalStatus(`Error: ${err.message}`, 'error');
                        addBtn.disabled = false;
                    }
                };
            } else {
                configError.textContent = `⚠️ ${info.service.charAt(0).toUpperCase() + info.service.slice(1)} is not configured. Please check Settings.`;
                configError.style.display = 'block';
            }
        } else {
            detectionMsg.textContent = '❌ No Douban subject detected';
        }
    }

    function showGlobalStatus(text, type) {
        globalStatus.textContent = text;
        globalStatus.style.display = 'block';
        globalStatus.style.color = type === 'success' ? '#22c55e' : '#ef4444';
        setTimeout(() => {
            globalStatus.style.display = 'none';
        }, 3000);
    }
});
