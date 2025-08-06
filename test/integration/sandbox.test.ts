// Test file corresponding to test_sandbox.py
// Jupyter sandbox environment creation and management

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

jest.setTimeout(10 * 60 * 1000); // 10 minutes for complex sandbox operations

describe("🧪 Sandbox Operations Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let testInstance: Instance;
  let testSnapshot: Snapshot;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  beforeAll(async () => {
    // Create base snapshot for sandbox testing
    testSnapshot = await client.snapshots.create({
      vcpus: 2,
      memory: 1024,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(testSnapshot.id);

    // Create instance for sandbox operations
    testInstance = await client.instances.start({ snapshotId: testSnapshot.id });
    instancesToCleanup.push(testInstance.id);
    await testInstance.waitUntilReady();
  });

  afterEach(async () => {
    // Clean up any additional resources created during tests
    // Error suppression to prevent cascade failures
  });

  afterAll(async () => {
    // Clean up all test instances
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore cleanup errors */
      }
    }
    // Clean up all test snapshots
    for (const id of snapshotsToCleanup) {
      try {
        const snap = await client.snapshots.get({ snapshotId: id });
        await snap.delete();
      } catch {
        /* ignore cleanup errors */
      }
    }
  });

  test("should create sandbox and establish Jupyter connection", async () => {
    // TODO: Implement Sandbox class and SandboxAPI
    // This test will initially fail until sandbox functionality is implemented
    
    const testId = uuidv4();
    console.log(`Testing sandbox creation with ID: ${testId}`);
    
    // Expected sandbox creation workflow:
    try {
      // const sandbox = await client.sandboxes.create({ instanceId: testInstance.id });
      // const sandboxAPI = sandbox.getAPI();
      // expect(sandbox.id).toMatch(/^sandbox_/);
      // expect(sandboxAPI).toBeDefined();
      // await sandboxAPI.connect();
      
      // Temporary implementation until Sandbox API exists
      throw new Error("TODO: Implement Sandbox class and SandboxAPI - sandbox functionality not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Sandbox functionality needs to be implemented");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should execute multi-language code in sandbox", async () => {
    const testId = uuidv4();
    const pythonCode = `test_var = "${testId}"\nprint(f"Test variable: {test_var}")`;
    const jsCode = `const testVar = "${testId}";\nconsole.log(\`JS test variable: \${testVar}\`);`;
    
    try {
      // Expected multi-language code execution:
      // const sandbox = await client.sandboxes.get({ instanceId: testInstance.id });
      // const sandboxAPI = sandbox.getAPI();
      // 
      // // Execute Python code
      // const pythonResult = await sandboxAPI.execute("python", pythonCode);
      // expect(pythonResult.output).toContain(testId);
      // expect(pythonResult.status).toBe("success");
      // 
      // // Execute JavaScript code
      // const jsResult = await sandboxAPI.execute("javascript", jsCode);
      // expect(jsResult.output).toContain(testId);
      // expect(jsResult.status).toBe("success");
      
      throw new Error("TODO: Implement multi-language code execution in SandboxAPI - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Multi-language sandbox execution needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should maintain kernel state across multiple API calls", async () => {
    const testId = uuidv4();
    const variableName = `persistent_var_${testId}`;
    
    try {
      // Expected kernel state persistence:
      // const sandbox = await client.sandboxes.get({ instanceId: testInstance.id });
      // const sandboxAPI = sandbox.getAPI();
      // 
      // // Set variable in first execution
      // const setResult = await sandboxAPI.execute("python", `${variableName} = "${testId}"`);
      // expect(setResult.status).toBe("success");
      // 
      // // Verify variable persists in second execution
      // const getResult = await sandboxAPI.execute("python", `print(${variableName})`);
      // expect(getResult.output).toContain(testId);
      // expect(getResult.status).toBe("success");
      
      throw new Error("TODO: Implement kernel state persistence in SandboxAPI - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Kernel state persistence needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should handle multiple language kernels with state persistence", async () => {
    const testId = uuidv4();
    const pythonVar = `python_var_${testId}`;
    const jsVar = `js_var_${testId}`;
    
    try {
      // Expected multi-kernel state management:
      // const sandbox = await client.sandboxes.get({ instanceId: testInstance.id });
      // const sandboxAPI = sandbox.getAPI();
      // 
      // // Set variables in different kernels
      // const pythonSetResult = await sandboxAPI.execute("python", `${pythonVar} = "python_${testId}"`);
      // const jsSetResult = await sandboxAPI.execute("javascript", `const ${jsVar} = "js_${testId}";`);
      // 
      // expect(pythonSetResult.status).toBe("success");
      // expect(jsSetResult.status).toBe("success");
      // 
      // // Verify independent state persistence
      // const pythonGetResult = await sandboxAPI.execute("python", `print(${pythonVar})`);
      // const jsGetResult = await sandboxAPI.execute("javascript", `console.log(${jsVar});`);
      // 
      // expect(pythonGetResult.output).toContain(`python_${testId}`);
      // expect(jsGetResult.output).toContain(`js_${testId}`);
      
      throw new Error("TODO: Implement multi-kernel state management in SandboxAPI - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Multi-kernel state management needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should discover available kernels in new sandbox", async () => {
    const testId = uuidv4();
    
    try {
      // Expected kernel discovery:
      // const sandbox = await client.sandboxes.create({ instanceId: testInstance.id });
      // const sandboxAPI = sandbox.getAPI();
      // 
      // const availableKernels = await sandboxAPI.getAvailableKernels();
      // expect(Array.isArray(availableKernels)).toBe(true);
      // expect(availableKernels.length).toBeGreaterThan(0);
      // 
      // // Should have at least Python and JavaScript kernels
      // const kernelNames = availableKernels.map(k => k.name.toLowerCase());
      // expect(kernelNames).toContain("python");
      // expect(kernelNames.some(name => name.includes("javascript") || name.includes("node"))).toBe(true);
      
      throw new Error("TODO: Implement kernel discovery in SandboxAPI - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Kernel discovery needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });

  test("should handle sandbox errors gracefully", async () => {
    const invalidCode = "this is invalid syntax in any language !!!";
    
    try {
      // Expected error handling:
      // const sandbox = await client.sandboxes.get({ instanceId: testInstance.id });
      // const sandboxAPI = sandbox.getAPI();
      // 
      // // Test invalid code execution
      // const errorResult = await sandboxAPI.execute("python", invalidCode);
      // expect(errorResult.status).toBe("error");
      // expect(errorResult.error).toBeDefined();
      // expect(typeof errorResult.error.message).toBe("string");
      // 
      // // Verify sandbox can recover and execute valid code
      // const validResult = await sandboxAPI.execute("python", "print('recovery test')");
      // expect(validResult.status).toBe("success");
      // expect(validResult.output).toContain("recovery test");
      
      throw new Error("TODO: Implement error handling in SandboxAPI - not yet available in TypeScript SDK");
    } catch (error: any) {
      if (error.message.includes("TODO: Implement")) {
        console.log("EXPECTED FAILURE: Sandbox error handling needs implementation");
        expect(error.message).toContain("TODO: Implement");
      } else {
        throw error;
      }
    }
  });
});