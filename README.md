# Clock PWA — Free iPhone version

A static Progressive Web App starter. File contents and names are encrypted locally using Web Crypto AES-256-GCM. Password key derivation uses PBKDF2-HMAC-SHA-256 (600,000 iterations). The encryption key is held in memory only while unlocked. Records are stored in IndexedDB on the device.

## What this app does
- Runs as an installable web app on iPhone when served over HTTPS.
- No account, analytics, ads, upload endpoint, API, or cloud sync.
- Encrypts imported file bytes and file metadata before storing them in IndexedDB.
- Password lock, automatic lock after 60 seconds of inactivity, and lock when the page is backgrounded.
- Export individual decrypted files.
- Export/import an encrypted vault backup. The backup remains encrypted and needs the vault password to restore.

## Install on iPhone for free using Windows + GitHub Pages
1. Create a free GitHub account at https://github.com/.
2. Create a new public repository, for example `clock-private-vault-pwa`.
3. Extract this ZIP on Windows.
4. Upload **all contents inside this folder** to the repository root. Keep `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, and `icons/` together.
5. In the repository, open **Settings → Pages**.
6. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
7. Wait for GitHub Pages to publish. Open the published HTTPS address on your iPhone in Safari.
8. In Safari, tap **Share → Add to Home Screen → Add**.
9. Launch Clock from the Home Screen. Create a long password and store it safely.

GitHub hosts only the static app code. The app does not send vault files to GitHub or any server. The app needs HTTPS for Web Crypto and service workers. After the first successful load, the app shell is cached for offline startup.

## Important iPhone limitations
- This is a PWA, not a native iOS app. iOS browser storage can be evicted or cleared. Export an encrypted backup regularly and keep it in a safe location.
- The app's static code is served by GitHub Pages. Do not store personal files in the GitHub repository.
- iOS may show a file picker / Photos permission UI. The app reads the selected file in the browser and encrypts it locally; it does not remove the original from Photos.
- Individual file export creates a decrypted copy outside the vault. Keep it private and delete it when no longer needed.
- Very large files may exceed browser memory/storage limits. This starter limits a single import to 300 MB and reads the file into memory before encryption.
- This is a starter implementation, not a security-audited product. Test with non-sensitive sample files first.
- Do not clear Safari website data or delete the Home Screen app before exporting and verifying a backup.
- If the device is compromised, unlocked, or someone knows the vault password, files may be exposed. This is not a substitute for iOS device passcode security.
- Do not add third-party scripts, analytics, remote fonts, or external libraries.

## Security notes
AES-GCM provides authenticated encryption. Each encryption uses a fresh random 96-bit IV. Password-derived key is not persisted. A random salt and encrypted verifier are stored locally. File metadata is separately encrypted. The browser's IndexedDB storage is not hardware-backed Keychain storage, and JavaScript cannot guarantee secure memory erasure.
