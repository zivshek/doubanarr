document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial UI translation
    updateUI();

    // 2. Load existing settings
    chrome.storage.sync.get([
        'radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey', 'preferredLanguage'
    ], (items) => {
        if (items.radarrUrl) document.getElementById('radarr-url').value = items.radarrUrl;
        if (items.radarrApiKey) document.getElementById('radarr-api-key').value = items.radarrApiKey;
        if (items.sonarrUrl) document.getElementById('sonarr-url').value = items.sonarrUrl;
        if (items.sonarrApiKey) document.getElementById('sonarr-api-key').value = items.sonarrApiKey;
        if (items.preferredLanguage) document.getElementById('preferred-language').value = items.preferredLanguage;
    });

    const statusMsg = document.getElementById('global-status');

    async function showStatus(textKey, type = 'success', isLiteral = false) {
        const text = isLiteral ? textKey : await getTranslation(textKey);
        statusMsg.textContent = text;
        statusMsg.className = `status-msg ${type}`;
        setTimeout(() => {
            statusMsg.className = 'status-msg';
        }, 3000);
    }

    async function updateUI() {
        // Translate elements with data-key
        const elements = document.querySelectorAll('[data-key]');
        for (const el of elements) {
            const key = el.getAttribute('data-key');
            el.textContent = await getTranslation(key);
        }

        // Translate specific IDs
        const ids = ['header-desc', 'general-title', 'lang-label', 'radarr-title', 'sonarr-title'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.textContent = await getTranslation(id.replace(/-([a-z])/g, (g) => g[1].toUpperCase()));
        }

        document.title = await getTranslation('settingsTitle');
    }

    // Language change handler
    document.getElementById('preferred-language').addEventListener('change', async (e) => {
        const lang = e.target.value;
        await chrome.storage.sync.set({ preferredLanguage: lang });
        updateUI();
    });

    // Save settings
    document.getElementById('save-btn').addEventListener('click', async () => {
        const settings = {
            radarrUrl: document.getElementById('radarr-url').value.replace(/\/$/, ''),
            radarrApiKey: document.getElementById('radarr-api-key').value,
            sonarrUrl: document.getElementById('sonarr-url').value.replace(/\/$/, ''),
            sonarrApiKey: document.getElementById('sonarr-api-key').value,
            preferredLanguage: document.getElementById('preferred-language').value
        };

        chrome.storage.sync.set(settings, async () => {
            showStatus('saved');
        });
    });

    // Test connection
    document.querySelectorAll('.test-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const service = e.target.dataset.service;
            const url = document.getElementById(`${service}-url`).value.replace(/\/$/, '');
            const apiKey = document.getElementById(`${service}-api-key`).value;

            if (!url || !apiKey) {
                showStatus('enterBoth', 'error'); // Need to add to i18n
                return;
            }

            const originalText = e.target.textContent;
            e.target.disabled = true;
            e.target.textContent = '...';

            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'TEST_CONNECTION',
                    service,
                    url,
                    apiKey
                });

                if (response.success) {
                    showStatus('testSuccess');
                } else {
                    const failPrefix = await getTranslation('testFailure');
                    showStatus(`${failPrefix}${response.error}`, 'error', true);
                }
            } catch (err) {
                const failPrefix = await getTranslation('testFailure');
                showStatus(`${failPrefix}${err.message}`, 'error', true);
            }

            e.target.disabled = false;
            e.target.textContent = originalText;
        });
    });
});
