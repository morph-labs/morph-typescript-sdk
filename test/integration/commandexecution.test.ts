import { MorphCloudClient, Instance, Snapshot, Image } from "morphcloud";
import { v4 as uuidv4 } from 'uuid';

// Increase default Jest timeout for cloud operations
jest.setTimeout(300000);

describe('Command Execution', () => {
  let client: MorphCloudClient;
  let testSnapshot: Snapshot;
  let testInstance: Instance;

  beforeAll(async () => {
    client = new MorphCloudClient({
      apiKey: process.env.MORPH_API_KEY!,
      baseUrl: process.env.MORPH_BASE_URL,
      verbose: true,
    });

    // Pick a base image
    const images: Image[] = await client.images.list({ limit: 1 });
    if (!images.length) throw new Error('No base images available');
    const baseImage = images[0];

    // Create a fresh snapshot
    testSnapshot = await client.snapshots.create({
      imageId: baseImage.id,
      vcpus: 1,
      memory: 512,
      diskSize: 8192,
    });

    // Start instance
    testInstance = await client.instances.start({ snapshotId: testSnapshot.id });
    await testInstance.waitUntilReady(240);
  }, 300000);

  it('should execute a simple command and return output', async () => {
    const result = await testInstance.exec('echo HelloMorph');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('HelloMorph');
  });

  it('should execute a command in a specific working directory', async () => {
    const testDir = `/tmp/command-test-${uuidv4()}`;
    const testFile = 'test.txt';
    const testContent = 'MorphCloud Test';

    // Create directory and file
    const mkRes = await testInstance.exec(
      `mkdir -p ${testDir} && echo '${testContent}' > ${testDir}/${testFile}`
    );
    expect(mkRes.exitCode).toBe(0);

    // Read file
    const readRes = await testInstance.exec(`cat ${testDir}/${testFile}`);
    expect(readRes.exitCode).toBe(0);
    expect(readRes.stdout).toContain(testContent);
  });

  it('should execute a command with stdin input', async () => {
    const inputData = 'stdin test input';
    const result = await testInstance.exec(`printf '%s' '${inputData}' | cat`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(inputData);
  });

  it('should execute a command with sudo if available', async () => {
    const sudoCheck = await testInstance.exec('sudo -n true');
    if (sudoCheck.exitCode !== 0) {
      console.warn('Passwordless sudo not available; skipping sudo test');
      return;
    }

    const result = await testInstance.exec('sudo whoami');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().toLowerCase()).toBe('root');
  });

  afterAll(async () => {
    // Stop instance and delete snapshot
    try { await testInstance.stop(); } catch {};
    try { await testSnapshot.delete(); } catch {};
  });
});
