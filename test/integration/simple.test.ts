// Test file corresponding to test_simple.py
// Basic instance lifecycle and simple command execution

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";

jest.setTimeout(2 * 60 * 1000); // lifecycle ops can take a couple of minutes

describe("🔄 Simple Instance Operations (TS)", () => {
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

  test("should perform basic instance startup and command execution", async () => {
    // Verify instance was created and is ready
    expect(testInstance.id).toMatch(/^morphvm_/);
    expect(testInstance.status).toBe("ready");

    // Execute basic command
    const res = await testInstance.exec("echo 'hello world'");
    console.log("Received response is", res);
    expect(res.exit_code).toBe(0);
    expect(res.stdout).toContain("hello world");
    expect(res.stderr).toBeFalsy();
  });
});