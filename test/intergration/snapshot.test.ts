// tests/integration/testInstanceLifecycle.test.ts

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import path from "path";

jest.setTimeout(2 * 60 * 1000); // lifecycle ops can take a couple of minutes

describe("🔄 Instance Lifecycle Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let testInstance: Instance;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  // 1️⃣ Boot a fresh “testInstance” before all tests
  beforeAll(async () => {
    // create a base snapshot to start from
    const baseSnap: Snapshot = await client.snapshots.create({
      vcpus: 1,
      memory: 512,
      diskSize: 1024,
    });
    snapshotsToCleanup.push(baseSnap.id);

    testInstance = await client.instances.start({ snapshotId: baseSnap.id });
    instancesToCleanup.push(testInstance.id);
    await testInstance.waitUntilReady();
  });

  // 2️⃣ Tear down every instance & snapshot we created
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

  test("✅ startup & basic exec", async () => {
    // like test_instance_startup
    expect(testInstance.id).toMatch(/^morphvm_/);
    expect(testInstance.status).toBe("ready");

    const res = await testInstance.exec("echo 'hello world'");
    console.log("Received response is", res);
    expect(res.exitCode).toBe(0);

    expect(res.stdout).toContain("hello world");
    expect(res.stderr).toBeFalsy();
  });

  test("✅ various command executions", async () => {
    // like test_command_execution
    const r1 = await testInstance.exec("uname -a");
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout.length).toBeGreaterThan(0);

    const r2 = await testInstance.exec(["ls", "-la", "/"]);
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain("root");

    const r3 = await testInstance.exec("ls /nonexistent");
    expect(r3.exitCode).not.toBe(0);
    expect(r3.stderr).toContain("No such file or directory");
  });

  test("✅ snapshot creation & branching", async () => {
    // like test_snapshot_creation
    const testFile = "/root/test_file.txt";
    const testContent = "This is a test file";

    // write and verify
    await testInstance.exec(`echo '${testContent}' > ${testFile}`);
    await testInstance.exec(`cat ${testFile}`).then((r) => {
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain(testContent);
    });

    const snap = await testInstance.snapshot();
    snapshotsToCleanup.push(snap.id);
    console.log("Created snapshot ID:", snap.id);

    // start a fresh instance from that snapshot
    const newInst = await client.instances.start({ snapshotId: snap.id });
    instancesToCleanup.push(newInst.id);

    // wait for the VM itself to be “ready” (you can pass a timeout in seconds):
    console.log(
      `[Test: Snapshot] Calling waitUntilReady for new instance ${newInst.id} with timeout 20s.`,
    );
    // IMPORTANT: Add an internal `setInterval` or `setTimeout` and `console.log`
    // inside the `waitUntilReady` method of the `Instance` class to see its progress
    await newInst.waitUntilReady(60); // Still keep this, but let's see why it's slow
    console.log(
      `[Test: Snapshot] New instance ${newInst.id} is ready after waitUntilReady.`,
    );

    // now you can safely exec commands, check metadata, etc.
    console.log(
      `[Test: Snapshot] Attempting first exec on new instance ${newInst.id}...`,
    );

    try {
      const res = await newInst.exec(`cat ${testFile}`);
      console.log(
        `[Test: Snapshot] First exec completed. ExitCode: ${res.exitCode}`,
      );
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain(testContent);
      console.log("[Test: Snapshot] Verified file content on new instance.");
    } catch (e: any) {
      console.error(
        `[Test: Snapshot] ERROR during first exec on new instance ${newInst.id}: ${e.message}`,
      );
      throw e; // Re-throw to fail the test
    }

    // verify file persisted
    console.log(
      `[Test: Snapshot] Attempting second exec on new instance ${newInst.id}...`,
    );
    try {
      const rc = await newInst.exec(`cat ${testFile}`);
      console.log(
        `[Test: Snapshot] Second exec completed. ExitCode: ${rc.exitCode}`,
      );
      expect(rc.exitCode).toBe(0);
      expect(rc.stdout).toContain(testContent);
    } catch (e: any) {
      console.error(
        `[Test: Snapshot] ERROR during second exec on new instance ${newInst.id}: ${e.message}`,
      );
      throw e; // Re-throw to fail the test
    }
  });

  test("✅ metadata set & list", async () => {
    // like test_instance_metadata
    const metadata = { test_key: "test_value", environment: "testing" };
    await testInstance.setMetadata(metadata);

    // fetch fresh instance to read back
    const updated = await client.instances.get({ instanceId: testInstance.id });
    expect(updated.metadata?.test_key).toBe("test_value");
    expect(updated.metadata?.environment).toBe("testing");

    // list by metadata filter
    const list = await client.instances.list({
      metadata: { environment: "testing" },
    });
    expect(list.some((i) => i.id === testInstance.id)).toBe(true);
  });
});
