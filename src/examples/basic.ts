import { MorphCloudClient } from "../api";

// Initialize the client
const client = new MorphCloudClient({
  apiKey: "your API key",
});

(async () => {
  // Create a snapshot with minimal resources
  const snapshot = await client.snapshots.create({
    vcpus: 1,
    memory: 128,
    diskSize: 700,
    imageId: "morphvm-minimal",
  });

  // Start an instance from the snapshot
  const instance = await client.instances.start({
    snapshotId: snapshot.id,
  });

  // Wait for instance to be ready
  await instance.waitUntilReady(10);

  // Connect via SSH
  const ssh = await instance.ssh();

  // Run a simple command
  const result = await ssh.execCommand("echo Hello, World!");
  console.log(result.stdout);
})();
