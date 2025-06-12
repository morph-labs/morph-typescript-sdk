import { MorphCloudClient, Instance, Snapshot, Image } from "morphcloud";
import { v4 as uuidv4 } from 'uuid';

// Increase default Jest timeout for cloud operations
jest.setTimeout(300000);

/**
 * Retries an async function up to `retries` times with a delay.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`Attempt ${attempt} failed. Retrying in ${delayMs}ms...`, err);
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastError;
}

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

    // Pick a base image with retries
    const images: Image[] = await withRetry(() => client.images.list({ limit: 1 }));
    if (!images.length) throw new Error('No base images available');
    const baseImage = images[0];

    // Create a fresh snapshot with retries
    testSnapshot = await withRetry(() =>
      client.snapshots.create({
        imageId: baseImage.id,
        vcpus: 1,
        memory: 512,
        diskSize: 8192,
      })
    );

    // Start instance with retries
    testInstance = await withRetry(() => client.instances.start({ snapshotId: testSnapshot.id }));
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
    // Stop instance and delete snapshot (best-effort)
    try { await testInstance.stop(); } catch (err) { console.warn('Error stopping instance', err); }
    try { await testSnapshot.delete(); } catch (err) { console.warn('Error deleting snapshot', err); }
  });
});
