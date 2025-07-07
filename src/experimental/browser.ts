import { Snapshot } from "./index.js";
import { Instance } from "../api.js";

// Constants
const CHROME_CDP_PORT = 9222;
const PROXY_PORT = 9223;
const CHROME_STARTUP_TIMEOUT = 30;
const PROXY_STARTUP_TIMEOUT = 10;
const HTTP_TIMEOUT = 10;
const DEFAULT_VCPUS = 1;
const DEFAULT_MEMORY = 4 * 1024; // 4GB
const DEFAULT_DISK_SIZE = 16 * 1024; // 16GB

interface BrowserSessionOptions {
  name?: string;
  vcpus?: number;
  memory?: number;
  diskSize?: number;
  verbose?: boolean;
  invalidate?: boolean;
  ttlSeconds?: number;
}

export class BrowserSession {
  private _instance: Instance;
  private _cdpUrl: string;
  private _connectUrl: string;

  constructor(instance: Instance, cdpUrl: string, connectUrl: string) {
    this._instance = instance;
    this._cdpUrl = cdpUrl;
    this._connectUrl = connectUrl;
  }

  get connectUrl(): string {
    return this._connectUrl;
  }

  get cdpUrl(): string {
    return this._cdpUrl;
  }

  get instance(): Instance {
    return this._instance;
  }

  async getTabs(): Promise<any[]> {
    try {
      const response = await fetch(`${this._cdpUrl}/json`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(HTTP_TIMEOUT * 1000)
      });
      
      if (response.ok) {
        return await response.json();
      } else {
        throw new Error(`Failed to get tabs: HTTP ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error getting tabs: ${error}`);
    }
  }

  async getVersion(): Promise<Record<string, any>> {
    try {
      const response = await fetch(`${this._cdpUrl}/json/version`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(HTTP_TIMEOUT * 1000)
      });
      
      if (response.ok) {
        return await response.json();
      } else {
        throw new Error(`Failed to get version: HTTP ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error getting version: ${error}`);
    }
  }

  async isReady(): Promise<boolean> {
    try {
      // Try HTTP CDP endpoint first
      const response = await fetch(`${this._cdpUrl}/json/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore and try fallback
    }

    // Fallback: check if WebSocket URL is properly formed
    try {
      return (
        this._connectUrl !== null &&
        this._connectUrl.includes('devtools') &&
        (this._connectUrl.startsWith('ws://') || this._connectUrl.startsWith('wss://'))
      );
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this._instance) {
      try {
        await this._instance.stop();
      } catch {
        // Service might already be hidden or instance stopped
      }
    }
  }

  private static getChromeCommand(): string[] {
    return [
      "google-chrome",
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI,VizDisplayCompositor",
      "--enable-features=NetworkService",
      "--remote-debugging-address=0.0.0.0",
      `--remote-debugging-port=${CHROME_CDP_PORT}`,
      "--user-data-dir=/tmp/chrome-user-data",
      "--data-path=/tmp/chrome-data",
      "--disk-cache-dir=/tmp/chrome-cache",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-plugins",
      "--allow-running-insecure-content",
      "--disable-web-security",
      "--remote-allow-origins=*"
    ];
  }

  private static generateCaddyConfig(): string {
    return `:80 {
    handle /health {
        respond "Browser Session Active" 200
    }
    
    handle /json* {
        reverse_proxy localhost:9222 {
            header_up Host localhost:9222
        }
    }
    
    handle /devtools* {
        reverse_proxy localhost:9222 {
            header_up Host localhost:9222
        }
    }
    
    handle {
        respond "Browser Management Interface" 200
    }
}`;
  }

  private static async getWebsocketUrl(
    instance: Instance, 
    cdpUrl: string, 
    verbose: boolean
  ): Promise<string> {
    if (verbose) {
      console.log("Getting Chrome WebSocket URL...");
    }

    let connectUrl: string | null = null;

    // Try to get version data from external URL
    try {
      const response = await fetch(`${cdpUrl}/json/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const versionData = await response.json();
        if (verbose) {
          console.log("Successfully got version data from external URL");
        }

        if (versionData.webSocketDebuggerUrl) {
          const chromeWsUrl = versionData.webSocketDebuggerUrl;
          // Convert to external WebSocket URL
          if (chromeWsUrl.includes('devtools/browser/')) {
            const browserUuid = chromeWsUrl.split('devtools/browser/')[1];
            const wsBase = cdpUrl.replace('http://', '').replace('https://', '');
            const wsProtocol = cdpUrl.startsWith('https://') ? 'wss' : 'ws';
            connectUrl = `${wsProtocol}://${wsBase}/devtools/browser/${browserUuid}`;
            if (verbose) {
              console.log("Using browser-level WebSocket URL");
            }
          }
        }
      }
    } catch (error) {
      if (verbose) {
        console.warn(`External version request failed: ${error}`);
      }
    }

    // Fallback to internal method if external doesn't work
    if (!connectUrl) {
      const versionResult = await instance.exec("curl -s http://localhost:80/json/version");
      if (versionResult.exitCode === 0) {
        try {
          const versionData = JSON.parse(versionResult.stdout);
          if (verbose) {
            console.log("Got version data from internal Caddy proxy");
          }

          if (versionData.webSocketDebuggerUrl) {
            const chromeWsUrl = versionData.webSocketDebuggerUrl;
            if (verbose) {
              console.log(`Chrome browser WebSocket URL: ${chromeWsUrl}`);
            }

            if (chromeWsUrl.includes('devtools/browser/')) {
              const browserUuid = chromeWsUrl.split('devtools/browser/')[1];
              const wsBase = cdpUrl.replace('http://', '').replace('https://', '');
              const wsProtocol = cdpUrl.startsWith('https://') ? 'wss' : 'ws';
              connectUrl = `${wsProtocol}://${wsBase}/devtools/browser/${browserUuid}`;
              if (verbose) {
                console.log("Using browser-level WebSocket URL for Playwright");
              }
            }
          }
        } catch (error) {
          if (verbose) {
            console.warn(`Error parsing version: ${error}`);
          }
        }
      }

      // If browser-level URL not found, try to get page-level URLs from /json
      if (!connectUrl) {
        const internalTabs = await instance.exec("curl -s http://localhost:80/json");
        if (internalTabs.exitCode === 0) {
          try {
            const tabsData = JSON.parse(internalTabs.stdout);
            if (verbose) {
              console.log(`Got tabs from Caddy proxy: ${tabsData.length} tabs`);
            }

            // Look for a page-level WebSocket URL as fallback
            for (const tab of tabsData) {
              if (tab.type === 'page' && tab.webSocketDebuggerUrl) {
                const chromeWsUrl = tab.webSocketDebuggerUrl;
                if (verbose) {
                  console.log(`Using page-level WebSocket URL: ${chromeWsUrl}`);
                }

                if (chromeWsUrl.includes('devtools/page/')) {
                  const pageUuid = chromeWsUrl.split('devtools/page/')[1];
                  const wsBase = cdpUrl.replace('http://', '').replace('https://', '');
                  const wsProtocol = cdpUrl.startsWith('https://') ? 'wss' : 'ws';
                  connectUrl = `${wsProtocol}://${wsBase}/devtools/page/${pageUuid}`;
                  if (verbose) {
                    console.warn("Using page-level WebSocket URL as fallback");
                  }
                  break;
                }
              }
            }
          } catch (error) {
            if (verbose) {
              console.warn(`Error parsing tabs: ${error}`);
            }
          }
        }
      }
    }

    // Ultimate fallback: use hardcoded browser path
    if (!connectUrl) {
      const wsBase = cdpUrl.replace('http://', '').replace('https://', '');
      const wsProtocol = cdpUrl.startsWith('https://') ? 'wss' : 'ws';
      connectUrl = `${wsProtocol}://${wsBase}/devtools/browser`;
      if (verbose) {
        console.warn("Using hardcoded browser WebSocket URL as final fallback");
      }
    }

    if (verbose) {
      console.log(`Final WebSocket URL: ${connectUrl}`);
    }

    return connectUrl;
  }

  private static async createSnapshot(
    name: string, 
    vcpus: number, 
    memory: number, 
    diskSize: number, 
    verbose: boolean, 
    invalidate: boolean = false
  ): Promise<Snapshot> {
    // Use a consistent base name for caching
    const baseSnapshotName = `chrome-base-${vcpus}cpu-${memory}mb`;

    if (verbose) {
      console.log(`Creating Chrome snapshot: ${baseSnapshotName}`);
    }

    // Try to get existing snapshot
    if (!invalidate) {
      try {
        const existingSnapshot = await Snapshot.fromTag(baseSnapshotName);
        if (existingSnapshot) {
          console.log(`Using existing chrome snapshot: ${baseSnapshotName}`);
          return existingSnapshot;
        }
      } catch {
        // Fall through to create new snapshot
      }
    }

    console.log('Creating Chrome snapshot...');
    let snapshot = await Snapshot.create(
      baseSnapshotName,
      "morphvm-minimal",
      vcpus,
      memory,
      diskSize,
      invalidate
    );

    // Layer 1: Update package lists
    snapshot = await snapshot.run("apt-get update -y");
    console.log('Updated package lists');

    // Layer 2: Install dependencies including tmux
    snapshot = await snapshot.run("apt-get install -y curl wget gnupg lsb-release tmux");
    console.log('Installed dependencies');

    // Add Caddy repository and install
    snapshot = await snapshot.run("curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg");
    snapshot = await snapshot.run("curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list");
    snapshot = await snapshot.run("apt-get update -y && apt-get install -y caddy");
    console.log('Installed Caddy');

    // Layer 3: Add Google Chrome repository
    snapshot = await snapshot.run("wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | tee /etc/apt/trusted.gpg.d/google.gpg > /dev/null");
    snapshot = await snapshot.run('echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google-chrome.list');
    console.log('Added Google Chrome repository');

    // Layer 4: Update and install Chrome
    snapshot = await snapshot.run("apt-get update -y");
    snapshot = await snapshot.run("apt-get install -y google-chrome-stable");
    console.log('Installed Chrome');

    // Layer 5: Install additional Chrome dependencies
    snapshot = await snapshot.run("apt-get install -y fonts-liberation libasound2 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libnss3");
    console.log('Installed Chrome dependencies');

    // Tag the snapshot for future use
    await snapshot.tag(baseSnapshotName);

    return snapshot;
  }

  static async create(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    const {
      name = `browser-${Math.random().toString(36).substring(2, 10)}`,
      vcpus = DEFAULT_VCPUS,
      memory = DEFAULT_MEMORY,
      diskSize = DEFAULT_DISK_SIZE,
      verbose = false,
      invalidate = false,
      ttlSeconds
    } = options;

    if (verbose) {
      console.log(`Creating browser session '${name}' with Chrome...`);
    }

    try {
      const snapshot = await BrowserSession.createSnapshot(
        name, vcpus, memory, diskSize, verbose, invalidate
      );

      if (verbose) {
        console.log("Snapshot created, starting instance...");
      }

      // Start instance
      const instance = await snapshot.start({ name }, ttlSeconds);

      // Verify Chrome installation
      if (verbose) {
        console.log("Verifying Chrome installation...");
      }
      const result = await instance.exec("google-chrome --version");
      if (result.exitCode !== 0) {
        throw new Error(`Chrome not properly installed: ${result.stderr}`);
      }
      if (verbose) {
        console.log(`Chrome installed: ${result.stdout.trim()}`);
      }

      // Start headless Chrome with CDP
      if (verbose) {
        console.log("Starting headless Chrome...");
      }
      const chromeCommand = BrowserSession.getChromeCommand();

      // Create user data directory
      await instance.exec("mkdir -p /tmp/chrome-user-data /tmp/chrome-data /tmp/chrome-cache");

      // Start Chrome in tmux session
      const chromeCmdStr = chromeCommand.join(" ");
      await instance.exec("tmux new-session -d -s chrome-session");
      await instance.exec(`tmux send-keys -t chrome-session '${chromeCmdStr}' Enter`);

      // Write Caddy config and start Caddy
      const caddyConfig = BrowserSession.generateCaddyConfig();
      await instance.exec("rm -f /etc/caddy/Caddyfile");
      
      // Write config file safely
      for (const line of caddyConfig.split('\n')) {
        const escapedLine = line.replace(/"/g, '\\"');
        await instance.exec(`echo "${escapedLine}" >> /etc/caddy/Caddyfile`);
      }

      // Start Caddy in tmux session
      await instance.exec("tmux new-session -d -s caddy-session");
      await instance.exec("tmux send-keys -t caddy-session 'caddy run --config /etc/caddy/Caddyfile' Enter");

      // Wait for Chrome to start and CDP to be ready
      if (verbose) {
        console.log("Waiting for Chrome CDP to be ready...");
      }

      let chromeReady = false;
      for (let i = 0; i < CHROME_STARTUP_TIMEOUT; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await instance.exec(`curl -s http://localhost:${CHROME_CDP_PORT}/json/version 2>/dev/null`);
        if (result.exitCode === 0) {
          try {
            const versionData = JSON.parse(result.stdout);
            if (versionData.Browser) {
              if (verbose) {
                console.log(`Chrome CDP ready after ${i + 1}s`);
                console.log(`Browser: ${versionData.Browser}`);
                console.log(`Protocol: ${versionData['Protocol-Version']}`);
              }
              chromeReady = true;
              break;
            }
          } catch {
            // Continue waiting
          }
        }
        if (i % 5 === 0 && verbose) {
          console.log(`Starting Chrome... ${i + 1}/${CHROME_STARTUP_TIMEOUT}`);
        }
      }

      if (!chromeReady) {
        throw new Error(`Chrome failed to start within ${CHROME_STARTUP_TIMEOUT} seconds`);
      }

      // Create an initial page via CDP
      if (verbose) {
        console.log("Creating initial page via CDP...");
      }
      const createPageResult = await instance.exec(`curl -s -X PUT "http://localhost:${CHROME_CDP_PORT}/json/new?about:blank"`);
      if (createPageResult.exitCode === 0) {
        if (verbose) {
          console.log("Initial page created successfully");
        }
      } else if (verbose) {
        console.warn(`Failed to create initial page: ${createPageResult.stderr}`);
      }

      // Wait for Caddy to be ready
      if (verbose) {
        console.log("Waiting for Caddy to be ready...");
      }
      let caddyReady = false;
      for (let i = 0; i < PROXY_STARTUP_TIMEOUT; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const caddyTest = await instance.exec("curl -s http://localhost:80/health");
        if (caddyTest.exitCode === 0 && caddyTest.stdout.includes("Browser Session Active")) {
          if (verbose) {
            console.log(`Caddy ready after ${i + 1}s`);
          }
          caddyReady = true;
          break;
        }
      }

      if (!caddyReady) {
        throw new Error("Caddy failed to start");
      }

      // Expose service externally on port 80
      if (verbose) {
        console.log("Exposing CDP proxy service on port 80...");
      }
      const service = await instance.exposeHttpService("cdp-server", 80);
      const cdpUrl = service.url;

      // Test external access
      if (verbose) {
        console.log("Testing external access...");
        console.log(`CDP URL: ${cdpUrl}`);
      }

      // Get WebSocket URL from Chrome response
      const connectUrl = await BrowserSession.getWebsocketUrl(instance, cdpUrl, verbose);

      // Create and return session
      const session = new BrowserSession(instance, cdpUrl, connectUrl);
      if (verbose) {
        console.log("Browser session ready!");
        console.log(`CDP URL: ${cdpUrl}`);
        console.log(`Connect URL: ${connectUrl}`);

        // Log instance details
        try {
          console.log(`MorphVM Instance: ${instance.id}`);
          console.log(`Instance status: ${instance.status}`);
          console.log(`Resources: ${instance.spec.vcpus} vCPUs, ${instance.spec.memory}MB RAM, ${instance.spec.diskSize}MB disk`);
        } catch (error) {
          console.debug(`Could not get instance details: ${error}`);
        }
      }

      return session;
    } catch (error) {
      throw new Error(`Failed to create browser session: ${error}`);
    }
  }
}

export class SessionManager {
  async create(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    return await BrowserSession.create(options);
  }
}

export class MorphBrowser {
  public sessions: SessionManager;

  constructor() {
    this.sessions = new SessionManager();
  }
}

export function ensurePlaywright(): void {
  try {
    require('playwright');
  } catch (error) {
    throw new Error(`Playwright is not installed: ${error}`);
  }
}