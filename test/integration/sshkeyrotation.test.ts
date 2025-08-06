/**
 * Integration tests for SSH key rotation functionality in MorphCloud SDK.
 * Based on test_ssh_key_rotation.py from the Python SDK.
 */

import { MorphCloudClient, Instance, Snapshot, InstanceSshKey } from "../../src/api";

jest.setTimeout(5 * 60 * 1000); // SSH key operations can take time

describe("🔑 SSH Key Rotation Tests", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let testInstance: Instance;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  beforeAll(async () => {
    console.log("Creating test instance for SSH key rotation tests");
    
    // Create base snapshot
    const baseSnapshot = await client.snapshots.create({
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(baseSnapshot.id);
    console.log(`Created snapshot: ${baseSnapshot.id}`);

    // Start instance
    testInstance = await client.instances.start({ snapshotId: baseSnapshot.id });
    instancesToCleanup.push(testInstance.id);
    console.log(`Created instance: ${testInstance.id}`);

    // Wait for instance to be ready
    console.log("Waiting for instance to be ready...");
    await testInstance.waitUntilReady(300);
    console.log("Instance is ready");
  });

  afterAll(async () => {
    // Clean up resources
    for (const id of instancesToCleanup) {
      try {
        console.log(`Stopping instance ${id}`);
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
        console.log("Instance stopped");
      } catch (error) {
        console.error(`Error stopping instance: ${error}`);
      }
    }

    for (const id of snapshotsToCleanup) {
      try {
        console.log(`Deleting snapshot ${id}`);
        const snapshot = await client.snapshots.get({ snapshotId: id });
        await snapshot.delete();
        console.log("Snapshot deleted");
      } catch (error) {
        console.error(`Error deleting snapshot: ${error}`);
      }
    }
  });

  test("should retrieve SSH key details", async () => {
    console.log("Testing SSH key retrieval");
    
    // Test sync method
    const sshKey = await testInstance.sshKey();
    
    // Verify SSH key properties
    expect(sshKey.object).toBe("instance_ssh_key");
    expect(sshKey.private_key).toBeTruthy();
    expect(sshKey.public_key).toBeTruthy();
    expect(sshKey.password).toBeTruthy();
    expect(typeof sshKey.private_key).toBe("string");
    expect(typeof sshKey.public_key).toBe("string");
    expect(typeof sshKey.password).toBe("string");
    
    console.log("SSH key retrieval test passed");
  });

  test("should rotate SSH key successfully", async () => {
    console.log("Testing SSH key rotation");
    
    // Get current SSH key
    const currentKey = await testInstance.sshKey();
    console.log(`Current public key: ${currentKey.public_key.substring(0, 50)}...`);
    
    // Rotate SSH key
    const newKey = await testInstance.sshKeyRotate();
    console.log(`New public key: ${newKey.public_key.substring(0, 50)}...`);
    
    // Verify new key properties
    expect(newKey.object).toBe("instance_ssh_key");
    expect(newKey.private_key).toBeTruthy();
    expect(newKey.public_key).toBeTruthy();
    expect(newKey.password).toBeTruthy();
    
    // Verify keys are different
    expect(newKey.public_key).not.toBe(currentKey.public_key);
    expect(newKey.private_key).not.toBe(currentKey.private_key);
    // Note: passwords might be the same, that's implementation dependent
    
    console.log("SSH key rotation test passed");
  });

  test("should work with SSH connection after key rotation", async () => {
    console.log("Testing SSH connection before and after key rotation");
    
    // Test SSH connection before rotation
    console.log("Testing SSH connection before rotation");
    let ssh = await testInstance.ssh();
    try {
      const result = await ssh.execCommand("echo 'pre-rotation test'", { 
        cwd: "/"
      });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("pre-rotation test");
      console.log("SSH connection successful before rotation");
    } finally {
      ssh.dispose();
    }
    
    // Rotate SSH key
    console.log("Rotating SSH key");
    const newKey = await testInstance.sshKeyRotate();
    console.log(`SSH key rotated, new public key: ${newKey.public_key.substring(0, 50)}...`);
    
    // Brief pause to ensure key rotation is propagated
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test SSH connection after rotation
    console.log("Testing SSH connection after rotation");
    ssh = await testInstance.ssh();
    try {
      const result = await ssh.execCommand("echo 'post-rotation test'", { 
        cwd: "/"
      });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("post-rotation test");
      console.log("SSH connection successful after rotation");
    } finally {
      ssh.dispose();
    }
    
    console.log("SSH connection test passed");
  });

  test("should generate unique keys across multiple rotations", async () => {
    console.log("Testing SSH key uniqueness across multiple rotations");
    
    // Collect multiple keys
    const keys: string[] = [];
    for (let i = 0; i < 3; i++) {
      console.log(`Rotation ${i + 1}: Rotating SSH key`);
      const rotatedKey = await testInstance.sshKeyRotate();
      keys.push(rotatedKey.public_key);
      console.log(`Rotation ${i + 1}: New public key: ${rotatedKey.public_key.substring(0, 50)}...`);
    }
    
    // Verify all keys are unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
    
    console.log("SSH key uniqueness test passed");
  });

  test("should work with raw HTTP API endpoint", async () => {
    console.log("Testing raw HTTP API endpoint for SSH key rotation");
    
    const baseUrl = process.env.MORPH_BASE_URL || "https://cloud.morph.so/api";
    const headers = {
      "Authorization": `Bearer ${process.env.MORPH_API_KEY}`,
      "Content-Type": "application/json"
    };
    
    // Get current SSH key via raw API
    console.log("Getting current SSH key via raw API");
    const getResponse = await fetch(`${baseUrl}/instance/${testInstance.id}/ssh/key`, {
      headers
    });
    expect(getResponse.ok).toBe(true);
    
    const currentKeyData = await getResponse.json();
    expect(currentKeyData.object).toBe("instance_ssh_key");
    console.log(`Current key retrieved: ${currentKeyData.public_key.substring(0, 50)}...`);
    
    // Rotate SSH key via raw API
    console.log("Rotating SSH key via raw API");
    const postResponse = await fetch(`${baseUrl}/instance/${testInstance.id}/ssh/key`, {
      method: "POST",
      headers
    });
    expect(postResponse.ok).toBe(true);
    
    const newKeyData = await postResponse.json();
    expect(newKeyData.object).toBe("instance_ssh_key");
    console.log(`New key retrieved: ${newKeyData.public_key.substring(0, 50)}...`);
    
    // Verify keys are different
    expect(newKeyData.public_key).not.toBe(currentKeyData.public_key);
    expect(newKeyData.private_key).not.toBe(currentKeyData.private_key);
    
    console.log("Raw HTTP API endpoint test passed");
  });

  // New missing test: Mixed async operation consistency (equivalent to test_mixed_sync_async_operations)  
  test("should maintain consistency across different API access patterns", async () => {
    console.log("Testing API consistency across different access patterns");
    
    // Note: TypeScript SDK is purely async, but we test consistency between
    // SDK methods and raw HTTP API calls
    
    // Get key via SDK method
    console.log("Getting SSH key via SDK method");
    const sdkKey = await testInstance.sshKey();
    
    // Get same key via raw HTTP API
    console.log("Getting SSH key via raw HTTP API");
    const baseUrl = process.env.MORPH_BASE_URL || "https://cloud.morph.so/api";
    const headers = {
      "Authorization": `Bearer ${process.env.MORPH_API_KEY}`,
      "Content-Type": "application/json"
    };
    
    const httpResponse = await fetch(`${baseUrl}/instance/${testInstance.id}/ssh/key`, {
      headers
    });
    expect(httpResponse.ok).toBe(true);
    const httpKey = await httpResponse.json();
    
    // Verify both methods return identical keys
    expect(sdkKey.object).toBe(httpKey.object);
    expect(sdkKey.public_key).toBe(httpKey.public_key);
    expect(sdkKey.private_key).toBe(httpKey.private_key);
    expect(sdkKey.password).toBe(httpKey.password);
    
    console.log("Both methods returned identical key data");
    
    // Rotate via SDK method
    console.log("Rotating SSH key via SDK method");
    const sdkRotatedKey = await testInstance.sshKeyRotate();
    
    // Get rotated key via HTTP API to verify consistency
    console.log("Verifying rotated key via HTTP API");
    const verifyResponse = await fetch(`${baseUrl}/instance/${testInstance.id}/ssh/key`, {
      headers
    });
    expect(verifyResponse.ok).toBe(true);
    const verifyKey = await verifyResponse.json();
    
    // Verify SDK rotation is reflected in HTTP API
    expect(sdkRotatedKey.object).toBe(verifyKey.object);
    expect(sdkRotatedKey.public_key).toBe(verifyKey.public_key);
    expect(sdkRotatedKey.private_key).toBe(verifyKey.private_key);
    expect(sdkRotatedKey.password).toBe(verifyKey.password);
    
    // Verify rotation actually changed the keys
    expect(sdkRotatedKey.public_key).not.toBe(sdkKey.public_key);
    expect(sdkRotatedKey.private_key).not.toBe(sdkKey.private_key);
    
    console.log("API consistency test passed");
  });
});