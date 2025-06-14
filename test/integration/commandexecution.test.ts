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
});