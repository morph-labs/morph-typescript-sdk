// Integration test for the browser example
// Tests browser automation functionality

import { experimental } from "morphcloud";

// Optional Playwright test - only runs if Playwright is available
const hasPlaywright = (() => {
  try {
    require('playwright');
    return true;
  } catch {
    return false;
  }
})();

jest.setTimeout(10 * 60 * 1000); // 10 minutes for browser operations

describe("🌐 Browser Example Integration Tests", () => {
  const instancesToCleanup: string[] = [];

  afterAll(async () => {
    // Clean up instances
    for (const id of instancesToCleanup) {
      try {
        const { MorphCloudClient } = require("morphcloud");
        const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
  });

  test("should create browser session and provide correct URLs", async () => {
    const mb = new experimental.MorphBrowser();
    
    const session = await mb.sessions.create({ 
      verbose: true,
      vcpus: 1,
      memory: 2048
    });
    
    instancesToCleanup.push(session.instance.id);
    
    try {
      // Verify session provides expected interface
      expect(session.connectUrl).toBeTruthy();
      expect(session.cdpUrl).toBeTruthy();
      
      // URL should be WebSocket protocol
      expect(session.connectUrl).toMatch(/^wss?:\/\//);
      
      // CDP URL should be HTTP protocol
      expect(session.cdpUrl).toMatch(/^https?:\/\//);
      
      // Test Chrome is running and accessible
      const version = await session.getVersion();
      expect(version.Browser).toContain("Chrome");
      expect(version.webSocketDebuggerUrl).toBeTruthy();
      
    } finally {
      await session.close();
    }
  });

  // Only run Playwright test if Playwright is available
  (hasPlaywright ? test : test.skip)("should work with Playwright browser automation", async () => {
    const { chromium } = require('playwright');
    
    const mb = new experimental.MorphBrowser();
    
    const session = await mb.sessions.create({ 
      verbose: true,
      vcpus: 1,
      memory: 2048
    });
    
    instancesToCleanup.push(session.instance.id);
    
    try {
      // Connect to the remote session using Playwright
      const browser = await chromium.connectOverCDP(session.connectUrl);
      
      expect(browser).toBeDefined();
      expect(browser.contexts().length).toBeGreaterThan(0);
      
      // Test basic navigation
      const context = browser.contexts()[0];
      const page = context.pages()[0];
      
      await page.goto("https://example.com");
      const title = await page.title();
      expect(title).toBeTruthy();
      
      // Test that we can interact with the page
      const content = await page.content();
      expect(content).toContain("html");
      
      await browser.close();
      
    } finally {
      await session.close();
    }
  });

  test("should handle browser session lifecycle correctly", async () => {
    const mb = new experimental.MorphBrowser();
    
    const session = await mb.sessions.create({ 
      verbose: false,
      vcpus: 1,
      memory: 2048
    });
    
    instancesToCleanup.push(session.instance.id);
    
    // Test session is ready
    const isReady = await session.isReady();
    expect(isReady).toBe(true);
    
    // Test we can get tabs
    const tabs = await session.getTabs();
    expect(Array.isArray(tabs)).toBe(true);
    
    // Test cleanup
    await session.close();
    
    // After close, instance should be stopped
    // Note: We don't remove from cleanup array as stop() might not be immediate
  });
});