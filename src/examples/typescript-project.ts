import { MorphCloudClient } from "../api";

// Initialize the client
const client = new MorphCloudClient({
  apiKey: "your API key",
});

(async () => {
  // Create a snapshot with minimal resources
  const snapshot = await client.snapshots.create({
    vcpus: 1,
    memory: 1024,
    diskSize: 2048,
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

  // Install Node.js
  await ssh.execCommand(
    "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash",
  );
  await ssh.execCommand("sudo -s");
  await ssh.execCommand("nvm install 22");
  await ssh.execCommand("npm install express");

  // Expose the HTTP service
  const service = await instance.exposeHttpService("web", 3000);

  // Branch from base environment
  const branches = await instance.branch(3);

  // Make changes in each branch
  branches.instances.forEach(async (branch) => {
    console.log(`Created branch ${branch.id}`);
    await branch.waitUntilReady(10);
    const ssh = await branch.ssh();
    await ssh.execCommand(`
            echo 'const express = require("express");
            const app = express();
            const port = 3000;

            app.get("/", (req, res) => {
            res.send("Hello World From ${branch.id}");
            });

            app.listen(port);' > index.js
        `);
    ssh.execCommand("node index.js");
    console.log(`${branch.networking.httpServices[0].url}`);
  });
})();
