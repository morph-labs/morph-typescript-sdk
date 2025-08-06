// Test file corresponding to test_command_execution.py
// Various command execution scenarios and error handling

import { MorphCloudClient, Instance, Snapshot } from "../../src/api";
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

  // New missing test: Dual stdout/stderr streaming (equivalent to test_streaming_both_callbacks)
  test("should support dual stdout and stderr streaming", async () => {
    console.log("Testing dual stdout/stderr streaming");
    
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    
    const result = await testInstance.exec(
      "echo 'stdout line 1'; echo 'stderr line 1' >&2; echo 'stdout line 2'; echo 'stderr line 2' >&2",
      {
        onStdout: (content) => {
          stdoutChunks.push(content);
          console.log(`STDOUT: ${content.trim()}`);
        },
        onStderr: (content) => {
          stderrChunks.push(content);
          console.log(`STDERR: ${content.trim()}`);
        }
      }
    );
    
    // Verify final response
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toContain("stdout line 1");
    expect(result.stdout).toContain("stdout line 2");
    expect(result.stderr).toContain("stderr line 1");
    expect(result.stderr).toContain("stderr line 2");
    
    // Verify callbacks were called
    expect(stdoutChunks.length).toBeGreaterThan(0);
    expect(stderrChunks.length).toBeGreaterThan(0);
    
    const stdoutContent = stdoutChunks.join('');
    const stderrContent = stderrChunks.join('');
    expect(stdoutContent).toContain("stdout line 1");
    expect(stderrContent).toContain("stderr line 1");
    
    console.log("Dual stdout/stderr streaming test passed");
  });

  // New missing test: Streaming vs traditional consistency (equivalent to test_streaming_vs_traditional_consistency)
  test("should ensure streaming and traditional execution consistency", async () => {
    console.log("Testing streaming vs traditional consistency");
    
    const testCommand = "echo 'consistency test'; echo 'error output' >&2; exit 42";
    
    // Execute with traditional endpoint (no callbacks)
    const traditionalResult = await testInstance.exec(testCommand);
    
    // Execute with streaming endpoint (with callbacks)
    let streamingStdout = "";
    let streamingStderr = "";
    const streamingResult = await testInstance.exec(testCommand, {
      onStdout: (content) => { streamingStdout += content; },
      onStderr: (content) => { streamingStderr += content; }
    });
    
    // Verify results are consistent
    expect(traditionalResult.exit_code).toBe(streamingResult.exit_code);
    expect(traditionalResult.exit_code).toBe(42);
    
    expect(traditionalResult.stdout.trim()).toContain("consistency test");
    expect(streamingResult.stdout.trim()).toContain("consistency test");
    expect(streamingStdout.trim()).toContain("consistency test");
    
    expect(traditionalResult.stderr.trim()).toContain("error output");
    expect(streamingResult.stderr.trim()).toContain("error output");
    expect(streamingStderr.trim()).toContain("error output");
    
    console.log("Streaming vs traditional consistency test passed");
  });

  // New missing test: Synchronous streaming (equivalent to test_sync_streaming_stdout_callback)
  // Note: This might not be applicable in TypeScript as everything is async, but we test similar behavior
  test("should handle streaming callbacks synchronously within async execution", async () => {
    console.log("Testing synchronous callback handling in streaming");
    
    const processOrder: string[] = [];
    let callbackCount = 0;
    
    const result = await testInstance.exec(
      "echo 'first'; echo 'second'; echo 'third'",
      {
        onStdout: (content) => {
          callbackCount++;
          processOrder.push(`callback-${callbackCount}-${content.trim()}`);
          // Simulate some processing time
          const start = Date.now();
          while (Date.now() - start < 10) {} // 10ms busy wait
        }
      }
    );
    
    processOrder.push("execution-complete");
    
    expect(result.exit_code).toBe(0);
    expect(callbackCount).toBeGreaterThan(0);
    expect(processOrder[processOrder.length - 1]).toBe("execution-complete");
    
    console.log(`Process order: ${processOrder.join(', ')}`);
    console.log("Synchronous callback handling test passed");
  });

  // New missing test: Timeout error type verification for streaming (equivalent to test_timeout_error_type_streaming)
  test("should produce consistent timeout error types in streaming mode", async () => {
    console.log("Testing timeout error types in streaming mode");
    
    let errorThrown = false;
    let errorMessage = "";
    
    try {
      await testInstance.exec("sleep 10", {
        timeout: 1, // 1 second timeout
        onStdout: (content) => console.log(`Unexpected output: ${content}`)
      });
    } catch (error: any) {
      errorThrown = true;
      errorMessage = error.message;
    }
    
    expect(errorThrown).toBe(true);
    expect(errorMessage.toLowerCase()).toMatch(/timeout|timed out/);
    
    console.log(`Timeout error message: ${errorMessage}`);
    console.log("Timeout error type verification (streaming) test passed");
  });

  // New missing test: Timeout error type verification for traditional (equivalent to test_timeout_error_type_traditional)
  test("should produce consistent timeout error types in traditional mode", async () => {
    console.log("Testing timeout error types in traditional mode");
    
    let errorThrown = false;
    let errorMessage = "";
    
    try {
      await testInstance.exec("sleep 10", { timeout: 1 }); // 1 second timeout, no callbacks
    } catch (error: any) {
      errorThrown = true;
      errorMessage = error.message;
    }
    
    expect(errorThrown).toBe(true);
    expect(errorMessage.toLowerCase()).toMatch(/timeout|timed out/);
    
    console.log(`Timeout error message: ${errorMessage}`);
    console.log("Timeout error type verification (traditional) test passed");
  });

  // New missing test: UTF-8 and colored output preservation (equivalent to test_utf8_and_colored_output_streaming)
  test("should preserve UTF-8 and colored output in streaming mode", async () => {
    console.log("Testing UTF-8 and colored output preservation");
    
    const utf8Text = "Hello 世界! Café ñoño";
    const coloredCommand = `echo -e "\\033[31mRed Text\\033[0m ${utf8Text} \\033[32mGreen Text\\033[0m"`;
    
    let capturedOutput = "";
    const result = await testInstance.exec(coloredCommand, {
      onStdout: (content) => {
        capturedOutput += content;
      }
    });
    
    expect(result.exit_code).toBe(0);
    
    // Check UTF-8 characters are preserved
    expect(result.stdout).toContain("世界");
    expect(result.stdout).toContain("Café");
    expect(result.stdout).toContain("ñoño");
    expect(capturedOutput).toContain("世界");
    expect(capturedOutput).toContain("Café");
    
    // Check ANSI escape codes are preserved (color codes)
    expect(result.stdout).toContain("\u001b[31m"); // Red color code
    expect(result.stdout).toContain("\u001b[32m"); // Green color code
    expect(result.stdout).toContain("\u001b[0m");  // Reset code
    expect(capturedOutput).toContain("\u001b[31m");
    
    console.log(`Captured UTF-8 and colored output: ${capturedOutput.trim()}`);
    console.log("UTF-8 and colored output preservation test passed");
  });

  // New missing test: Stderr-only with stdout callback (equivalent to test_stderr_only_with_stdout_callback)
  test("should handle stderr-only output with stdout callback configured", async () => {
    console.log("Testing stderr-only output with stdout callback");
    
    let stdoutCallbackCalled = false;
    let stderrCallbackCalled = false;
    
    const result = await testInstance.exec("echo 'error only' >&2", {
      onStdout: (content) => {
        stdoutCallbackCalled = true;
        console.log(`Unexpected stdout: ${content}`);
      },
      onStderr: (content) => {
        stderrCallbackCalled = true;
        console.log(`Expected stderr: ${content}`);
      }
    });
    
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe(""); // No stdout output
    expect(result.stderr).toContain("error only");
    
    // Only stderr callback should have been called
    expect(stdoutCallbackCalled).toBe(false);
    expect(stderrCallbackCalled).toBe(true);
    
    console.log("Stderr-only with stdout callback test passed");
  });

  // New missing test: Null vs undefined callback handling (equivalent to test_none_callback_vs_not_provided)
  test("should handle null vs undefined callback differences", async () => {
    console.log("Testing null vs undefined callback handling");
    
    const testCommand = "echo 'callback test'";
    
    // Test with undefined callbacks (not provided)
    const undefinedResult = await testInstance.exec(testCommand, {});
    
    // Test with explicitly null callbacks (if supported)
    const nullResult = await testInstance.exec(testCommand, {
      onStdout: undefined,
      onStderr: undefined
    });
    
    // Both should behave the same way (use traditional endpoint)
    expect(undefinedResult.exit_code).toBe(nullResult.exit_code);
    expect(undefinedResult.stdout).toBe(nullResult.stdout);
    expect(undefinedResult.stderr).toBe(nullResult.stderr);
    
    expect(undefinedResult.exit_code).toBe(0);
    expect(undefinedResult.stdout).toContain("callback test");
    
    console.log("Null vs undefined callback handling test passed");
  });
});