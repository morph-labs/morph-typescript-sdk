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

  // Set up a simple HTTP server
  ssh.execCommand("python3 -m http.server 8000");

  // Expose the HTTP service
  const service = await instance.exposeHttpService("web", 8000);

  // Give python a moment to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test connecting to the HTTP services
  let url = service.url;
  let res = await fetch(url);
  console.log(`${url}: ${res.status}`);
})();
