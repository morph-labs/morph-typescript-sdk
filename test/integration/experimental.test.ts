// Integration tests for experimental Snapshot and MorphBrowser APIs
// Tests the new experimental features ported from Python SDK

import { experimental } from "morphcloud";
import { MorphCloudClient, Instance } from "morphcloud";

jest.setTimeout(10 * 60 * 1000); // 10 minutes for browser operations

describe("🧪 Experimental Features Integration Tests", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  const snapshotsToCleanup: string[] = [];
  const instancesToCleanup: string[] = [];

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up instances first
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
    // Clean up snapshots
    for (const id of snapshotsToCleanup) {
      try {
        const s = await client.snapshots.get({ snapshotId: id });
        await s.delete();
      } catch {
        /* ignore */
      }
    }
  });

  describe("Enhanced Snapshot API", () => {
    test("should create and manage snapshots with high-level API", async () => {
      const testName = `test-snapshot-${Date.now()}`;
      
      // Create a new snapshot using the enhanced API
      const snapshot = await experimental.Snapshot.create(testName);
      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeTruthy();
      
      // Track for cleanup
      snapshotsToCleanup.push(snapshot.id);
      
      // Test command execution
      const updatedSnapshot = await snapshot.run("echo 'test command'");
      expect(updatedSnapshot).toBeDefined();
      expect(updatedSnapshot.id).not.toBe(snapshot.id); // Should be a new snapshot
      
      // Track new snapshot for cleanup
      snapshotsToCleanup.push(updatedSnapshot.id);
    });

    test("should support functional composition with apply()", async () => {
      const testName = `test-apply-${Date.now()}`;
      
      const snapshot = await experimental.Snapshot.create(testName);
      snapshotsToCleanup.push(snapshot.id);
      
      // Test functional composition
      const composedSnapshot = await snapshot.apply(async (instance: Instance) => {
        await instance.exec("mkdir -p /tmp/test");
      });
      
      expect(composedSnapshot).toBeDefined();
      expect(composedSnapshot.id).not.toBe(snapshot.id);
      snapshotsToCleanup.push(composedSnapshot.id);
    });

    test("should support verification with do() method", async () => {
      const testName = `test-verify-${Date.now()}`;
      
      const snapshot = await experimental.Snapshot.create(testName);
      snapshotsToCleanup.push(snapshot.id);
      
      // Test verification
      const verifiedSnapshot = await snapshot.do("create test file", [
        async (instance: Instance) => {
          const result = await instance.exec("touch /tmp/testfile");
          expect(result.exit_code).toBe(0);
        }
      ]);
      
      expect(verifiedSnapshot).toBeDefined();
      snapshotsToCleanup.push(verifiedSnapshot.id);
    });

    test("should support snapshot tagging", async () => {
      const testName = `test-tag-${Date.now()}`;
      const tagName = `tag-${Date.now()}`;
      
      const snapshot = await experimental.Snapshot.create(testName);
      snapshotsToCleanup.push(snapshot.id);
      
      // Tag the snapshot
      await snapshot.tag(tagName);
      
      // Try to retrieve by tag
      const retrievedSnapshot = await experimental.Snapshot.fromTag(tagName);
      expect(retrievedSnapshot).toBeDefined();
      expect(retrievedSnapshot!.id).toBe(snapshot.id);
    });
  });

  describe("MorphBrowser API", () => {
    test("should create and manage browser sessions", async () => {
      const mb = new experimental.MorphBrowser();
      
      // Create a browser session
      const session = await mb.sessions.create({ 
        verbose: false,
        vcpus: 1,
        memory: 2048 // 2GB for browser
      });
      
      expect(session).toBeDefined();
      expect(session.connectUrl).toBeTruthy();
      expect(session.cdpUrl).toBeTruthy();
      expect(session.instance).toBeDefined();
      
      // Track for cleanup
      instancesToCleanup.push(session.instance.id);
      
      // Test that the session is ready
      const isReady = await session.isReady();
      expect(isReady).toBe(true);
      
      // Clean up
      await session.close();
    });

    test("should provide Chrome DevTools Protocol endpoints", async () => {
      const mb = new experimental.MorphBrowser();
      
      const session = await mb.sessions.create({ 
        verbose: false,
        vcpus: 1,
        memory: 2048
      });
      
      instancesToCleanup.push(session.instance.id);
      
      try {
        // Test getting Chrome version
        const version = await session.getVersion();
        expect(version).toBeDefined();
        expect(version.Browser).toBeTruthy();
        expect(version.webSocketDebuggerUrl).toBeTruthy();
        
        // Test getting tabs
        const tabs = await session.getTabs();
        expect(Array.isArray(tabs)).toBe(true);
        
      } finally {
        await session.close();
      }
    });

    test("should support browser invalidation and rebuild", async () => {
      const mb = new experimental.MorphBrowser();
      
      // Create session with invalidation
      const session = await mb.sessions.create({ 
        verbose: false,
        invalidate: true,
        vcpus: 1,
        memory: 2048
      });
      
      instancesToCleanup.push(session.instance.id);
      
      expect(session).toBeDefined();
      expect(session.connectUrl).toBeTruthy();
      
      await session.close();
    });
  });

  describe("Browser Example Integration", () => {
    test("should support basic browser automation patterns", async () => {
      // Test the basic pattern from the example without requiring Playwright
      const mb = new experimental.MorphBrowser();
      
      const session = await mb.sessions.create({ 
        verbose: false,
        vcpus: 1,
        memory: 2048
      });
      
      instancesToCleanup.push(session.instance.id);
      
      try {
        // Verify the session provides the expected interface
        expect(session.connectUrl).toBeTruthy();
        expect(session.cdpUrl).toBeTruthy();
        
        // Test Chrome is accessible via the CDP endpoint
        const version = await session.getVersion();
        expect(version.Browser).toContain("Chrome");
        
        // Test that we can get tabs
        const tabs = await session.getTabs();
        expect(Array.isArray(tabs)).toBe(true);
        
      } finally {
        await session.close();
      }
    });
  });
});