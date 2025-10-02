import { MorphCloudClient } from "../api";
import * as fs from "fs";
import * as path from "path";

// Create test directory structure
const createTestEnv = async () => {
  console.log("Creating sample local directory structure...");

  const testDir = "./foo";
  console.log("Removing existing ./foo directory...");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }

  console.log("Creating new ./foo directory...");
  fs.mkdirSync(testDir);
  fs.mkdirSync(path.join(testDir, "subdir"), { recursive: true });

  // Create test files
  fs.writeFileSync(path.join(testDir, "test1.txt"), "Test file 1");
  fs.writeFileSync(path.join(testDir, "test2.txt"), "Test file 2");
  fs.writeFileSync(path.join(testDir, "subdir", "test3.txt"), "Test file 3");

  // Create .gitignore and files that should be ignored
  fs.writeFileSync(
    path.join(testDir, ".gitignore"),
    `# Python artifacts
__pycache__/
*.py[cod]
*$py.class

# Temp files
*.tmp
temp/

# Test patterns
ignored_file.txt
ignored_dir/
*.ignore
`,
  );

  // Create files that should be ignored
  fs.writeFileSync(
    path.join(testDir, "ignored_file.txt"),
    "This file should be ignored",
  );
  fs.writeFileSync(
    path.join(testDir, "test.ignore"),
    "This file should be ignored",
  );
  fs.mkdirSync(path.join(testDir, "ignored_dir"));
  fs.writeFileSync(
    path.join(testDir, "ignored_dir", "file.txt"),
    "This file should be ignored",
  );
};

const main = async () => {
  await createTestEnv();
  console.log("\nGetting snapshot and creating instance...");

  const client = new MorphCloudClient({
    apiKey: process.env.MORPH_API_KEY || "",
  });

  // Use hardcoded snapshot
  const snapshot = await client.snapshots.get({
    snapshotId: "snapshot_9xy9io0w",
  });

  const instance = await client.instances.start({
    snapshotId: snapshot.id,
  });

  console.log("Waiting for instance to be ready...");
  await instance.waitUntilReady(60);

  // Create remote directory and check its status
  console.log("\nPreparing remote environment...");
  const ssh = await instance.ssh();
  await ssh.execCommand("mkdir -p /tmp/foo");
  const { stdout } = await ssh.execCommand("ls -la /tmp/foo");
  console.log("Remote directory status:", stdout);

  try {
    // First sync without gitignore
    console.log("\nSyncing ./foo to remote /tmp/foo WITHOUT gitignore...");
    await instance.sync(path.resolve("./foo"), `${instance.id}:/tmp/foo`, {
      verbose: true,
      delete: false,
    });

    console.log("\nVerifying all files were synced...");
    const { stdout: allFiles } = await ssh.execCommand(
      "find /tmp/foo -type f -exec ls -l {} \\;",
    );
    console.log("Remote files (should include ignored files):", allFiles);

    // Second sync with gitignore
    console.log("\nSyncing ./foo to remote /tmp/foo WITH gitignore...");
    await instance.sync(path.resolve("./foo"), `${instance.id}:/tmp/foo`, {
      verbose: true,
      delete: true,
      respectGitignore: true,
    });

    console.log("\nVerifying only non-ignored files were synced...");
    const { stdout: nonIgnoredFiles } = await ssh.execCommand(
      "find /tmp/foo -type f -exec ls -l {} \\;",
    );
    console.log(
      "Remote files (should NOT include ignored files):",
      nonIgnoredFiles,
    );

    // Verify specific file contents
    console.log("\nVerifying file contents...");
    const { stdout: contents } = await ssh.execCommand(
      "cat /tmp/foo/subdir/test3.txt",
    );
    console.log("test3.txt contents:", contents);

    // Verify ignored files are not present
    console.log("\nVerifying ignored files are not present...");
    const ignoredFiles = [
      "/tmp/foo/ignored_file.txt",
      "/tmp/foo/test.ignore",
      "/tmp/foo/ignored_dir/file.txt",
    ];

    for (const filePath of ignoredFiles) {
      const { stdout: fileCheck } = await ssh.execCommand(
        `test -f ${filePath} && echo "EXISTS" || echo "NOT FOUND"`,
      );
      console.log(`${filePath}: ${fileCheck.trim()}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error during sync:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      });
    } else {
      console.error("Unknown error during sync:", error);
    }
    throw error;
  } finally {
    // Clean up - just stop the instance
    console.log("\nCleaning up...");
    await instance.stop();
  }
};

main().catch(console.error);
