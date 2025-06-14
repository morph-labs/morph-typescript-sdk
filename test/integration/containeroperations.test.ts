// Test file corresponding to test_as_container.py
// Container/Docker operations testing

import { MorphCloudClient, Instance, Snapshot } from "morphcloud";

jest.setTimeout(10 * 60 * 1000); // Container operations can take up to 10 minutes

describe("🐳 Container Operations Integration (TS)", () => {
  const client = new MorphCloudClient({ apiKey: process.env.MORPH_API_KEY! });
  let baseImageId: string;
  const instancesToCleanup: string[] = [];
  const snapshotsToCleanup: string[] = [];

  beforeAll(async () => {
    const images = await client.images.list();
    if (images.length === 0) {
      throw new Error("No images available.");
    }
    baseImageId =
      images.find((img) => img.id.toLowerCase().includes("ubuntu"))?.id ||
      images[0].id;
    console.log(`Using base image: ${baseImageId}`);
  });

  afterAll(async () => {
    // Cleanup instances
    for (const id of instancesToCleanup) {
      try {
        const inst = await client.instances.get({ instanceId: id });
        await inst.stop();
      } catch {
        /* ignore errors on cleanup */
      }
    }
    // Cleanup snapshots
    for (const id of snapshotsToCleanup) {
      try {
        const snap = await client.snapshots.get({ snapshotId: id });
        await snap.delete();
      } catch {
        /* ignore */
      }
    }
  });

  test("should setup container with dockerfile", async () => {
    console.log("Testing as_container with Dockerfile");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 2,
      memory: 1024,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Simple Dockerfile for testing
    const dockerfile = `FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y python3 python3-pip curl git vim
RUN useradd -m -s /bin/bash testuser
USER testuser
WORKDIR /home/testuser`;

    // Configure as container
    await instance.asContainer({
      dockerfile: dockerfile,
      containerName: "test-dockerfile-container",
    });

    // Verify SSH redirection works
    const whoamiResult = await instance.exec("whoami");
    expect(whoamiResult.exit_code).toBe(0);
    expect(whoamiResult.stdout.trim()).toBe("testuser");

    const pwdResult = await instance.exec("pwd");
    expect(pwdResult.exit_code).toBe(0);
    expect(pwdResult.stdout.trim()).toBe("/home/testuser");

    // Test installed packages
    const pythonResult = await instance.exec("python3 --version");
    expect(pythonResult.exit_code).toBe(0);
    expect(pythonResult.stdout).toContain("Python 3");

    const gitResult = await instance.exec("git --version");
    expect(gitResult.exit_code).toBe(0);
    expect(gitResult.stdout).toContain("git version");
  });

  test("should setup container with existing image", async () => {
    console.log("Testing as_container with existing image");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 2,
      memory: 1024,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Use existing Python image
    await instance.asContainer({
      image: "python:3.11-slim",
      containerName: "test-python-container",
    });

    // Verify Python is available
    const pythonResult = await instance.exec("python --version");
    expect(pythonResult.exit_code).toBe(0);
    expect(pythonResult.stdout).toContain("Python 3.11");

    // Test Python functionality
    const codeResult = await instance.exec('python -c "print(2 + 2)"');
    expect(codeResult.exit_code).toBe(0);
    expect(codeResult.stdout.trim()).toBe("4");
  });

  test("should setup container with environment variables", async () => {
    console.log("Testing as_container with environment variables");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 2,
      memory: 1024,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    const dockerfile = `FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y python3
WORKDIR /app`;

    // Configure container with environment variables
    await instance.asContainer({
      dockerfile: dockerfile,
      containerName: "test-env-container",
      env: {
        TEST_VAR: "test_value",
        APP_ENV: "testing",
        DEBUG: "true",
      },
    });

    // Verify environment variables are set
    const testVarResult = await instance.exec("echo $TEST_VAR");
    expect(testVarResult.exit_code).toBe(0);
    expect(testVarResult.stdout.trim()).toBe("test_value");

    const appEnvResult = await instance.exec("echo $APP_ENV");
    expect(appEnvResult.exit_code).toBe(0);
    expect(appEnvResult.stdout.trim()).toBe("testing");

    const debugResult = await instance.exec("echo $DEBUG");
    expect(debugResult.exit_code).toBe(0);
    expect(debugResult.stdout.trim()).toBe("true");
  });

  test("should setup container with port mapping", async () => {
    console.log("Testing as_container with port mapping");

    // Create snapshot
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 2,
      memory: 1024,
      diskSize: 8192,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Create a simple server script
    const serverScript = `#!/usr/bin/env python3
import http.server
import socketserver

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server running on port {PORT}")
    httpd.serve_forever()`;

    // Create build context with server script
    await instance.exec("mkdir -p /tmp/build_context");
    await instance.exec(`cat > /tmp/build_context/server.py << 'EOF'
${serverScript}
EOF`);

    const dockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY server.py .
RUN chmod +x server.py
EXPOSE 8000
CMD ["python", "server.py"]`;

    // Configure container with port mapping
    await instance.asContainer({
      dockerfile: dockerfile,
      containerName: "test-port-container",
      buildContext: "/tmp/build_context",
      ports: { 8080: 8000 }, // Map host port 8080 to container port 8000
    });

    // Verify server script exists in container
    const scriptResult = await instance.exec("ls -la /app/server.py");
    expect(scriptResult.exit_code).toBe(0);
    expect(scriptResult.stdout).toContain("server.py");

    // Verify script is executable
    const permResult = await instance.exec("test -x /app/server.py && echo 'executable'");
    expect(permResult.exit_code).toBe(0);
    expect(permResult.stdout.trim()).toBe("executable");
  });

  test("should setup complex development container", async () => {
    console.log("Testing as_container with complex Dockerfile");

    // Create snapshot with more resources for complex setup
    const snapshot = await client.snapshots.create({
      imageId: baseImageId,
      vcpus: 4,
      memory: 4096,
      diskSize: 20000,
    });
    snapshotsToCleanup.push(snapshot.id);

    // Start instance
    const instance = await client.instances.start({
      snapshotId: snapshot.id,
    });
    instancesToCleanup.push(instance.id);
    await instance.waitUntilReady(300);

    // Complex Dockerfile with multiple tools
    const complexDockerfile = `FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION=18.17.0

# Install basic tools
RUN apt-get update && apt-get install -y \\
    curl git vim python3 python3-pip build-essential

# Install Node.js via NVM
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash \\
    && . $NVM_DIR/nvm.sh \\
    && nvm install $NODE_VERSION \\
    && nvm use $NODE_VERSION \\
    && nvm alias default $NODE_VERSION

# Make node available in PATH
ENV PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

# Create development user
RUN useradd -m -s /bin/bash developer
USER developer
WORKDIR /home/developer

# Create sample files
RUN echo "console.log('Hello from Node.js!');" > hello.js
RUN echo "print('Hello from Python!')" > hello.py`;

    // Configure complex container
    await instance.asContainer({
      dockerfile: complexDockerfile,
      containerName: "test-complex-container",
      env: {
        DEVELOPMENT: "true",
        NODE_ENV: "development",
      },
    });

    // Verify user context
    const userResult = await instance.exec("whoami");
    expect(userResult.exit_code).toBe(0);
    expect(userResult.stdout.trim()).toBe("developer");

    // Verify Node.js installation
    const nodeResult = await instance.exec("node --version");
    expect(nodeResult.exit_code).toBe(0);
    expect(nodeResult.stdout).toContain("v18.17.0");

    // Test Node.js functionality
    const nodeScriptResult = await instance.exec("node hello.js");
    expect(nodeScriptResult.exit_code).toBe(0);
    expect(nodeScriptResult.stdout.trim()).toBe("Hello from Node.js!");

    // Verify Python installation
    const pythonResult = await instance.exec("python3 hello.py");
    expect(pythonResult.exit_code).toBe(0);
    expect(pythonResult.stdout.trim()).toBe("Hello from Python!");

    // Verify environment variables
    const devEnvResult = await instance.exec("echo $DEVELOPMENT");
    expect(devEnvResult.exit_code).toBe(0);
    expect(devEnvResult.stdout.trim()).toBe("true");
  });
});