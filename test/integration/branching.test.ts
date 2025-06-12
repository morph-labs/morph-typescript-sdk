// test_branching.ts
import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

describe("MorphCloud Instance Branching Tests", () => {
  let client: MorphCloudClient;
  let baseImageId: string;
  let baseSnapshot: Snapshot;
  let baseInstance: Instance;
  let testFile: string; // Declare here
  let testContent: string; // Declare here

  const resources: { snapshots: Snapshot[]; instances: Instance[] } = {
    snapshots: [],
    instances: [],
  };

  const registerSnapshot = (snapshot: Snapshot) => {
    resources.snapshots.push(snapshot);
    return snapshot;
  };

  const registerInstance = (instance: Instance) => {
    resources.instances.push(instance);
    return instance;
  };

  beforeAll(async () => {
    const apiKey = process.env.MORPH_API_KEY;
    const baseUrl = process.env.MORPH_BASE_URL;

    if (!apiKey) {
      throw new Error("MORPH_API_KEY environment variable must be set.");
    }

    client = new MorphCloudClient({ apiKey, baseUrl, verbose: true });
    console.log("Created MorphCloud client");

    const images = await client.images.list();
    if (images.length === 0) {
      throw new Error("No images available.");
    }
    baseImageId =
      images.find((img) => img.id.toLowerCase().includes("ubuntu"))?.id ||
      images[0].id;
    console.log(`Using base image: ${baseImageId}`);

    console.log("Creating base snapshot for branching tests...");
    baseSnapshot = registerSnapshot(
      await client.snapshots.create({
        imageId: baseImageId,
        vcpus: 1,
        memory: 512,
        diskSize: 8192,
      }),
    );
    console.log(`Created base snapshot: ${baseSnapshot.id}`);

    console.log(`Starting base instance from snapshot ${baseSnapshot.id}`);
    baseInstance = registerInstance(
      await client.instances.start({ snapshotId: baseSnapshot.id }),
    );
    console.log(`Created base instance: ${baseInstance.id}`);

    console.log(`Waiting for base instance ${baseInstance.id} to be ready`);
    await baseInstance.waitUntilReady(300);
    console.log(`Base instance ${baseInstance.id} is ready`);

    // Define testFile and testContent ONCE here
    testFile = `/root/test-file-${uuidv4()}.txt`;
    testContent = `test-content-${uuidv4()}`;

    console.log(`Creating test file ${testFile} on base instance`);
    let result = await baseInstance.exec(`echo '${testContent}' > ${testFile}`);
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to create test file on base instance: ${result.stderr}`,
      );
    }
    console.log(`Test file ${testFile} created on base instance.`);

    result = await baseInstance.exec(`cat ${testFile}`);
    if (result.exitCode !== 0 || !result.stdout.includes(testContent)) {
      throw new Error(
        `Test file not found or content mismatch on base instance: ${result.stdout}, ${result.stderr}`,
      );
    }
    console.log(`Test file content verified on base instance.`);
  }, 600000);

  afterEach(async () => {
    console.log("Running afterEach cleanup for branching test");
    for (const instance of resources.instances.reverse()) {
      try {
        console.log(`Stopping instance ${instance.id}`);
        await instance.stop();
        console.log(`Instance ${instance.id} stopped`);
      } catch (e: any) {
        if (e.message && !e.message.includes("HTTP Error 404")) {
          console.error(`Error stopping instance ${instance.id}:`, e);
        } else {
          console.warn(
            `Instance ${instance.id} not found during stop (might have been deleted already).`,
          );
        }
      }
    }
    resources.instances = [];

    for (const snapshot of resources.snapshots.reverse()) {
      try {
        console.log(`Deleting snapshot ${snapshot.id}`);
        await snapshot.delete();
        console.log(`Snapshot ${snapshot.id} deleted`);
      } catch (e: any) {
        if (e.message && !e.message.includes("HTTP Error 404")) {
          console.error(`Error deleting snapshot ${snapshot.id}:`, e);
        } else {
          console.warn(
            `Snapshot ${snapshot.id} not found during delete (might have been deleted already).`,
          );
        }
      }
    }
    resources.snapshots = [];
    console.log("afterEach cleanup complete for branching test");
  }, 60000);

  afterAll(async () => {
    console.log("Running afterAll cleanup for base resources");
    if (baseInstance) {
      try {
        console.log(`Stopping base instance ${baseInstance.id}`);
        await baseInstance.stop();
        console.log(`Base instance ${baseInstance.id} stopped`);
      } catch (e: any) {
        if (e.message && !e.message.includes("HTTP Error 404")) {
          console.error(`Error stopping base instance ${baseInstance.id}:`, e);
        } else {
          console.warn(
            `Base instance ${baseInstance.id} not found during stop.`,
          );
        }
      }
    }
    if (baseSnapshot) {
      try {
        console.log(`Deleting base snapshot ${baseSnapshot.id}`);
        await baseSnapshot.delete();
        console.log(`Base snapshot ${baseSnapshot.id} deleted`);
      } catch (e: any) {
        if (e.message && !e.message.includes("HTTP Error 404")) {
          console.error(`Error deleting base snapshot ${baseSnapshot.id}:`, e);
        } else {
          console.warn(
            `Base snapshot ${baseSnapshot.id} not found during delete.`,
          );
        }
      }
    }
    console.log("afterAll base resource cleanup complete.");
  }, 120000);

  test("should perform instance branching and verify state", async () => {
    console.log("Testing instance branching");

    // The initial snapshot and instance are available as baseSnapshot and baseInstance.
    // The testFile and testContent are also now globally defined and consistent.

    const branchCount = 2;
    console.log(
      `Creating ${branchCount} branches from base instance ${baseInstance.id}`,
    );
    const { snapshot: branchSnapshot, instances: branchInstances } =
      await baseInstance.branch(branchCount);

    registerSnapshot(branchSnapshot);
    branchInstances.forEach((inst) => registerInstance(inst));

    console.log(`Created branch snapshot: ${branchSnapshot.id}`);
    for (let i = 0; i < branchInstances.length; i++) {
      console.log(`Created branch instance ${i + 1}: ${branchInstances[i].id}`);
    }

    expect(branchSnapshot.id).toMatch(/^snapshot_/);
    expect(branchInstances.length).toBe(branchCount);

    for (let i = 0; i < branchInstances.length; i++) {
      const branchInstance = branchInstances[i];
      console.log(`Verifying branch instance ${i + 1}: ${branchInstance.id}`);

      expect(branchInstance.id).toMatch(/^morphvm_/);
      expect(branchInstance.refs.snapshotId).toBe(branchSnapshot.id);

      console.log(
        `Waiting for branch instance ${branchInstance.id} to be ready`,
      );
      await branchInstance.waitUntilReady(300);
      console.log(`Branch instance ${branchInstance.id} is ready`);

      // Verify the test file persisted in the branch - now using the correct, consistent `testFile` and `testContent`
      let result = await branchInstance.exec(`cat ${testFile}`);
      console.log("Result of cat on branched instance:", result); // Added for debugging
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testContent);

      const branchFile = `/root/branch-file-${i + 1}-${uuidv4()}.txt`;
      const branchContent = `branch-content-${i + 1}-${uuidv4()}`;

      console.log(
        `Creating unique file ${branchFile} on instance ${branchInstance.id}`,
      );
      result = await branchInstance.exec(
        `echo '${branchContent}' > ${branchFile}`,
      );
      expect(result.exitCode).toBe(0);

      result = await branchInstance.exec(`cat ${branchFile}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(branchContent);
    }

    console.log("Verifying branch independence");
    for (let i = 0; i < branchInstances.length; i++) {
      const currentInstance = branchInstances[i];
      for (let j = 0; j < branchInstances.length; j++) {
        if (i === j) continue;

        const otherBranchFile = `/root/branch-file-${j + 1}-`;
        const checkResult = await currentInstance.exec(
          `ls ${otherBranchFile}* 2>&1 || echo 'Not found'`,
        );
        expect(checkResult.stdout + checkResult.stderr).toContain("Not found");
      }
    }

    const allInstances = [baseInstance, ...branchInstances];
    const instanceCount = allInstances.length;
    console.log(
      `Running commands on all ${instanceCount} instances in parallel`,
    );

    const commandPromises = allInstances.map((instance) =>
      (async () => {
        const cmdResult = await instance.exec("echo 'hello world'");
        expect(cmdResult.exitCode).toBe(0);
        expect(cmdResult.stdout).toContain("hello world");
        return cmdResult;
      })(),
    );

    const results = await Promise.all(commandPromises);

    expect(results.length).toBe(instanceCount);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].exitCode).toBe(0);
    }

    console.log("Parallel operations test completed successfully");
  }, 600000);
});
