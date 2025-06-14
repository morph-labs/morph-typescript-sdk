/**
 * Test file corresponding to test_snapshot_operations.py
 * Function-scoped tests for snapshot operations in MorphCloud SDK TypeScript version.
 */

import { MorphCloudClient, Instance, Snapshot, Image } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

jest.setTimeout(5 * 60 * 1000); // lifecycle ops can take several minutes

describe("🔄 Snapshot Operations Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let baseImage: Image;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  // Get a base image to use for tests
  beforeAll(async () => {
    console.log("Setting up base image for snapshot tests");
    const images = await client.images.list();
    if (images.length === 0) {
      throw new Error("No images available");
    }
    
    // Use an Ubuntu image or fall back to the first available
    baseImage = images.find(img => img.id.toLowerCase().includes("ubuntu")) || images[0];
    console.log(`Using base image: ${baseImage.id}`);
  });

  // Clean up resources after all tests
  afterAll(async () => {
    console.log("Cleaning up test resources");
    
    // Stop instances first
    for (const id of instancesToCleanup) {
      try {
        console.log(`Stopping instance ${id}`);
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
        console.log(`Instance ${id} stopped`);
      } catch (e: any) {
        console.log(`Error stopping instance ${id}: ${e.message}`);
      }
    }
    
    // Delete snapshots
    for (const id of snapshotsToCleanup) {
      try {
        console.log(`Deleting snapshot ${id}`);
        const s = await client.snapshots.get({ snapshotId: id });
        await s.delete();
        console.log(`Snapshot ${id} deleted`);
      } catch (e: any) {
        console.log(`Error deleting snapshot ${id}: ${e.message}`);
      }
    }
  });

  test("test_snapshot_creation - should create a snapshot from a base image", async () => {
    console.log("Testing snapshot creation");
    let snapshot: Snapshot | undefined;
    
    try {
      // Create snapshot from base image
      snapshot = await client.snapshots.create({
        imageId: baseImage.id,
        vcpus: 1,
        memory: 512,
        diskSize: 8192
      });
      console.log(`Created snapshot: ${snapshot.id}`);
      snapshotsToCleanup.push(snapshot.id);
      
      // Verify snapshot properties
      expect(snapshot.id).toMatch(/^snapshot_/);
      expect(snapshot).toHaveProperty("refs");
      expect(snapshot.refs).toHaveProperty("imageId");
      expect(snapshot.refs.imageId).toBe(baseImage.id);
      
      // List snapshots and verify our snapshot is included
      const snapshots = await client.snapshots.list();
      expect(snapshots.some(s => s.id === snapshot.id)).toBe(true);
      
      console.log("Snapshot creation test completed successfully");
      
    } catch (error: any) {
      console.error(`Error in snapshot creation test: ${error.message}`);
      throw error;
    }
  });

  test("test_instance_to_instance_snapshot - should create snapshot from running instance and start new instance from it", async () => {
    console.log("Testing instance to instance snapshot");
    
    const createdResources = {
      snapshots: [] as Snapshot[],
      instances: [] as Instance[]
    };
    
    try {
      // Create first snapshot from base image
      console.log(`Creating snapshot from base image ${baseImage.id}`);
      const firstSnapshot = await client.snapshots.create({
        imageId: baseImage.id,
        vcpus: 1,
        memory: 512,
        diskSize: 8192
      });
      console.log(`Created first snapshot: ${firstSnapshot.id}`);
      createdResources.snapshots.push(firstSnapshot);
      snapshotsToCleanup.push(firstSnapshot.id);
      
      // Start first instance
      console.log(`Starting first instance from snapshot ${firstSnapshot.id}`);
      const firstInstance = await client.instances.start({ snapshotId: firstSnapshot.id });
      console.log(`Created first instance: ${firstInstance.id}`);
      createdResources.instances.push(firstInstance);
      instancesToCleanup.push(firstInstance.id);
      
      // Wait for instance to be ready
      console.log(`Waiting for instance ${firstInstance.id} to be ready`);
      await firstInstance.waitUntilReady(300);
      console.log(`Instance ${firstInstance.id} is ready`);
      
      // Create a test file on the first instance
      const testFile = `/root/test-file-${uuidv4()}.txt`;
      const testContent = `test-content-${uuidv4()}`;
      
      // Write test file
      console.log(`Writing test file ${testFile}`);
      const writeResult = await firstInstance.exec(`echo '${testContent}' > ${testFile}`);
      expect(writeResult.exit_code).toBe(0);
      
      // Verify file exists
      const readResult = await firstInstance.exec(`cat ${testFile}`);
      expect(readResult.exit_code).toBe(0);
      expect(readResult.stdout).toContain(testContent);
      
      // Create snapshot from running instance
      console.log(`Creating snapshot from instance ${firstInstance.id}`);
      const secondSnapshot = await firstInstance.snapshot();
      console.log(`Created second snapshot: ${secondSnapshot.id}`);
      createdResources.snapshots.push(secondSnapshot);
      snapshotsToCleanup.push(secondSnapshot.id);
      
      // Start new instance from the second snapshot
      console.log(`Starting second instance from snapshot ${secondSnapshot.id}`);
      const secondInstance = await client.instances.start({ snapshotId: secondSnapshot.id });
      console.log(`Created second instance: ${secondInstance.id}`);
      createdResources.instances.push(secondInstance);
      instancesToCleanup.push(secondInstance.id);
      
      // Wait for second instance to be ready
      console.log(`Waiting for instance ${secondInstance.id} to be ready`);
      await secondInstance.waitUntilReady(300);
      console.log(`Instance ${secondInstance.id} is ready`);
      
      // Verify the test file persisted in the snapshot
      console.log(`Verifying test file ${testFile} exists on second instance`);
      const verifyResult = await secondInstance.exec(`cat ${testFile}`);
      expect(verifyResult.exit_code).toBe(0);
      expect(verifyResult.stdout).toContain(testContent);
      
      console.log("Instance to instance snapshot test completed successfully");
      
    } catch (error: any) {
      console.error(`Error in instance to instance snapshot test: ${error.message}`);
      throw error;
    }
  });

  test("test_snapshot_metadata - should set and retrieve snapshot metadata", async () => {
    console.log("Testing snapshot metadata");
    let snapshot: Snapshot | undefined;
    
    try {
      // Create snapshot
      snapshot = await client.snapshots.create({
        imageId: baseImage.id,
        vcpus: 1,
        memory: 512,
        diskSize: 8192
      });
      console.log(`Created snapshot: ${snapshot.id}`);
      snapshotsToCleanup.push(snapshot.id);
      
      // Set metadata
      const testKey = `test-key-${uuidv4()}`;
      const testValue = `test-value-${uuidv4()}`;
      const testMetadata = { [testKey]: testValue };
      
      console.log(`Setting metadata: ${JSON.stringify(testMetadata)}`);
      await snapshot.setMetadata(testMetadata);
      
      // Verify metadata was set
      expect(snapshot.metadata?.[testKey]).toBe(testValue);
      
      // Get snapshot and verify metadata
      const updatedSnapshot = await client.snapshots.get({ snapshotId: snapshot.id });
      expect(updatedSnapshot.metadata?.[testKey]).toBe(testValue);
      
      // List snapshots by metadata
      const filterMetadata = { [testKey]: testValue };
      const snapshots = await client.snapshots.list({ metadata: filterMetadata });
      
      // Verify snapshot is in the filtered list
      expect(snapshots.some(s => s.id === snapshot.id)).toBe(true);
      
      // Update metadata
      const newValue = `updated-value-${uuidv4()}`;
      await snapshot.setMetadata({ [testKey]: newValue });
      
      // Verify metadata was updated
      const finalSnapshot = await client.snapshots.get({ snapshotId: snapshot.id });
      expect(finalSnapshot.metadata?.[testKey]).toBe(newValue);
      
      console.log("Snapshot metadata test completed successfully");
      
    } catch (error: any) {
      console.error(`Error in snapshot metadata test: ${error.message}`);
      throw error;
    }
  });

  test("test_snapshot_multiple_instances - should start multiple instances from the same snapshot", async () => {
    console.log("Testing starting multiple instances from the same snapshot");
    
    const createdResources = {
      snapshots: [] as Snapshot[],
      instances: [] as Instance[]
    };
    
    try {
      // Create snapshot
      const snapshot = await client.snapshots.create({
        imageId: baseImage.id,
        vcpus: 1,
        memory: 512,
        diskSize: 8192
      });
      console.log(`Created snapshot: ${snapshot.id}`);
      createdResources.snapshots.push(snapshot);
      snapshotsToCleanup.push(snapshot.id);
      
      // Start multiple instances from the same snapshot
      const numInstances = 3;
      const instances: Instance[] = [];
      
      for (let i = 0; i < numInstances; i++) {
        console.log(`Starting instance ${i + 1} from snapshot ${snapshot.id}`);
        const instance = await client.instances.start({ snapshotId: snapshot.id });
        console.log(`Created instance: ${instance.id}`);
        instances.push(instance);
        createdResources.instances.push(instance);
        instancesToCleanup.push(instance.id);
      }
      
      // Wait for all instances to be ready
      for (const instance of instances) {
        console.log(`Waiting for instance ${instance.id} to be ready`);
        await instance.waitUntilReady(300);
        console.log(`Instance ${instance.id} is ready`);
      }
      
      // Verify all instances are running and have the same snapshot ID
      for (const instance of instances) {
        expect(instance.refs.snapshotId).toBe(snapshot.id);
      }
      
      // List instances and verify all our instances are included
      const allInstances = await client.instances.list();
      for (const instance of instances) {
        expect(allInstances.some(i => i.id === instance.id)).toBe(true);
      }
      
      console.log("Starting multiple instances test completed successfully");
      
    } catch (error: any) {
      console.error(`Error in multiple instances test: ${error.message}`);
      throw error;
    }
  });
});