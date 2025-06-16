import { MorphCloudClient, Snapshot, Image, Instance } from "morphcloud";

// Extend Jest timeout
jest.setTimeout(300000);

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`Attempt ${attempt} failed, retrying...`, err);
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Instance TTL Behavior', () => {
  let client: MorphCloudClient;
  let baseImage: Image;

  beforeAll(async () => {
    client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY!, baseUrl: process.env.MORPH_BASE_URL });
    const images = await withRetry(() => client.images.list({ limit: 1 }));
    if (!images.length) throw new Error('No base images available');
    baseImage = images[0];
  });

  it('creates an instance with TTL and remains accessible before expiry', async () => {
    let snapshot: Snapshot | undefined;
    let instance: Instance | undefined;
    const ttlSeconds = 180;

    try {
      // Create snapshot
      snapshot = await withRetry(() => client.snapshots.create({ imageId: baseImage.id, vcpus: 1, memory: 512, diskSize: 8192 }));
      const snapId = snapshot!.id;

      // Start instance with TTL
      instance = await withRetry(() => client.instances.start({ snapshotId: snapId, ttlSeconds }));
      await instance.waitUntilReady(300);

      // Verify instance is accessible
      const fetched = await client.instances.get({ instanceId: instance!.id });
      expect(fetched.id).toBe(instance!.id);

      // Wait a short time (30s) and check again
      await sleep(30000);
      const check = await client.instances.get({ instanceId: instance!.id });
      expect(check.id).toBe(instance!.id);
    } finally {
      if (instance) await instance.stop().catch(() => {});
      if (snapshot) await snapshot.delete().catch(() => {});
    }
  });

  it('auto-deletes instance after TTL expiry', async () => {
    let snapshot: Snapshot | undefined;
    let instance: Instance | undefined;
    const ttlSeconds = 15;

    try {
      snapshot = await withRetry(() => client.snapshots.create({ imageId: baseImage.id, vcpus: 1, memory: 512, diskSize: 8192 }));
      const snapId = snapshot!.id;
      instance = await withRetry(() => client.instances.start({ snapshotId: snapId, ttlSeconds }));
      await instance.waitUntilReady(300);

      // Wait past TTL
      await sleep((ttlSeconds + 10) * 1000);

      // Expect the instance to no longer exist
      await expect(client.instances.get({ instanceId: instance!.id })).rejects.toThrow();
    } finally {
      if (instance) await instance.stop().catch(() => {});
      if (snapshot) await snapshot.delete().catch(() => {});
    }
  });
});
