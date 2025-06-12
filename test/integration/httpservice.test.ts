// tests/integration/branching.test.ts

import { MorphCloudClient, Instance, Snapshot, Image } from "morphcloud";

describe("Instance Branching", () => {
  let client: MorphCloudClient;
  let originalInstance: Instance;
  let initialSnapshot: Snapshot;
  const resources = {
    snapshots: [] as string[],
    instances: [] as string[],
  };

  beforeAll(async () => {
    client = new MorphCloudClient({
      apiKey: process.env.MORPH_API_KEY!,
      baseUrl: process.env.MORPH_BASE_URL,
      verbose: true,
    });

    // 1️⃣ Pick a base image
    const images: Image[] = await client.images.list({ limit: 1 });
    if (images.length === 0) {
      throw new Error("No available images to run branching tests.");
    }
    const baseImage = images[0];

    // 2️⃣ Create an initial snapshot from the base image
    initialSnapshot = await client.snapshots.create({
      imageId: baseImage.id,
      vcpus: 1,
      memory: 512,
      diskSize: 1024,
    });
    resources.snapshots.push(initialSnapshot.id);

    // 3️⃣ Launch the original instance
    originalInstance = await client.instances.start({
      snapshotId: initialSnapshot.id,
    });
    resources.instances.push(originalInstance.id);
    await originalInstance.waitUntilReady(300);
  });

  test("should create independent branches from an instance", async () => {
    // 🔄 Create snapshot from the original instance
    const branchSnapshot = await originalInstance.snapshot();
    resources.snapshots.push(branchSnapshot.id);
    expect(branchSnapshot.id).toMatch(/^snapshot_/);

    // 🥇 First branch
    const branch1 = await client.instances.start({
      snapshotId: branchSnapshot.id,
    });
    resources.instances.push(branch1.id);
    await branch1.waitUntilReady(300);
    expect(branch1.refs.snapshotId).toBe(branchSnapshot.id);

    // 🥈 Second branch
    const branch2 = await client.instances.start({
      snapshotId: branchSnapshot.id,
    });
    resources.instances.push(branch2.id);
    await branch2.waitUntilReady(300);
    expect(branch2.refs.snapshotId).toBe(branchSnapshot.id);

    // 🔍 Ensure they are distinct instances
    expect(branch1.id).not.toBe(branch2.id);
  });

  afterAll(async () => {
    // 🛑 Stop instances
    for (const instanceId of resources.instances.reverse()) {
      try {
        const inst = await client.instances.get({ instanceId });
        await inst.stop();
      } catch {
        // ignore cleanup errors
      }
    }

    // 🗑️ Delete snapshots
    for (const snapshotId of resources.snapshots.reverse()) {
      try {
        const snap = await client.snapshots.get({ snapshotId });
        await snap.delete();
      } catch {
        // ignore cleanup errors
      }
    }
  });
});
