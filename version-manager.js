const fs = require('fs');
const path = require('path');
const https = require('https');

class VersionManager {
    constructor() {
        this.versionFile = path.join(__dirname, 'version.txt');
        this._version = null;
        this.GITHUB_RAW_URL = 'https://raw.githubusercontent.com/adamwawrzynkowski/PROMPTR/main/version.txt';
        this.GITHUB_RELEASES_URL = 'https://github.com/adamwawrzynkowski/PROMPTR/releases';
    }

    getVersion() {
        if (!this._version) {
            try {
                this._version = fs.readFileSync(this.versionFile, 'utf8').trim();
            } catch (error) {
                console.error('Error reading version file:', error);
                this._version = '1.0.0'; // Fallback version
            }
        }
        return `v${this._version}`;
    }

    async checkForUpdates() {
        return new Promise((resolve, reject) => {
            https.get(this.GITHUB_RAW_URL, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const remoteVersion = data.trim();
                        const currentVersion = this.getVersion().substring(1); // Remove 'v' prefix
                        
                        console.log('Current version:', currentVersion);
                        console.log('Remote version:', remoteVersion);

                        const hasUpdate = this.compareVersions(remoteVersion, currentVersion) > 0;
                        resolve({
                            hasUpdate,
                            currentVersion: `v${currentVersion}`,
                            remoteVersion: `v${remoteVersion}`,
                            releasesUrl: this.GITHUB_RELEASES_URL
                        });
                    } catch (error) {
                        console.error('Error parsing version:', error);
                        reject(error);
                    }
                });
            }).on('error', (error) => {
                console.error('Error checking for updates:', error);
                reject(error);
            });
        });
    }

    compareVersions(v1, v2) {
        const v1Parts = v1.split('.').map(Number);
        const v2Parts = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;

            if (v1Part > v2Part) return 1;
            if (v1Part < v2Part) return -1;
        }

        return 0;
    }
}

module.exports = new VersionManager();
