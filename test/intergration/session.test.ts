// test_session.ts
import { MorphCloudClient, Instance, Snapshot } from "morphcloud";
import { v4 as uuidv4 } from "uuid";

describe("MorphCloud Session-Scoped Tests", () => {
  let client: MorphCloudClient;
  let baseImageId: string;
  let sessionSnapshot: Snapshot; // This will be our shared snapshot
  let sessionInstance: Instance; // This will be our shared instance

  // Helper to create a test file on the instance
  const createTestFileOnInstance = async (
    instance: Instance,
    fileName: string,
    content: string,
  ) => {
    const filePath = `/tmp/${fileName}`;
    const writeResult = await instance.exec(`echo '${content}' > ${filePath}`);
    if (writeResult.exitCode !== 0) {
      throw new Error(
        `Failed to create test file ${filePath}: ${writeResult.stderr}`,
      );
    }
    return { path: filePath, content: content };
  };

  beforeAll(async () => {
    const apiKey = process.env.MORPH_API_KEY;
    const baseUrl = process.env.MORPH_BASE_URL;

    if (!apiKey) {
      throw new Error("MORPH_API_KEY environment variable must be set.");
    }

    client = new MorphCloudClient({ apiKey, baseUrl, verbose: true });
    console.log("Created MorphCloud client");

    const images = await client.images.list();
    if (images.length === 0) {
      throw new Error("No images available.");
    }
    baseImageId =
      images.find((img) => img.id.toLowerCase().includes("ubuntu"))?.id ||
      images[0].id;
    console.log(`Using base image: ${baseImageId}`);

    // Create a session-scoped snapshot and instance
    console.log("Creating session-scoped snapshot...");
    sessionSnapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });
    console.log(`Created session snapshot: ${sessionSnapshot.id}`);

    console.log(
      `Starting session-scoped instance from snapshot ${sessionSnapshot.id}`,
    );
    sessionInstance = await client.instances.start({
      snapshotId: sessionSnapshot.id,
    });
    console.log(`Created session instance: ${sessionInstance.id}`);

    console.log(
      `Waiting for session instance ${sessionInstance.id} to be ready`,
    );
    await sessionInstance.waitUntilReady(300); // 300 seconds timeout
    console.log(`Session instance ${sessionInstance.id} is ready`);
  }, 300000); // Increased timeout for beforeAll (5 minutes)

  afterAll(async () => {
    console.log("Running session cleanup (afterAll)");
    if (sessionInstance) {
      try {
        console.log(`Stopping session instance ${sessionInstance.id}`);
        await sessionInstance.stop();
        console.log(`Session instance ${sessionInstance.id} stopped`);
      } catch (e: any) {
        if (e.message && !e.message.includes("HTTP Error 404")) {
          console.error(
            `Error stopping session instance ${sessionInstance.id}:`,
            e,
          );
        } else {
          console.warn(
            `Session instance ${sessionInstance.id} not found during stop (might have been deleted already).`,
          );
        }
      }
    }
    if (sessionSnapshot) {
      try {
        console.log(`Deleting session snapshot ${sessionSnapshot.id}`);
        await sessionSnapshot.delete();
        console.log(`Session snapshot ${sessionSnapshot.id} deleted`);
      } catch (e: any) {
        if (e.message && !e.message.includes("HTTP Error 404")) {
          console.error(
            `Error deleting session snapshot ${sessionSnapshot.id}:`,
            e,
          );
        } else {
          console.warn(
            `Session snapshot ${sessionSnapshot.id} not found during delete (might have been deleted already).`,
          );
        }
      }
    }
    console.log("Session cleanup complete");
  }, 60000); // Increased timeout for afterAll

  test("should execute a command on the shared instance", async () => {
    console.log(`Testing command execution on instance ${sessionInstance.id}`);

    // Execute a simple command
    const result = await sessionInstance.exec("echo 'hello world'");

    // Verify command output
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello world");

    console.log(`Command executed successfully: ${result.stdout}`);
  }, 30000); // 30 seconds timeout

  test("should perform file operations on the shared instance", async () => {
    const testFileName = `session-test-file-${uuidv4()}.txt`;
    const testFileContent = `initial-content-${uuidv4()}`;

    const fileInfo = await createTestFileOnInstance(
      sessionInstance,
      testFileName,
      testFileContent,
    );
    console.log(`Testing file operations on ${fileInfo.path}`);

    // Read the file content
    const result = await sessionInstance.exec(`cat ${fileInfo.path}`);

    // Verify file content
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toContain(fileInfo.content);

    // Append to the file
    const appendText = `additional-content-${uuidv4()}`;
    const appendResult = await sessionInstance.exec(
      `echo '${appendText}' >> ${fileInfo.path}`,
    );
    expect(appendResult.exitCode).toBe(0);

    // Verify appended content
    const readResult = await sessionInstance.exec(`cat ${fileInfo.path}`);
    expect(readResult.exitCode).toBe(0);
    expect(readResult.stdout.trim()).toContain(fileInfo.content);
    expect(readResult.stdout.trim()).toContain(appendText);

    console.log("File operations completed successfully");
  }, 60000); // 1 minute timeout

  test("should set and retrieve instance metadata", async () => {
    const testKey = `test-key-${uuidv4()}`;
    const testValue = `test-value-${uuidv4()}`;
    const testMetadata = { [testKey]: testValue };

    console.log(`Setting metadata on instance ${sessionInstance.id}`);
    await sessionInstance.setMetadata(testMetadata);

    // Verify metadata was set
    // Need to refresh instance to get latest metadata from API
    const updatedInstance = await client.instances.get({
      instanceId: sessionInstance.id,
    });
    expect(updatedInstance.metadata?.[testKey]).toBe(testValue);

    // List instances by metadata and verify our instance is found
    console.log(
      `Listing instances with metadata filter: ${testKey}=${testValue}`,
    );
    const filterMetadata = { [testKey]: testValue };
    const instances = await client.instances.list({ metadata: filterMetadata });

    // Verify instance is in the filtered list
    const found = instances.some((i) => i.id === sessionInstance.id);
    expect(found).toBe(true);

    console.log("Metadata operations completed successfully");
  }, 60000); // 1 minute timeout
});
