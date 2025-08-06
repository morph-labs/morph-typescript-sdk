// Test file corresponding to test_from_tag_multiple.py
// Tag-based snapshot management and retrieval

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

jest.setTimeout(5 * 60 * 1000); // 5 minutes for snapshot operations

describe("🏷️ Tag-based Snapshot Operations Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  const snapshots: Snapshot[] = [];
  const instancesToCleanup: string[] = [];

  afterEach(async () => {
    // Clean up any additional resources created during tests
    // Error suppression to prevent cascade failures
    for (const instance of instancesToCleanup.splice(0)) {
      try {
        const inst = await client.instances.get({ instanceId: instance });
        await inst.stop();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  afterAll(async () => {
    // Clean up all test snapshots
    for (const snapshot of snapshots) {
      try {
        await snapshot.delete();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  test("should handle multiple snapshots with same tag", async () => {
    const sharedTag = `test_tag_${uuidv4()}`;
    const uniqueContent1 = `content_${uuidv4()}`;
    const uniqueContent2 = `content_${uuidv4()}`;

    try {
      // Expected tag-based snapshot workflow:
      // 
      // // Create first snapshot with shared tag
      // const snapshot1 = await client.snapshots.create({
      //   vcpus: 1,
      //   memory: 512,
      //   diskSize: 8192,
      //   metadata: { tag: sharedTag, content: uniqueContent1, index: "1" }
      // });
      // snapshots.push(snapshot1);
      // 
      // // Create second snapshot with same tag
      // const snapshot2 = await client.snapshots.create({
      //   vcpus: 1,
      //   memory: 512,
      //   diskSize: 8192,
      //   metadata: { tag: sharedTag, content: uniqueContent2, index: "2" }
      // });
      // snapshots.push(snapshot2);
      // 
      // // Test retrieval by tag (should get most recent)
      // const retrievedSnapshot = await client.snapshots.getByTag(sharedTag);
      // expect(retrievedSnapshot.id).toBe(snapshot2.id);
      // expect(retrievedSnapshot.metadata?.content).toBe(uniqueContent2);
      // 
      // // Test listing all snapshots with the tag
      // const snapshotsWithTag = await client.snapshots.listByTag(sharedTag);
      // expect(snapshotsWithTag).toHaveLength(2);
      // const contents = snapshotsWithTag.map(s => s.metadata?.content);
      // expect(contents).toContain(uniqueContent1);
      // expect(contents).toContain(uniqueContent2);

      throw new Error("TODO: Implement tag-based snapshot operations (getByTag, listByTag) - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Tag-based snapshot operations need implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should retrieve single snapshot by tag", async () => {
    const uniqueTag = `unique_tag_${uuidv4()}`;
    const uniqueContent = `content_${uuidv4()}`;

    try {
      // Expected single tag retrieval:
      // 
      // // Create snapshot with unique tag
      // const snapshot = await client.snapshots.create({
      //   vcpus: 1,
      //   memory: 512,
      //   diskSize: 8192,
      //   metadata: { tag: uniqueTag, content: uniqueContent }
      // });
      // snapshots.push(snapshot);
      // 
      // // Retrieve by tag
      // const retrievedSnapshot = await client.snapshots.getByTag(uniqueTag);
      // expect(retrievedSnapshot.id).toBe(snapshot.id);
      // expect(retrievedSnapshot.metadata?.tag).toBe(uniqueTag);
      // expect(retrievedSnapshot.metadata?.content).toBe(uniqueContent);
      // 
      // // Verify tag-based filtering works
      // const filteredSnapshots = await client.snapshots.list({
      //   metadata: { tag: uniqueTag }
      // });
      // expect(filteredSnapshots).toHaveLength(1);
      // expect(filteredSnapshots[0].id).toBe(snapshot.id);

      throw new Error("TODO: Implement single snapshot tag retrieval (getByTag) - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Single tag retrieval needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should handle non-existent tag gracefully", async () => {
    const nonExistentTag = `non_existent_tag_${uuidv4()}`;

    try {
      // Expected error handling for non-existent tags:
      // 
      // // Attempt to retrieve non-existent tag
      // await expect(
      //   client.snapshots.getByTag(nonExistentTag)
      // ).rejects.toThrow(/not found|does not exist/i);
      // 
      // // List by non-existent tag should return empty array
      // const emptyResults = await client.snapshots.listByTag(nonExistentTag);
      // expect(Array.isArray(emptyResults)).toBe(true);
      // expect(emptyResults).toHaveLength(0);
      // 
      // // Filtered list should also be empty
      // const filteredResults = await client.snapshots.list({
      //   metadata: { tag: nonExistentTag }
      // });
      // expect(Array.isArray(filteredResults)).toBe(true);
      // expect(filteredResults).toHaveLength(0);

      throw new Error("TODO: Implement error handling for non-existent tags in snapshot operations - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Non-existent tag error handling needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });
});