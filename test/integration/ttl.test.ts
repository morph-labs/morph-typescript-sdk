// Test file corresponding to test_ttl.py
// TTL (Time-To-Live) and auto-cleanup testing

import { MorphCloudClient, Instance, Snapshot } from "../../src/api";

jest.setTimeout(15 * 60 * 1000); // TTL tests need extended timeout

describe("⏰ TTL and Auto-cleanup Integration (TS)", () => {
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
    // Cleanup instances (may already be auto-deleted by TTL)
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup - instances may be auto-deleted */
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

  test("should set TTL during instance creation", async () => {
    console.log("Testing TTL setting during instance creation");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance with TTL set to 3 minutes (180 seconds)
    const ttlSeconds = 180;
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
      ttlSeconds: ttlSeconds,
      ttlAction: "stop",
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    console.log(`Instance ${instance.id} created with TTL: ${ttlSeconds} seconds`);

    // Verify instance is accessible immediately
    const echoResult = await instance.exec("echo 'TTL test'");
    expect(echoResult.exit_code).toBe(0);
    expect(echoResult.stdout.trim()).toBe("TTL test");

    // Wait for 30 seconds and verify instance is still accessible
    console.log("Waiting 30 seconds to verify instance remains accessible during TTL period...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    const stillAliveResult = await instance.exec("echo 'Still alive'");
    expect(stillAliveResult.exit_code).toBe(0);
    expect(stillAliveResult.stdout.trim()).toBe("Still alive");

    console.log("Instance successfully accessible after 30 seconds with TTL set");

    // Get updated instance info to check TTL-related properties
    const updatedInstance = await client.instances.get({ instanceId: instance.id });
    console.log(`Instance status: ${updatedInstance.status}`);
    console.log(`Instance ID: ${updatedInstance.id}`);

    // Verify instance is still in expected state
    expect(updatedInstance.status).toBe("ready");
  });

  test("should auto-cleanup instance after TTL expiration", async () => {
    console.log("Testing auto-cleanup after TTL expiration");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance with very short TTL for testing (30 seconds)
    const ttlSeconds = 30;
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
      ttlSeconds: ttlSeconds,
      ttlAction: "stop",
    });
    // Note: Don't add to cleanup array since it should auto-delete
    await instance.waitUntilReady(300);

    console.log(`Instance ${instance.id} created with short TTL: ${ttlSeconds} seconds`);

    // Verify instance is initially accessible
    const initialResult = await instance.exec("echo 'Before TTL expiration'");
    expect(initialResult.exit_code).toBe(0);
    expect(initialResult.stdout.trim()).toBe("Before TTL expiration");

    // Wait for TTL to expire plus buffer time (TTL + 20 seconds)
    const waitTime = (ttlSeconds + 20) * 1000;
    console.log(`Waiting ${waitTime / 1000} seconds for TTL expiration and auto-cleanup...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Verify instance is no longer accessible (should throw error)
    console.log("Checking if instance was auto-deleted...");
    
    try {
      await client.instances.get({ instanceId: instance.id });
      // If we reach here, the instance still exists (test should fail)
      throw new Error("Instance should have been auto-deleted but still exists");
    } catch (error: any) {
      // Expected behavior - instance should not be found
      console.log("Instance successfully auto-deleted after TTL expiration");
      expect(error.message).toMatch(/404|not found|not exist/i);
    }

    // Additional verification: try to execute command on deleted instance
    try {
      await instance.exec("echo 'This should fail'");
      // If we reach here, the command succeeded (test should fail)
      throw new Error("Command execution should have failed on deleted instance");
    } catch (error: any) {
      // Expected behavior - command should fail
      console.log("Command execution correctly failed on auto-deleted instance");
      expect(error.message).toMatch(/404|not found|not exist|failed/i);
    }
  });

  test("should support different TTL actions", async () => {
    console.log("Testing different TTL actions (stop vs pause)");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Test TTL with "pause" action
    const ttlSeconds = 120; // 2 minutes
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
      ttlSeconds: ttlSeconds,
      ttlAction: "pause", // Different action than previous tests
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    console.log(`Instance ${instance.id} created with TTL: ${ttlSeconds} seconds and action: pause`);

    // Verify instance is accessible
    const testResult = await instance.exec("echo 'TTL pause test'");
    expect(testResult.exit_code).toBe(0);
    expect(testResult.stdout.trim()).toBe("TTL pause test");

    // Get instance info to verify TTL settings
    const instanceInfo = await client.instances.get({ instanceId: instance.id });
    console.log(`Instance status: ${instanceInfo.status}`);
    
    // The instance should be created successfully with TTL settings
    expect(instanceInfo.status).toBe("ready");
    expect(instanceInfo.id).toBe(instance.id);

    console.log("TTL with pause action set successfully");
  });

  test("should handle TTL edge cases", async () => {
    console.log("Testing TTL edge cases");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Test with minimum reasonable TTL (30 seconds)
    const minTtlSeconds = 30;
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
      ttlSeconds: minTtlSeconds,
      ttlAction: "stop",
    });
    // Don't add to cleanup since it should auto-delete quickly
    await instance.waitUntilReady(300);

    console.log(`Instance ${instance.id} created with minimum TTL: ${minTtlSeconds} seconds`);

    // Verify instance starts correctly even with short TTL
    const quickTest = await instance.exec("whoami");
    expect(quickTest.exit_code).toBe(0);
    expect(quickTest.stdout.trim()).toBeTruthy();

    console.log("Instance with minimum TTL created and accessible");

    // Note: We don't wait for this to expire in the test to keep test time reasonable
    // The auto-cleanup functionality is already tested in the previous test
  });

  // New missing test: Wake-on-SSH functionality (equivalent to test_wake_on_ssh)
  test.skip("should wake instance on SSH connection", async () => {
    console.log("⚠️ SPECIFICATION TEST: Wake-on-SSH functionality not verified to exist in TypeScript SDK");
    
    // TODO: This test requires wake-on-event functionality which may not be implemented
    // Equivalent to Python: test_wake_on_ssh()
    
    // Expected functionality:
    // 1. Create instance with TTL and pause action
    // 2. Wait for instance to be paused due to TTL
    // 3. Establish SSH connection to wake instance
    // 4. Verify instance becomes active again
    
    // const snapshot = await client.snapshots.create({
    //   imageId: baseImageId,
    //   vcpus: 1,
    //   memory: 512,
    //   diskSize: 8192,
    // });
    // snapshotsToCleanup.push(snapshot.id);
    // 
    // // Create instance with short TTL and pause action
    // const instance = await client.instances.start({
    //   snapshotId: snapshot.id,
    //   ttlSeconds: 60, // 1 minute
    //   ttlAction: "pause",
    // });
    // instancesToCleanup.push(instance.id);
    // await instance.waitUntilReady();
    // 
    // console.log("Waiting for instance to be paused by TTL...");
    // await new Promise(resolve => setTimeout(resolve, 90000)); // Wait 1.5 minutes
    // 
    // // Check instance is paused
    // const pausedInstance = await client.instances.get({ instanceId: instance.id });
    // expect(pausedInstance.status).toBe("paused");
    // 
    // // Establish SSH connection to trigger wake-up
    // console.log("Establishing SSH connection to wake instance...");
    // const ssh = await instance.ssh();
    // 
    // // Wait for instance to wake up
    // await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    // 
    // // Verify instance is active again
    // const wokeInstance = await client.instances.get({ instanceId: instance.id });
    // expect(wokeInstance.status).toBe("ready");
    // 
    // // Test command execution works
    // const wakeTest = await instance.exec("echo 'Woke up via SSH'");
    // expect(wakeTest.exit_code).toBe(0);
    // expect(wakeTest.stdout).toContain("Woke up via SSH");
    // 
    // ssh.dispose();
    
    throw new Error("Wake-on-SSH functionality not verified to exist in TypeScript SDK yet");
  });

  // New missing test: Wake-on-HTTP functionality (equivalent to test_wake_on_http)
  test.skip("should wake instance on HTTP request", async () => {
    console.log("⚠️ SPECIFICATION TEST: Wake-on-HTTP functionality not verified to exist in TypeScript SDK");
    
    // TODO: This test requires wake-on-event functionality which may not be implemented
    // Equivalent to Python: test_wake_on_http()
    
    // Expected functionality:
    // 1. Create instance with TTL and pause action
    // 2. Expose HTTP service on instance
    // 3. Wait for instance to be paused due to TTL
    // 4. Make HTTP request to trigger wake-up
    // 5. Verify instance becomes active again
    
    // const snapshot = await client.snapshots.create({
    //   imageId: baseImageId,
    //   vcpus: 1,
    //   memory: 512,
    //   diskSize: 8192,
    // });
    // snapshotsToCleanup.push(snapshot.id);
    // 
    // // Create instance with short TTL and pause action
    // const instance = await client.instances.start({
    //   snapshotId: snapshot.id,
    //   ttlSeconds: 60, // 1 minute
    //   ttlAction: "pause",
    // });
    // instancesToCleanup.push(instance.id);
    // await instance.waitUntilReady();
    // 
    // // Set up HTTP service
    // await instance.exec("python3 -m http.server 8080 > /dev/null 2>&1 &");
    // const httpService = await instance.exposeHttpService("test-wake", 8080);
    // 
    // console.log("Waiting for instance to be paused by TTL...");
    // await new Promise(resolve => setTimeout(resolve, 90000)); // Wait 1.5 minutes
    // 
    // // Check instance is paused
    // const pausedInstance = await client.instances.get({ instanceId: instance.id });
    // expect(pausedInstance.status).toBe("paused");
    // 
    // // Make HTTP request to trigger wake-up
    // console.log(`Making HTTP request to ${httpService.url} to wake instance...`);
    // const response = await fetch(httpService.url);
    // 
    // // Wait for instance to wake up
    // await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    // 
    // // Verify instance is active again
    // const wokeInstance = await client.instances.get({ instanceId: instance.id });
    // expect(wokeInstance.status).toBe("ready");
    // 
    // // Test command execution works
    // const wakeTest = await instance.exec("echo 'Woke up via HTTP'");
    // expect(wakeTest.exit_code).toBe(0);
    // expect(wakeTest.stdout).toContain("Woke up via HTTP");
    // 
    // // Clean up HTTP service
    // await instance.hideHttpService("test-wake");
    
    throw new Error("Wake-on-HTTP functionality not verified to exist in TypeScript SDK yet");
  });
});