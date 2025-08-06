// Tag-based Resource Selection Tests (TS)
// Tests for selecting snapshots by tags and metadata filtering
// Equivalent to Python test_from_tag_multiple.py

import { MorphCloudClient, Instance, Snapshot } from "../../src/api";
import { v4 as uuidv4 } from "uuid";

jest.setTimeout(2 * 60 * 1000); // Tag operations are quick

describe("🏷️ Tag-based Resource Selection (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let baseImageId: string;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  beforeAll(async () => {
    const images = await client.images.list();
    if (images.length === 0) {
      throw new Error("No images available.");
    }
    baseImageId =
      images.find((img) => img.id.toLowerCase().includes("ubuntu"))?.id ||
      images[0].id;
    console.log(`Using base image: ${baseImageId}`);
  });

  afterAll(async () => {
    // Cleanup instances
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
    // Cleanup snapshots
    for (const id of snapshotsToCleanup) {
      try {
        const snap = await client.snapshots.get({ snapshotId: id });
        await snap.delete();
      } catch {
        /* ignore */
      }
    }
  });

  test("should select most recent snapshot by tag", async () => {
    console.log("Testing selection of most recent snapshot by tag");
    
    // Create unique tag for this test
    const testTag = `test_tag_${uuidv4().slice(0, 8)}`;
    const taggedSnapshots: Snapshot[] = [];
    
    // Create multiple snapshots with the same tag but different timestamps
    for (let i = 0; i < 3; i++) {
      console.log(`Creating snapshot ${i + 1} with tag: ${testTag}`);
      
      const snapshot = await client.snapshots.create({
        imageId: baseImageId,
        vcpus: 1,
        memory: 512,
        diskSize: 8192,
        metadata: {
          tag: testTag,
          created_order: `snapshot_${i + 1}`,
          test_id: uuidv4()
        }
      });
      
      taggedSnapshots.push(snapshot);
      snapshotsToCleanup.push(snapshot.id);
      
      // Small delay to ensure different creation timestamps
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Created ${taggedSnapshots.length} snapshots with tag: ${testTag}`);
    
    // Search for snapshots by tag
    const foundSnapshots = await client.snapshots.list({
      metadata: { tag: testTag }
    });
    
    expect(foundSnapshots.length).toBe(3);
    console.log(`Found ${foundSnapshots.length} snapshots with tag: ${testTag}`);
    
    // Verify all snapshots have the expected tag
    for (const snapshot of foundSnapshots) {
      expect(snapshot.metadata?.tag).toBe(testTag);
    }
    
    // The most recent snapshot should be the last one created
    // Sort by creation time (most recent first)
    const sortedSnapshots = foundSnapshots.sort((a, b) => b.created - a.created);
    const mostRecentSnapshot = sortedSnapshots[0];
    
    expect(mostRecentSnapshot.metadata?.created_order).toBe("snapshot_3");
    console.log(`Most recent snapshot: ${mostRecentSnapshot.id} (${mostRecentSnapshot.metadata?.created_order})`);
    
    console.log("Most recent snapshot by tag test passed");
  });

  test("should handle single snapshot by tag", async () => {
    console.log("Testing single snapshot selection by tag");
    
    // Create unique tag for this test
    const singleTag = `single_tag_${uuidv4().slice(0, 8)}`;
    
    // Create single snapshot with unique tag
    console.log(`Creating single snapshot with tag: ${singleTag}`);
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
      metadata: {
        tag: singleTag,
        type: "single_snapshot",
        test_id: uuidv4()
      }
    });
    
    snapshotsToCleanup.push(snapshot.id);
    console.log(`Created snapshot: ${snapshot.id} with tag: ${singleTag}`);
    
    // Search for snapshots by tag
    const foundSnapshots = await client.snapshots.list({
      metadata: { tag: singleTag }
    });
    
    expect(foundSnapshots.length).toBe(1);
    expect(foundSnapshots[0].id).toBe(snapshot.id);
    expect(foundSnapshots[0].metadata?.tag).toBe(singleTag);
    expect(foundSnapshots[0].metadata?.type).toBe("single_snapshot");
    
    console.log("Single snapshot by tag test passed");
  });

  test("should handle non-existent tags gracefully", async () => {
    console.log("Testing non-existent tag handling");
    
    // Search for snapshots with a tag that doesn't exist
    const nonExistentTag = `non_existent_${uuidv4()}`;
    console.log(`Searching for non-existent tag: ${nonExistentTag}`);
    
    const foundSnapshots = await client.snapshots.list({
      metadata: { tag: nonExistentTag }
    });
    
    // Should return empty array, not throw an error
    expect(foundSnapshots).toBeDefined();
    expect(Array.isArray(foundSnapshots)).toBe(true);
    expect(foundSnapshots.length).toBe(0);
    
    console.log("Non-existent tag handling test passed");
  });

  test("should support complex metadata filtering", async () => {
    console.log("Testing complex metadata filtering");
    
    // Create snapshots with complex metadata
    const projectTag = `project_${uuidv4().slice(0, 8)}`;
    const environmentValues = ["development", "staging", "production"];
    const createdSnapshots: Snapshot[] = [];
    
    for (const env of environmentValues) {
      console.log(`Creating snapshot for environment: ${env}`);
      
      const snapshot = await client.snapshots.create({
        imageId: baseImageId,
        vcpus: 1,
        memory: 512,
        diskSize: 8192,
        metadata: {
          project: projectTag,
          environment: env,
          version: "1.0.0",
          team: "backend"
        }
      });
      
      createdSnapshots.push(snapshot);
      snapshotsToCleanup.push(snapshot.id);
    }
    
    console.log(`Created ${createdSnapshots.length} snapshots for project: ${projectTag}`);
    
    // Test filtering by project
    const projectSnapshots = await client.snapshots.list({
      metadata: { project: projectTag }
    });
    expect(projectSnapshots.length).toBe(3);
    
    // Test filtering by project and environment
    const devSnapshots = await client.snapshots.list({
      metadata: { 
        project: projectTag,
        environment: "development"
      }
    });
    expect(devSnapshots.length).toBe(1);
    expect(devSnapshots[0].metadata?.environment).toBe("development");
    
    // Test filtering by team
    const teamSnapshots = await client.snapshots.list({
      metadata: { team: "backend" }
    });
    expect(teamSnapshots.length).toBeGreaterThanOrEqual(3);
    
    // Verify all team snapshots have the expected metadata
    const projectTeamSnapshots = teamSnapshots.filter(s => s.metadata?.project === projectTag);
    expect(projectTeamSnapshots.length).toBe(3);
    
    for (const snapshot of projectTeamSnapshots) {
      expect(snapshot.metadata?.team).toBe("backend");
      expect(snapshot.metadata?.version).toBe("1.0.0");
      expect(environmentValues).toContain(snapshot.metadata?.environment);
    }
    
    console.log("Complex metadata filtering test passed");
  });

  test("should support instance creation from tagged snapshots", async () => {
    console.log("Testing instance creation from tagged snapshots");
    
    // Create tagged snapshot
    const instanceTag = `instance_test_${uuidv4().slice(0, 8)}`;
    
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
      metadata: {
        tag: instanceTag,
        purpose: "instance_creation_test",
        ready_for_deployment: "true"
      }
    });
    
    snapshotsToCleanup.push(snapshot.id);
    console.log(`Created tagged snapshot: ${snapshot.id}`);
    
    // Find snapshot by tag
    const taggedSnapshots = await client.snapshots.list({
      metadata: { 
        tag: instanceTag,
        ready_for_deployment: "true"
      }
    });
    
    expect(taggedSnapshots.length).toBe(1);
    const selectedSnapshot = taggedSnapshots[0];
    expect(selectedSnapshot.id).toBe(snapshot.id);
    
    // Create instance from tagged snapshot
    console.log(`Creating instance from tagged snapshot: ${selectedSnapshot.id}`);
    const instance = await client.instances.start({
      snapshotId: selectedSnapshot.id,
      metadata: {
        created_from_tag: instanceTag,
        test_instance: "true"
      }
    });
    
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);
    
    // Verify instance was created successfully
    expect(instance.id).toMatch(/^morphvm_/);
    expect(instance.refs.snapshotId).toBe(selectedSnapshot.id);
    
    // Test basic functionality
    const testResult = await instance.exec("echo 'Tagged snapshot instance test'");
    expect(testResult.exit_code).toBe(0);
    expect(testResult.stdout).toContain("Tagged snapshot instance test");
    
    console.log("Instance creation from tagged snapshot test passed");
  });
});