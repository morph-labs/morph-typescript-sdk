// test_file_operations.ts
import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

describe("MorphCloud File Operations Tests", () => {
  let client: MorphCloudClient;
  let baseImageId: string;
  let instance: Instance | undefined;
  let snapshot: Snapshot | undefined;

  beforeAll(async () => {
    const apiKey = process.env.MORPH_API_KEY;
    const baseUrl = process.env.MORPH_BASE_URL;

    if (!apiKey) {
      throw new Error("MORPH_API_KEY environment variable must be set.");
    }

    client = new MorphCloudClient({ apiKey, baseUrl, verbose: true });
    console.log("Created MorphCloud client"); //

    const images = await client.images.list(); //
    if (images.length === 0) {
      throw new Error("No images available.");
    }
    baseImageId =
      images.find((img) => img.id.toLowerCase().includes("ubuntu"))?.id ||
      images[0].id; //
    console.log(`Using base image: ${baseImageId}`); //
  }, 30000);

  beforeEach(async () => {
    console.log("Creating snapshot for test..."); //
    snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1, //
      memory: 512, //
      diskSize: 8192, //
    });
    console.log(`Created snapshot: ${snapshot.id}`); //

    console.log(`Starting instance from snapshot ${snapshot.id}`); //
    instance = await client.instances.start({ snapshotId: snapshot.id }); //
    console.log(`Created instance: ${instance.id}`); //

    console.log(`Waiting for instance ${instance.id} to be ready`); //
    await instance.waitUntilReady(300); // 300 seconds timeout
    console.log(`Instance ${instance.id} is ready`); //
  }, 300000); // Increased timeout for beforeEach to 5 minutes

  afterEach(async () => {
    if (instance) {
      try {
        console.log(`Stopping instance ${instance.id}`); //
        await instance.stop(); //
        console.log(`Instance ${instance.id} stopped`); //
      } catch (e) {
        console.error(`Error stopping instance ${instance.id}:`, e); //
      }
    }
    if (snapshot) {
      try {
        console.log(`Deleting snapshot ${snapshot.id}`); //
        await snapshot.delete(); //
        console.log(`Snapshot ${snapshot.id} deleted`); //
      } catch (e) {
        console.error(`Error deleting snapshot ${snapshot.id}:`, e); //
      }
    }
  }, 60000); // Increased timeout for afterEach to 1 minute

  test("should perform basic file operations", async () => {
    if (!instance) throw new Error("Instance not available"); //

    const testFile = `/tmp/test-${uuidv4()}.txt`; //
    const testContent = `test-content-${uuidv4()}`; //

    console.log(`Writing test file: ${testFile}`); //
    const writeResult = await instance.exec(
      `echo '${testContent}' > ${testFile}`,
    ); //
    expect(writeResult.exitCode).toBe(0); //

    console.log(`Reading test file: ${testFile}`); //
    const readResult = await instance.exec(`cat ${testFile}`); //
    expect(readResult.exitCode).toBe(0); //
    expect(readResult.stdout).toContain(testContent); //

    const appendText = `additional-content-${uuidv4()}`; //
    console.log(`Appending to test file: ${testFile}`); //
    const appendResult = await instance.exec(
      `echo '${appendText}' >> ${testFile}`,
    ); //
    expect(appendResult.exitCode).toBe(0); //

    console.log(`Verifying appended content in: ${testFile}`); //
    const readResult2 = await instance.exec(`cat ${testFile}`); //
    expect(readResult2.exitCode).toBe(0); //
    expect(readResult2.stdout).toContain(testContent); //
    expect(readResult2.stdout).toContain(appendText); //

    console.log("Basic file operations completed successfully"); //
  }, 60000); // 1 minute timeout for the test

  test("should test file permissions", async () => {
    if (!instance) throw new Error("Instance not available"); //

    const testFile = `/tmp/test-perms-${uuidv4()}.txt`; //
    const testContent = `test-content-${uuidv4()}`; //

    console.log(`Creating test file: ${testFile}`); //
    const writeResult = await instance.exec(
      `echo '${testContent}' > ${testFile}`,
    ); //
    expect(writeResult.exitCode).toBe(0); //

    console.log(`Checking default permissions on: ${testFile}`); //
    const permsResult = await instance.exec(`ls -l ${testFile}`); //
    expect(permsResult.exitCode).toBe(0); //
    // Default permissions might vary slightly, but should typically include read/write for owner
    expect(permsResult.stdout).toMatch(/-rw-r--r--/); // Adjust this regex if default umask is different

    console.log(`Changing permissions on: ${testFile}`); //
    const chmodResult = await instance.exec(`chmod 600 ${testFile}`); //
    expect(chmodResult.exitCode).toBe(0); //

    console.log(`Verifying new permissions on: ${testFile}`); //
    const newPermsResult = await instance.exec(`ls -l ${testFile}`); //
    expect(newPermsResult.exitCode).toBe(0); //
    expect(newPermsResult.stdout).toContain("-rw-------"); //

    console.log("File permissions test completed successfully"); //
  }, 60000); // 1 minute timeout for the test

  test("should perform directory operations", async () => {
    if (!instance) throw new Error("Instance not available"); //

    const testDir = `/tmp/test-dir-${uuidv4()}`; //

    console.log(`Creating test directory: ${testDir}`); //
    const mkdirResult = await instance.exec(`mkdir -p ${testDir}`); //
    expect(mkdirResult.exitCode).toBe(0); //

    console.log(`Verifying directory exists: ${testDir}`); //
    const lsResult = await instance.exec(`ls -ld ${testDir}`); //
    expect(lsResult.exitCode).toBe(0); //
    expect(lsResult.stdout).toContain("d"); //

    const file1 = `${testDir}/file1.txt`; //
    const file2 = `${testDir}/file2.txt`; //

    console.log(`Creating files in directory: ${file1}, ${file2}`); //
    await instance.exec(`echo 'content1' > ${file1}`); //
    await instance.exec(`echo 'content2' > ${file2}`); //

    console.log(`Listing files in directory: ${testDir}`); //
    const lsDirResult = await instance.exec(`ls -la ${testDir}`); //
    expect(lsDirResult.exitCode).toBe(0); //
    expect(lsDirResult.stdout).toContain("file1.txt"); //
    expect(lsDirResult.stdout).toContain("file2.txt"); //

    console.log(`Removing directory: ${testDir}`); //
    const rmResult = await instance.exec(`rm -rf ${testDir}`); //
    expect(rmResult.exitCode).toBe(0); //

    console.log(`Verifying directory is gone: ${testDir}`); //
    const lsGoneResult = await instance.exec(
      `ls -ld ${testDir} 2>&1 || echo 'Not found'`,
    ); //
    expect(lsGoneResult.stdout + lsGoneResult.stderr).toContain("Not found"); //

    console.log("Directory operations test completed successfully"); //
  }, 60000); // 1 minute timeout for the test
});
