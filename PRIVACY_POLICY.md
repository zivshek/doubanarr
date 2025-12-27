# Privacy Policy for Doubanarr

Last updated: December 26, 2025

Doubanarr (the "Extension") is a browser extension designed to integrate Douban movie and TV show pages with private Radarr and Sonarr instances. Your privacy is important to us.

## 1. Information Collection and Use

Doubanarr **does not collect, store, or transmit any personal information** to any third-party servers or the developer. 

The extension requires the following information from you to function:
*   **Radarr/Sonarr URLs and API Keys**: These are entered by the user in the extension's options page.
*   **Preferred Language**: Used to display the user interface in your preferred language.

## 2. Data Storage

All settings and configuration data (including API keys and URLs) are stored locally using the `chrome.storage.sync` API. This data is synced across your signed-in browser sessions via your Google account but is never accessed by the developer or shared with any external parties.

## 3. Communication with Third-Party Services

The extension performs the following network requests:
*   **Douban (movie.douban.com)**: To retrieve movie/series metadata (such as IMDb IDs) from the pages you visit.
*   **Your Radarr/Sonarr Instances**: To check the status of media in your library and to add new media. These requests are made directly from your browser to the URLs you provide.

## 4. Security

Your API keys and server URLs are treated as sensitive information. They are stored within the browser's protected storage area and are only transmitted to your own specified server endpoints for the intended purpose of the extension.

## 5. Changes to This Privacy Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on the repository or updating the extension.

## 6. Contact Us

If you have any questions or suggestions about this Privacy Policy, please contact the developer via the GitHub repository issues.
