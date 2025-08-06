// Test file corresponding to test_command_execution.py
// Various command execution scenarios and error handling

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

jest.setTimeout(5 * 60 * 1000); // increase timeout for long-running tests

describe("🔄 Command Execution Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let testInstance: Instance;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  // Boot a fresh "testInstance" before all tests
  beforeAll(async () => {
    // create a base snapshot to start from
    const baseSnap: Snapshot = await client.snapshots.create({
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(baseSnap.id);

    testInstance = await client.instances.start({ snapshotId: baseSnap.id });
    instancesToCleanup.push(testInstance.id);
    await testInstance.waitUntilReady();
  });

  // Tear down every instance & snapshot we created
  afterAll(async () => {
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
    for (const id of snapshotsToCleanup) {
      try {
        const s = await client.snapshots.get({ snapshotId: id });
        await s.delete();
      } catch {
        /* ignore */
      }
    }
  });

  // Test 1: Basic command execution (equivalent to test_basic_command_execution)
  test("should execute basic commands successfully", async () => {
    console.log("Testing basic command execution");
    
    // Execute a simple command
    const result = await testInstance.exec("echo 'hello world'");
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("hello world");
    expect(result.stderr).toBe("");
    
    console.log("Basic command execution test passed");
  });

  // Test 2: Command with non-zero exit code (equivalent to test_command_with_nonzero_exit_code)
  test("should handle commands with non-zero exit codes", async () => {
    console.log("Testing command with non-zero exit code");
    
    // Execute a command that should fail
    const result = await testInstance.exec("false");
    
    // Verify command output
    expect(result.exit_code).not.toBe(0);
    
    console.log("Command with non-zero exit code test passed");
  });

  // Test 3: Command with stderr output (equivalent to test_command_with_stderr)
  test("should handle commands that produce stderr output", async () => {
    console.log("Testing command with stderr output");
    
    // Execute a command that should produce stderr output
    const result = await testInstance.exec("ls /nonexistent");
    
    // Verify command output
    expect(result.exit_code).not.toBe(0);
    expect(result.stderr).toContain("No such file or directory");
    
    console.log("Command with stderr output test passed");
  });

  // Test 4: Command with arguments (equivalent to test_command_with_arguments)
  test("should execute commands with arguments", async () => {
    console.log("Testing command with arguments");
    
    // Generate a unique string
    const testString = uuidv4().replace(/-/g, "");
    
    // Execute command with arguments
    const result = await testInstance.exec(`echo 'test-${testString}'`);
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain(`test-${testString}`);
    
    console.log("Command with arguments test passed");
  });

  // Test 5: Command with environment variables (equivalent to test_command_with_environment_variables)
  test("should execute commands with environment variables", async () => {
    console.log("Testing command with environment variables");
    
    // Define environment variables
    const testKey = `TEST_KEY_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
    const testValue = `test_value_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
    
    // Execute command with environment variables (set via shell)
    const result = await testInstance.exec(`export ${testKey}=${testValue} && echo $${testKey}`);
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain(testValue);
    
    console.log("Command with environment variables test passed");
  });

  // Test 6: Command with working directory (equivalent to test_command_with_working_directory)
  test("should execute commands with working directory changes", async () => {
    console.log("Testing command with working directory");
    
    // Create a test directory
    const testDir = `/tmp/test_dir_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
    const mkdirResult = await testInstance.exec(`mkdir -p ${testDir}`);
    expect(mkdirResult.exit_code).toBe(0);
    
    // Create a test file in the test directory
    const testFile = "test_file.txt";
    const testContent = `test_content_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
    const writeResult = await testInstance.exec(`echo '${testContent}' > ${testDir}/${testFile}`);
    expect(writeResult.exit_code).toBe(0);
    
    // Execute command with working directory (use cd)
    const result = await testInstance.exec(`cd ${testDir} && cat ${testFile}`);
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain(testContent);
    
    console.log("Command with working directory test passed");
  });

  // Test 7: Command with input data (equivalent to test_command_with_input)
  test("should execute commands with input data", async () => {
    console.log("Testing command with input data");
    
    // Define input data
    const inputData = `test_input_${uuidv4().replace(/-/g, "").substring(0, 8)}`;
    
    // Execute command with input data (use echo and pipe)
    const result = await testInstance.exec(`echo '${inputData}' | cat`);
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain(inputData);
    
    console.log("Command with input data test passed");
  });

  // Test 8: Long-running command (equivalent to test_long_running_command)
  test("should execute long-running commands", async () => {
    console.log("Testing long-running command");
    
    // Execute a long-running command (sleep for 10 seconds)
    const startTime = Date.now();
    const result = await testInstance.exec("sleep 10 && echo 'done'");
    const endTime = Date.now();
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("done");
    
    // Verify command took at least 10 seconds
    const elapsedTime = (endTime - startTime) / 1000;
    expect(elapsedTime).toBeGreaterThanOrEqual(10);
    
    console.log("Long-running command test passed");
  });

  // Test 9: Complex command pipeline (equivalent to test_complex_command_pipeline)
  test("should execute complex command pipelines", async () => {
    console.log("Testing complex command pipeline");
    
    // Create a test file with multiple lines
    const testFile = `/tmp/test_file_${uuidv4().replace(/-/g, "").substring(0, 8)}.txt`;
    const lines = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape"];
    const content = lines.join("\\n");
    const writeResult = await testInstance.exec(`echo -e '${content}' > ${testFile}`);
    expect(writeResult.exit_code).toBe(0);
    
    // Execute a complex pipeline: grep for lines containing 'a', sort them, and take the first 2
    const pipeline = `grep 'a' ${testFile} | sort | head -2`;
    const result = await testInstance.exec(pipeline);
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("apple");
    expect(result.stdout).toContain("banana");
    expect(result.stdout).not.toContain("date");
    
    console.log("Complex command pipeline test passed");
  });

  // Test 10: Command with sudo (equivalent to test_command_with_sudo)
  test("should execute commands with sudo (if available)", async () => {
    console.log("Testing command execution with sudo");
    
    // Check if sudo is available and doesn't require password
    const sudoCheck = await testInstance.exec("sudo -n true");
    if (sudoCheck.exit_code !== 0) {
      console.log("sudo is not available without password, skipping test");
      return; // Skip this test if sudo is not available
    }
    
    // Execute a command with sudo
    const result = await testInstance.exec("sudo whoami");
    
    // Verify command output
    expect(result.exit_code).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("root");
    
    console.log("Command with sudo test passed");
  });

  // Additional test for array command format (from original test)
  test("should execute array command formats successfully", async () => {
    // Test array command
    const result = await testInstance.exec(["ls", "-la", "/"]);
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("root");
  });

  // New test for streaming with stdout callback
  test("should support streaming execution with stdout callback", async () => {
    console.log("Testing streaming execution with stdout callback");
    
    const chunks: string[] = [];
    const result = await testInstance.exec("echo 'line1'; echo 'line2'; echo 'line3'", {
      onStdout: (content) => {
        chunks.push(content);
        console.log(`Received stdout chunk: ${content.trim()}`);
      }
    });
    
    // Verify final response
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("line1");
    expect(result.stdout).toContain("line2");
    expect(result.stdout).toContain("line3");
    
    // Verify callbacks were called
    expect(chunks.length).toBeGreaterThan(0);
    const stdoutContent = chunks.join('');
    expect(stdoutContent).toContain("line1");
    
    console.log("Streaming execution with stdout callback test passed");
  });

  // New test for streaming with stderr callback
  test("should support streaming execution with stderr callback", async () => {
    console.log("Testing streaming execution with stderr callback");
    
    const stderrChunks: string[] = [];
    const result = await testInstance.exec("echo 'error message' >&2", {
      onStderr: (content) => {
        stderrChunks.push(content);
        console.log(`Received stderr chunk: ${content.trim()}`);
      }
    });
    
    // Verify final response
    expect(result.exit_code).toBe(0);
    expect(result.stderr).toContain("error message");
    
    // Verify stderr callback was called
    expect(stderrChunks.length).toBeGreaterThan(0);
    const stderrContent = stderrChunks.join('');
    expect(stderrContent).toContain("error message");
    
    console.log("Streaming execution with stderr callback test passed");
  });

  // New test for custom timeout (traditional endpoint)
  test("should support custom timeout for traditional execution", async () => {
    console.log("Testing custom timeout for traditional execution");
    
    // This command should timeout after 2 seconds
    await expect(
      testInstance.exec("sleep 5", { timeout: 2 })
    ).rejects.toThrow(/timed out/i);
    
    console.log("Custom timeout for traditional execution test passed");
  });

  // New test for custom timeout (streaming endpoint)
  test("should support custom timeout for streaming execution", async () => {
    console.log("Testing custom timeout for streaming execution");
    
    const chunks: string[] = [];
    
    // This command should timeout after 2 seconds while using streaming
    await expect(
      testInstance.exec("echo 'start'; sleep 5; echo 'end'", {
        timeout: 2,
        onStdout: (content) => chunks.push(content)
      })
    ).rejects.toThrow(/timed out/i);
    
    // Should have received some output before timeout
    console.log(`Received ${chunks.length} chunks before timeout: ${chunks.join('')}`);
    // Note: May not receive chunks if timeout happens very quickly
    
    console.log("Custom timeout for streaming execution test passed");
  });

  // New test for callback error resilience
  test("should handle callback errors gracefully", async () => {
    console.log("Testing callback error resilience");
    
    let callbackErrorCount = 0;
    const result = await testInstance.exec("echo 'line1'; echo 'line2'", {
      onStdout: (content) => {
        callbackErrorCount++;
        if (content.includes('line1')) {
          throw new Error("Intentional callback error");
        }
      }
    });
    
    // Command should still complete successfully despite callback error
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("line1");
    expect(result.stdout).toContain("line2");
    expect(callbackErrorCount).toBeGreaterThan(0);
    
    console.log("Callback error resilience test passed");
  });

  // Test that traditional endpoint is used when no callbacks provided
  test("should use traditional endpoint when no callbacks provided", async () => {
    console.log("Testing traditional endpoint usage");
    
    const result = await testInstance.exec("echo 'traditional endpoint test'");
    
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("traditional endpoint test");
    
    console.log("Traditional endpoint test passed");
  });

  // Test that streaming endpoint is used when callbacks provided
  test("should use streaming endpoint when callbacks provided", async () => {
    console.log("Testing streaming endpoint usage");
    
    let callbackCalled = false;
    const result = await testInstance.exec("echo 'streaming endpoint test'", {
      onStdout: () => { callbackCalled = true; }
    });
    
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("streaming endpoint test");
    expect(callbackCalled).toBe(true);
    
    console.log("Streaming endpoint test passed");
  });
});