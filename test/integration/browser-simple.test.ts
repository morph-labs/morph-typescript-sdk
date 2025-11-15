// Simple test for experimental MorphBrowser API
import { experimental } from "morphcloud";
import { MorphCloudClient } from "morphcloud";

jest.setTimeout(10 * 60 * 1000); // 10 minutes for browser operations

describe("🌐 MorphBrowser API - Simple Tests", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  const instancesToCleanup: string[] = [];

  afterAll(async () => {
    // Clean up instances
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
  });

  test("should create browser session", async () => {
    const mb = new experimental.MorphBrowser();
    
    const session = await mb.sessions.create({ 
      verbose: true,
      vcpus: 1,
      memory: 2048 // 2GB for browser
    });
    
    expect(session).toBeDefined();
    expect(session.connectUrl).toBeTruthy();
    expect(session.cdpUrl).toBeTruthy();
    expect(session.instance).toBeDefined();
    
    instancesToCleanup.push(session.instance.id);
    
    // Test that the session is ready
    const isReady = await session.isReady();
    expect(isReady).toBe(true);
    
    // Test getting Chrome version
    const version = await session.getVersion();
    expect(version).toBeDefined();
    expect(version.Browser).toBeTruthy();
    
    // Clean up
    await session.close();
  });
});