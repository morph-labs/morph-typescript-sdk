// Test file corresponding to test_metadata.py
// Instance metadata operations and filtering

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";

jest.setTimeout(2 * 60 * 1000); // lifecycle ops can take a couple of minutes

describe("🔄 Metadata Operations Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let testInstance: Instance;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  // Boot a fresh "testInstance" before all tests
  beforeAll(async () => {
    // create a base snapshot to start from
    const baseSnap: Snapshot = await client.snapshots.create({
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(baseSnap.id);

    testInstance = await client.instances.start({ snapshotId: baseSnap.id });
    instancesToCleanup.push(testInstance.id);
    await testInstance.waitUntilReady();
  });

  // Tear down every instance & snapshot we created
  afterAll(async () => {
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
    for (const id of snapshotsToCleanup) {
      try {
        const s = await client.snapshots.get({ snapshotId: id });
        await s.delete();
      } catch {
        /* ignore */
      }
    }
  });

  test("should set and retrieve instance metadata", async () => {
    const metadata = { test_key: "test_value", environment: "testing" };
    
    // Set metadata on the instance
    await testInstance.setMetadata(metadata);

    // Fetch fresh instance to read back metadata
    const updated = await client.instances.get({ instanceId: testInstance.id });
    expect(updated.metadata?.test_key).toBe("test_value");
    expect(updated.metadata?.environment).toBe("testing");
  });

  test("should filter instances by metadata", async () => {
    const metadata = { test_key: "test_value", environment: "testing" };
    
    // Ensure metadata is set (from previous test or set again)
    await testInstance.setMetadata(metadata);

    // List instances filtered by metadata
    const list = await client.instances.list({
      metadata: { environment: "testing" },
    });
    
    // Verify our instance is in the filtered results
    expect(list.some((i) => i.id === testInstance.id)).toBe(true);
  });
});