/**
 * Function-scoped tests for instance branching in MorphCloud SDK.
 * TypeScript equivalent of test_branching.py
 */
import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

describe("MorphCloud Instance Branching Tests", () => {
  let client: MorphCloudClient;
  let baseImageId: string;

  // Resources for cleanup
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
      throw new Error("MORPH_API_KEY environment variable must be set");
    }

    client = new MorphCloudClient({ apiKey, baseUrl, verbose: true });
    console.log("Created MorphCloud client");

    const images = await client.images.list();
    if (images.length === 0) {
      throw new Error("No images available");
    }

    // Use an Ubuntu image or fall back to the first available
    baseImageId =
      images.find((img) => img.id.toLowerCase().includes("ubuntu"))?.id ||
      images[0].id;
    console.log(`Using base image: ${baseImageId}`);
  }, 120000);

  afterEach(async () => {
    console.log("Running afterEach cleanup for branching test");
    
    // Clean up resources in reverse order
    for (const instance of resources.instances.reverse()) {
      try {
        console.log(`Stopping instance ${instance.id}`);
        await instance.stop();
        console.log(`Instance stopped`);
      } catch (e: any) {
        console.error(`Error stopping instance: ${e}`);
      }
    }
    resources.instances = [];

    for (const snapshot of resources.snapshots.reverse()) {
      try {
        console.log(`Deleting snapshot ${snapshot.id}`);
        await snapshot.delete();
        console.log(`Snapshot deleted`);
      } catch (e: any) {
        console.error(`Error deleting snapshot: ${e}`);
      }
    }
    resources.snapshots = [];
    
    console.log("afterEach cleanup complete for branching test");
  }, 60000);

  /**
   * Test instance branching - TypeScript equivalent of test_instance_branching()
   */
  test("test_instance_branching", async () => {
    console.log("Testing instance branching");

    try {
      // Create initial snapshot
      console.log("Creating initial snapshot");
      const initialSnapshot = registerSnapshot(
        await client.snapshots.create({
          imageId: baseImageId,
          vcpus: 1,
          memory: 512,
          diskSize: 8192,
        }),
      );
      console.log(`Created initial snapshot: ${initialSnapshot.id}`);

      // Start initial instance
      console.log("Starting initial instance");
      const initialInstance = registerInstance(
        await client.instances.start({ snapshotId: initialSnapshot.id }),
      );
      console.log(`Created initial instance: ${initialInstance.id}`);

      // Wait for instance to be ready
      console.log(`Waiting for instance ${initialInstance.id} to be ready`);
      await initialInstance.waitUntilReady(300);
      console.log(`Instance ${initialInstance.id} is ready`);

      // Create a test file on the instance
      const testFile = `/root/test-file-${uuidv4()}.txt`;
      const testContent = `test-content-${uuidv4()}`;

      // Write test file
      console.log(`Creating test file ${testFile}`);
      let result = await initialInstance.exec(`echo '${testContent}' > ${testFile}`);
      expect(result.exit_code).toBe(0);

      // Verify file exists
      result = await initialInstance.exec(`cat ${testFile}`);
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toContain(testContent);

      // Create 2 branches from the instance
      const branchCount = 2;
      console.log(`Creating ${branchCount} branches from instance ${initialInstance.id}`);
      const { snapshot: branchSnapshot, instances: branchInstances } =
        await initialInstance.branch(branchCount);

      // Add to resources for cleanup
      registerSnapshot(branchSnapshot);
      branchInstances.forEach((inst) => registerInstance(inst));

      console.log(`Created branch snapshot: ${branchSnapshot.id}`);
      for (let i = 0; i < branchInstances.length; i++) {
        console.log(`Created branch instance ${i + 1}: ${branchInstances[i].id}`);
      }

      // Verify branch snapshot properties
      expect(branchSnapshot.id).toMatch(/^snapshot_/);

      // Verify the number of branch instances
      expect(branchInstances.length).toBe(branchCount);

      // Verify each branch instance
      for (let i = 0; i < branchInstances.length; i++) {
        const branchInstance = branchInstances[i];
        console.log(`Verifying branch instance ${i + 1}: ${branchInstance.id}`);

        // Verify instance properties
        expect(branchInstance.id).toMatch(/^morphvm_/);
        expect(branchInstance.refs.snapshotId).toBe(branchSnapshot.id);

        // Wait for branch instance to be ready
        await branchInstance.waitUntilReady(300);

        // Verify the test file persisted in the branch
        result = await branchInstance.exec(`cat ${testFile}`);
        expect(result.exit_code).toBe(0);
        expect(result.stdout).toContain(testContent);

        // Create a unique file on each branch to verify they're independent
        const branchFile = `/root/branch-file-${i + 1}-${uuidv4()}.txt`;
        const branchContent = `branch-content-${i + 1}-${uuidv4()}`;

        result = await branchInstance.exec(`echo '${branchContent}' > ${branchFile}`);
        expect(result.exit_code).toBe(0);

        // Verify branch file
        result = await branchInstance.exec(`cat ${branchFile}`);
        expect(result.exit_code).toBe(0);
        expect(result.stdout).toContain(branchContent);
      }

      // Verify branches are independent by checking that a file created on one branch
      // doesn't exist on the other branch
      for (let i = 0; i < branchInstances.length; i++) {
        const branchInstance = branchInstances[i];
        const otherIdx = (i + 1) % branchCount;
        const otherBranchFile = `/root/branch-file-${otherIdx + 1}-${uuidv4()}.txt`;

        // This should fail because the file should only exist on the other branch
        result = await branchInstance.exec(`cat ${otherBranchFile}`);
        expect(result.exit_code).not.toBe(0);
      }

      console.log("Instance branching test completed successfully");
    } catch (error) {
      console.error("Error in test_instance_branching:", error);
      throw error;
    }
  }, 600000);

  /**
   * Test running multiple operations in parallel - TypeScript equivalent of test_parallel_operations()
   */
  test("test_parallel_operations", async () => {
    console.log("Testing parallel operations");

    // Number of instances to create
    const instanceCount = 3;

    try {
      // Create snapshot
      console.log("Creating snapshot");
      const snapshot = registerSnapshot(
        await client.snapshots.create({
          imageId: baseImageId,
          vcpus: 1,
          memory: 512,
          diskSize: 8192,
        }),
      );
      console.log(`Created snapshot: ${snapshot.id}`);

      // Start multiple instances in parallel
      console.log(`Starting ${instanceCount} instances in parallel`);

      const startInstance = async (): Promise<Instance> => {
        const instance = await client.instances.start({ snapshotId: snapshot.id });
        console.log(`Created instance: ${instance.id}`);
        await instance.waitUntilReady(300);
        console.log(`Instance ${instance.id} is ready`);
        return instance;
      };

      // Create instances in parallel
      const tasks = Array.from({ length: instanceCount }, () => startInstance());
      const instances = await Promise.all(tasks);
      instances.forEach((inst) => registerInstance(inst));

      // Execute commands on all instances in parallel
      const runCommand = async (instance: Instance) => {
        // Run a simple command
        const result = await instance.exec("echo 'hello world'");
        expect(result.exit_code).toBe(0);
        expect(result.stdout).toContain("hello world");
        return result;
      };

      // Run commands in parallel
      console.log("Running commands on all instances in parallel");
      const commandTasks = instances.map((instance) => runCommand(instance));
      const results = await Promise.all(commandTasks);

      // Verify all commands succeeded
      expect(results.length).toBe(instanceCount);
      for (let i = 0; i < results.length; i++) {
        expect(results[i].exit_code).toBe(0);
      }

      console.log("Parallel operations test completed successfully");
    } catch (error) {
      console.error("Error in test_parallel_operations:", error);
      throw error;
    }
  }, 600000);
});
