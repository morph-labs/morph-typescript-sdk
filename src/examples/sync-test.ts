import { MorphCloudClient } from "../api";
import * as fs from "fs";
import * as path from "path";

// Initialize the client
const client = new MorphCloudClient({
  apiKey: "morph_YmBV85wIXBQqIPrNx6BnDc",
});

(async () => {
  try {
    // Create sample local directory structure
    console.log("Creating sample local directory structure...");
    if (fs.existsSync("./foo")) {
      console.log("Removing existing ./foo directory...");
      fs.rmSync("./foo", { recursive: true, force: true });
    }
    if (fs.existsSync("./foo2")) {
      console.log("Removing existing ./foo2 directory...");
      fs.rmSync("./foo2", { recursive: true, force: true });
    }

    console.log("Creating new ./foo directory...");
    fs.mkdirSync("./foo");
    fs.writeFileSync("./foo/test1.txt", "Hello from test1!");
    fs.writeFileSync("./foo/test2.txt", "Hello from test2!");
    fs.mkdirSync("./foo/subdir");
    fs.writeFileSync("./foo/subdir/test3.txt", "Hello from subdir!");

    // Create a minimal snapshot and instance
    console.log("\nCreating snapshot and instance...");
    const snapshot = await client.snapshots.get({
      snapshotId: "snapshot_9xy9io0w",
    });

    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });

    // Wait for instance to be ready
    console.log("Waiting for instance to be ready...");
    await instance.waitUntilReady(60);

    // Ensure remote directory exists and is empty
    console.log("\nPreparing remote environment...");
    const ssh = await instance.ssh();
    await ssh.execCommand("rm -rf /tmp/foo");
    await ssh.execCommand("mkdir -p /tmp/foo");

    // Verify remote directory was created
    const checkResult = await ssh.execCommand("ls -la /tmp/foo");
    console.log(
      "Remote directory status:",
      checkResult.stdout || checkResult.stderr,
    );

    // First sync: local to remote
    console.log("\nSyncing ./foo to remote /tmp/foo...");
    try {
      await instance.sync(
        path.resolve("./foo"), // Use absolute path
        `${instance.id}:/tmp/foo`,
        { verbose: true },
      );
    } catch (error) {
      console.error("Error during first sync:", error);
      throw error;
    }

    // Verify remote contents
    console.log("\nVerifying remote contents...");
    const remoteList = await ssh.execCommand(
      "find /tmp/foo -type f -exec cat {} \\;",
    );
    console.log("Remote files content:", remoteList.stdout);

    // Second sync: remote back to local
    console.log("\nSyncing remote /tmp/foo back to ./foo2...");
    try {
      await instance.sync(
        `${instance.id}:/tmp/foo`,
        path.resolve("./foo2"), // Use absolute path
        { verbose: true },
      );
    } catch (error) {
      console.error("Error during second sync:", error);
      throw error;
    }

    // Verify the contents
    console.log("\nVerifying local contents...");
    const compareDirectories = (
      dir1: string,
      dir2: string,
      relativePath: string = "",
    ) => {
      const files1 = fs.readdirSync(path.join(dir1, relativePath));
      const files2 = fs.readdirSync(path.join(dir2, relativePath));

      console.log(`Comparing ${relativePath || "/"}`);
      console.log(`Files in ${dir1}:`, files1);
      console.log(`Files in ${dir2}:`, files2);

      if (files1.length !== files2.length) {
        throw new Error(
          `Directory ${relativePath} has different number of files`,
        );
      }

      for (const file of files1) {
        const fullPath1 = path.join(dir1, relativePath, file);
        const fullPath2 = path.join(dir2, relativePath, file);

        const stat1 = fs.statSync(fullPath1);
        const stat2 = fs.statSync(fullPath2);

        if (stat1.isDirectory() !== stat2.isDirectory()) {
          throw new Error(
            `${file} is directory in one location but not in other`,
          );
        }

        if (stat1.isDirectory()) {
          compareDirectories(dir1, dir2, path.join(relativePath, file));
        } else {
          const content1 = fs.readFileSync(fullPath1, "utf8");
          const content2 = fs.readFileSync(fullPath2, "utf8");
          console.log(
            `Comparing ${file}:`,
            content1 === content2 ? "match" : "different",
          );
          if (content1 !== content2) {
            throw new Error(`File contents different for ${file}`);
          }
        }
      }
    };

    compareDirectories("./foo", "./foo2");
    console.log("Success! Directory contents match exactly.");

    // Cleanup
    console.log("\nCleaning up...");
    await instance.stop();
    // await snapshot.delete();
  } catch (error) {
    console.error("Error:", error);
    // Log instance status if available
    if (typeof error === "object" && error !== null) {
      console.error("Error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
        code: (error as any).code,
      });
    }
    throw error;
  }
})();
