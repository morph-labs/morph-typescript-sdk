import { MorphCloudClient, Instance, Snapshot, type Image } from "morphcloud";
import { v4 as uuidv4 } from 'uuid'; // Use npm install uuid @types/uuid

// =================================================================
// Test Configuration & Setup
// =================================================================

// Configure Jest to have a longer timeout for async operations
jest.setTimeout(360000); // 6 minutes

describe('Instance Metadata Operations', () => {
    let client: MorphCloudClient;
    let baseImage: Image;
    let snapshot: Snapshot | null = null;
    let instance: Instance | null = null;

    // beforeAll is equivalent to pytest's setup fixtures that run once per module.
    beforeAll(async () => {
        const apiKey = process.env.MORPH_API_KEY;
        const baseUrl = process.env.MORPH_BASE_URL;

        if (!apiKey) {
            throw new Error('MORPH_API_KEY environment variable must be set');
        }

        // Initialize the MorphCloudClient
        client = new MorphCloudClient({
            apiKey: apiKey,
            baseUrl: baseUrl,
            verbose: true,
        });
        console.log('Created MorphCloud client');

        // Get a base image to use for tests, similar to the `base_image` fixture
        const images = await client.images.list();
        if (images.length === 0) {
            throw new Error('No images available for testing');
        }

        // Prefer an Ubuntu image, otherwise fall back to the first one
        baseImage = images.find(img => img.id.toLowerCase().includes('ubuntu')) || images[0];
        console.log(`Using base image: ${baseImage.id}`);
    });

    // afterAll ensures that we clean up resources even if tests fail.
    // This is equivalent to the `finally` block in the Python test.
    afterAll(async () => {
        console.log('Cleaning up resources...');
        try {
            if (instance) {
                console.log(`Stopping instance ${instance.id}`);
                await instance.stop();
                console.log('Instance stopped.');
            }
        } catch (error) {
            console.error(`Error stopping instance: ${error}`);
        }

        try {
            if (snapshot) {
                console.log(`Deleting snapshot ${snapshot.id}`);
                await snapshot.delete();
                console.log('Snapshot deleted.');
            }
        } catch (error) {
            console.error(`Error deleting snapshot: ${error}`);
        }
    });

    // 'it' defines an individual test case, similar to a 'test_*' function in pytest.
    it('should correctly set, update, and filter instance metadata', async () => {
        console.log('Starting test: test_instance_metadata');

        // 1. Create a Snapshot
        // Corresponds to: await client.snapshots.acreate(...)
        console.log('Creating snapshot...');
        snapshot = await client.snapshots.create({
            imageId: baseImage.id,
            vcpus: 1,
            memory: 512,
            diskSize: 8192,
        });
        console.log(`Created snapshot: ${snapshot.id}`);
        expect(snapshot).toBeDefined();

        // 2. Start an Instance from the Snapshot
        // Corresponds to: await client.instances.astart(...)
        console.log('Starting instance...');
        instance = await client.instances.start({
            snapshotId: snapshot.id,
        });
        console.log(`Created instance: ${instance.id}`);
        expect(instance).toBeDefined();

        // 3. Wait for the Instance to be ready
        // Corresponds to: await instance.await_until_ready(...)
        console.log(`Waiting for instance ${instance.id} to be ready...`);
        await instance.waitUntilReady(300); // 300-second timeout
        console.log(`Instance ${instance.id} is ready.`);
        expect(instance.status).toBe('ready');

        // 4. Set initial metadata
        // Corresponds to: await instance.aset_metadata(...)
        const testKey = `test-key-${uuidv4()}`;
        const testValue = `test-value-${uuidv4()}`;
        const testMetadata = { [testKey]: testValue };

        console.log(`Setting metadata: ${JSON.stringify(testMetadata)}`);
        await instance.setMetadata(testMetadata);
        
        // After setting metadata, the instance object in the SDK is refreshed.
        // We can now check its metadata property.
        console.log('Verifying initial metadata...');
        expect(instance.metadata).toBeDefined();
        expect(instance.metadata?.[testKey]).toBe(testValue);
        
        // 5. List instances and filter by the new metadata
        // Corresponds to: await client.instances.alist(metadata=...)
        console.log(`Filtering instances by metadata: ${JSON.stringify(testMetadata)}`);
        const filteredInstances = await client.instances.list({ metadata: testMetadata });
        
        // Verify that our instance is in the filtered list
        const isInstanceFound = filteredInstances.some(i => i.id === instance?.id);
        expect(isInstanceFound).toBe(true);
        console.log('Instance found in filtered list.');

        // 6. Update metadata value
        const updatedValue = `updated-value-${uuidv4()}`;
        console.log(`Updating metadata value to: ${updatedValue}`);
        await instance.setMetadata({ [testKey]: updatedValue });

        // Verify the metadata was updated
        console.log('Verifying updated metadata...');
        expect(instance.metadata?.[testKey]).toBe(updatedValue);
        
        // 7. Set multiple metadata values at once
        const multiMetadata = {
            [`key1-${uuidv4()}`]: `value1-${uuidv4()}`,
            [`key2-${uuidv4()}`]: `value2-${uuidv4()}`
        };

        // FIX: The setMetadata method overwrites, not merges. To add new keys
        // while preserving old ones, we combine them on the client-side first.
        const combinedMetadata = { ...instance.metadata, ...multiMetadata };
        
        console.log(`Setting multiple metadata values: ${JSON.stringify(combinedMetadata)}`);
        await instance.setMetadata(combinedMetadata);


        // Verify all new metadata values are present
        console.log('Verifying multiple metadata...');
        for (const [key, value] of Object.entries(multiMetadata)) {
            expect(instance.metadata?.[key]).toBe(value);
        }

        // Also ensure the original, updated key is still there
        expect(instance.metadata?.[testKey]).toBe(updatedValue);
        console.log('Instance metadata operations completed successfully.');
    });
});
