document.addEventListener('DOMContentLoaded', () => {
    // Load existing settings
    chrome.storage.sync.get([
        'radarrUrl', 'radarrApiKey', 'sonarrUrl', 'sonarrApiKey'
    ], (items) => {
        if (items.radarrUrl) document.getElementById('radarr-url').value = items.radarrUrl;
        if (items.radarrApiKey) document.getElementById('radarr-api-key').value = items.radarrApiKey;
        if (items.sonarrUrl) document.getElementById('sonarr-url').value = items.sonarrUrl;
        if (items.sonarrApiKey) document.getElementById('sonarr-api-key').value = items.sonarrApiKey;
    });

    const statusMsg = document.getElementById('global-status');

    function showStatus(text, type = 'success') {
        statusMsg.textContent = text;
        statusMsg.className = `status-msg ${type}`;
        setTimeout(() => {
            statusMsg.className = 'status-msg';
        }, 3000);
    }

    // Save settings
    document.getElementById('save-btn').addEventListener('click', () => {
        const settings = {
            radarrUrl: document.getElementById('radarr-url').value.replace(/\/$/, ''),
            radarrApiKey: document.getElementById('radarr-api-key').value,
            sonarrUrl: document.getElementById('sonarr-url').value.replace(/\/$/, ''),
            sonarrApiKey: document.getElementById('sonarr-api-key').value
        };

        chrome.storage.sync.set(settings, () => {
            showStatus('Settings saved successfully!');
        });
    });

    // Test connection
    document.querySelectorAll('.test-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const service = e.target.dataset.service;
            const url = document.getElementById(`${service}-url`).value.replace(/\/$/, '');
            const apiKey = document.getElementById(`${service}-api-key`).value;

            if (!url || !apiKey) {
                showStatus('Please enter both URL and API Key', 'error');
                return;
            }

            e.target.disabled = true;
            e.target.textContent = 'Testing...';

            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'TEST_CONNECTION',
                    service,
                    url,
                    apiKey
                });

                if (response.success) {
                    showStatus(`${service.charAt(0).toUpperCase() + service.slice(1)} connection successful!`);
                } else {
                    showStatus(`${service}: ${response.error}`, 'error');
                }
            } catch (err) {
                showStatus(`Test failed: ${err.message}`, 'error');
            }

            e.target.disabled = false;
            e.target.textContent = 'Test Connection';
        });
    });
});
