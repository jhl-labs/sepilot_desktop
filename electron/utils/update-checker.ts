import { logger } from '../services/logger';
import https from 'https';

export interface ReleaseInfo {
  version: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  downloadUrl?: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseInfo?: ReleaseInfo;
}

const GITHUB_API_URL = 'https://api.github.com';
const REPO_OWNER = 'jhl-labs';
const REPO_NAME = 'sepilot-desktop';

/**
 * Fetch the latest release from GitHub
 */
async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'SEPilot-Desktop',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 404) {
          logger.info('[UpdateChecker] No releases found');
          resolve(null);
          return;
        }

        if (res.statusCode !== 200) {
          logger.error(`[UpdateChecker] GitHub API error: ${res.statusCode}`);
          reject(new Error(`GitHub API returned ${res.statusCode}`));
          return;
        }

        try {
          const release = JSON.parse(data);

          // Find Windows installer asset
          let downloadUrl: string | undefined;
          if (release.assets && Array.isArray(release.assets)) {
            const windowsAsset = release.assets.find((asset: any) =>
              asset.name.endsWith('.exe') && asset.name.includes('Setup')
            );
            downloadUrl = windowsAsset?.browser_download_url;
          }

          const releaseInfo: ReleaseInfo = {
            version: release.tag_name?.replace(/^v/, '') || release.name,
            name: release.name || release.tag_name,
            publishedAt: release.published_at,
            htmlUrl: release.html_url,
            body: release.body || '',
            downloadUrl,
          };

          resolve(releaseInfo);
        } catch (error) {
          logger.error('[UpdateChecker] Failed to parse GitHub response:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      logger.error('[UpdateChecker] Request failed:', error);
      reject(error);
    });

    req.end();
  });
}

/**
 * Compare two semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

/**
 * Check for updates from GitHub releases
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  try {
    logger.info(`[UpdateChecker] Checking for updates... Current version: ${currentVersion}`);

    const latestRelease = await fetchLatestRelease();

    if (!latestRelease) {
      logger.info('[UpdateChecker] No releases available');
      return {
        hasUpdate: false,
        currentVersion,
      };
    }

    logger.info(`[UpdateChecker] Latest release: ${latestRelease.version}`);

    const hasUpdate = compareVersions(latestRelease.version, currentVersion) > 0;

    if (hasUpdate) {
      logger.info(`[UpdateChecker] Update available: ${latestRelease.version}`);
    } else {
      logger.info('[UpdateChecker] Application is up to date');
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestRelease.version,
      releaseInfo: hasUpdate ? latestRelease : undefined,
    };
  } catch (error) {
    logger.error('[UpdateChecker] Failed to check for updates:', error);
    return {
      hasUpdate: false,
      currentVersion,
    };
  }
}
