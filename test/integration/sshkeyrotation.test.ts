// SSH Key Rotation Integration Test
// Tests the ability to rotate SSH keys for secure access to instances

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { generateKeyPairSync } from "crypto";

jest.setTimeout(5 * 60 * 1000); // SSH operations can take a few minutes

describe("🔑 SSH Key Rotation Integration (TS)", () => {
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

  test("should rotate SSH keys and maintain connectivity", async () => {
    console.log("Testing SSH key rotation");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Test initial SSH connectivity
    const initialTest = await instance.exec("echo 'initial-connection-test'");
    expect(initialTest.exitCode).toBe(0);
    expect(initialTest.stdout.trim()).toBe("initial-connection-test");

    // Generate new SSH key pair for rotation
    const newKeyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs1",
        format: "pem",
      },
    });

    // Perform SSH key rotation
    const rotationResult = await instance.rotateSSHKey({
      publicKey: newKeyPair.publicKey,
      privateKey: newKeyPair.privateKey,
    });

    expect(rotationResult.success).toBe(true);
    expect(rotationResult.keyFingerprint).toBeDefined();
    expect(rotationResult.rotatedAt).toBeDefined();

    // Test SSH connectivity with new keys
    const postRotationTest = await instance.exec("echo 'post-rotation-test'");
    expect(postRotationTest.exitCode).toBe(0);
    expect(postRotationTest.stdout.trim()).toBe("post-rotation-test");

    // Verify the rotation was logged
    expect(rotationResult.keyFingerprint).toMatch(/^[0-9a-f:]+$/);
  });

  test("should handle SSH key rotation with custom options", async () => {
    console.log("Testing SSH key rotation with custom options");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Generate new SSH key pair with custom parameters
    const customKeyPair = generateKeyPairSync("rsa", {
      modulusLength: 4096, // Stronger key
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs1",
        format: "pem",
      },
    });

    // Perform SSH key rotation with validation
    const rotationResult = await instance.rotateSSHKey({
      publicKey: customKeyPair.publicKey,
      privateKey: customKeyPair.privateKey,
      validateConnection: true,
      timeout: 30,
    });

    expect(rotationResult.success).toBe(true);
    expect(rotationResult.keyFingerprint).toBeDefined();
    expect(rotationResult.validationPassed).toBe(true);

    // Test connectivity after rotation
    const connectivityTest = await instance.exec("whoami");
    expect(connectivityTest.exitCode).toBe(0);
    expect(connectivityTest.stdout.trim()).toBeTruthy();
  });

  test("should handle SSH key rotation failure gracefully", async () => {
    console.log("Testing SSH key rotation error handling");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Test with invalid key format
    try {
      await instance.rotateSSHKey({
        publicKey: "invalid-public-key",
        privateKey: "invalid-private-key",
      });
      fail("Should have thrown an error for invalid keys");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Invalid SSH key format");
    }

    // Verify original connectivity still works
    const connectivityTest = await instance.exec("echo 'original-still-works'");
    expect(connectivityTest.exitCode).toBe(0);
    expect(connectivityTest.stdout.trim()).toBe("original-still-works");
  });

  test("should rotate SSH keys with key management best practices", async () => {
    console.log("Testing SSH key rotation with security best practices");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Generate new key pair
    const keyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs1",
        format: "pem",
      },
    });

    // Rotate with security options
    const rotationResult = await instance.rotateSSHKey({
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      removeOldKeys: true, // Clean up old keys
      validateConnection: true,
      auditLog: true, // Log the rotation for security audit
    });

    expect(rotationResult.success).toBe(true);
    expect(rotationResult.oldKeysRemoved).toBe(true);
    expect(rotationResult.auditLogged).toBe(true);

    // Verify connectivity with new keys
    const finalTest = await instance.exec("echo 'secure-rotation-complete'");
    expect(finalTest.exitCode).toBe(0);
    expect(finalTest.stdout.trim()).toBe("secure-rotation-complete");
  });
});