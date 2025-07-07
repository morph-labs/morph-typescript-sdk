// Simple test for experimental Snapshot API
import { experimental } from "morphcloud";
import { MorphCloudClient, Instance } from "morphcloud";

jest.setTimeout(5 * 60 * 1000); // 5 minutes

describe("🧪 Experimental Snapshot API - Simple Tests", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  const snapshotsToCleanup: string[] = [];
  const instancesToCleanup: string[] = [];

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

  test("should create snapshot with enhanced API", async () => {
    const testName = `test-simple-${Date.now()}`;
    
    const snapshot = await experimental.Snapshot.create(testName);
    expect(snapshot).toBeDefined();
    expect(snapshot.id).toBeTruthy();
    
    snapshotsToCleanup.push(snapshot.id);
  });

  test("should execute commands on snapshot", async () => {
    const testName = `test-run-${Date.now()}`;
    
    const snapshot = await experimental.Snapshot.create(testName);
    snapshotsToCleanup.push(snapshot.id);
    
    // Test command execution
    const updatedSnapshot = await snapshot.run("echo 'hello world'");
    expect(updatedSnapshot).toBeDefined();
    expect(updatedSnapshot.id).not.toBe(snapshot.id);
    
    snapshotsToCleanup.push(updatedSnapshot.id);
  });
});