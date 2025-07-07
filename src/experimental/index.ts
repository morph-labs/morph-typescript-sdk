import { MorphCloudClient, Snapshot as BaseSnapshot, Instance } from "../api.js";
import { createHash } from "crypto";
import { NodeSSH } from "node-ssh";
import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";

// Types
type InvalidateFn = (snapshot: Snapshot) => boolean;
type StreamTuple = ["stdout", string] | ["stderr", string] | ["exit_code", number];

interface LoggingSystem {
  addSystemPanel(title: string, body: string): void;
  addPanel(content: string): void;
  refresh(): void;
  console: SimpleConsole;
  lock: any;
  pause(): { [Symbol.dispose](): void };
  startLive(): { [Symbol.dispose](): void };
}

interface SimpleConsole {
  print(message: string): void;
  clear(): void;
}

interface VerificationPanel {
  update(fnName: string, status: string): void;
  panel: string;
}

// Logging System Implementation
class LoggingSystemImpl implements LoggingSystem {
  private _lock = {};

  addSystemPanel(title: string, body: string): void {
    console.log(`${title}: ${body}`);
  }

  addPanel(content: string): void {
    console.log(content);
  }

  refresh(): void {
    // No-op for logging compatibility
  }

  get console(): SimpleConsole {
    return new SimpleConsoleImpl();
  }

  get lock(): any {
    return this._lock;
  }

  pause(): { [Symbol.dispose](): void } {
    return {
      [Symbol.dispose](): void {
        // No-op for compatibility
      }
    };
  }

  startLive(): { [Symbol.dispose](): void } {
    return {
      [Symbol.dispose](): void {
        // No-op for compatibility  
      }
    };
  }
}

class SimpleConsoleImpl implements SimpleConsole {
  print(message: string): void {
    console.log(message);
  }

  clear(): void {
    // No-op for logging compatibility
  }
}

class VerificationPanelImpl implements VerificationPanel {
  private _statuses: Record<string, string> = {};

  constructor(verifyFuncs: Array<(instance: Instance) => Promise<void>>) {
    this._statuses = Object.fromEntries(
      verifyFuncs.map(fn => [fn.name, "⏳ running"])
    );
    console.log("🔍 Verify: Starting verification", { 
      verify_funcs: verifyFuncs.map(f => f.name) 
    });
  }

  update(fnName: string, status: string): void {
    this._statuses[fnName] = status;
    console.log(`🔍 Verify: ${fnName} - ${status}`);

    // Check overall status
    const statuses = Object.values(this._statuses);
    if (statuses.every(s => s.startsWith("✅"))) {
      console.log("🔍 Verify: All verifications passed");
    } else if (statuses.some(s => s.startsWith("❌"))) {
      console.error("🔍 Verify: Some verifications failed");
    }
  }

  get panel(): string {
    return `Verification status: ${JSON.stringify(this._statuses)}`;
  }
}

// Global renderer instance
const renderer: LoggingSystem = new LoggingSystemImpl();

// Stream processing utilities
const STREAM_MAX_LINES = 24;
const ELLIPSIS = "⋯ [output truncated] ⋯\n";

type Line = [string, string | null];

function appendStreamChunk(
  buf: Line[],
  chunk: string,
  style: string | null = null,
  maxLines: number = STREAM_MAX_LINES
): void {
  // Split new data into logical lines (keep newlines)
  const lines = chunk.split(/\r?\n/);
  lines.forEach(ln => {
    if (ln.length > 0) {
      buf.push([ln + '\n', style]);
      // Log each line immediately
      if (style === "error") {
        console.error(`STDERR: ${ln}`);
      } else {
        console.log(`STDOUT: ${ln}`);
      }
    }
  });

  // Trim old lines
  while (buf.length > maxLines) {
    buf.shift();
  }

  if (buf.length === maxLines) {
    console.log(ELLIPSIS.trim());
  }
}

// SSH streaming utilities
async function* sshStream(
  ssh: NodeSSH,
  command: string,
  encoding: string = "utf-8",
  chunkSize: number = 4096,
  poll: number = 0.01
): AsyncGenerator<StreamTuple, void, unknown> {
  const result = await ssh.execCommand(command, {
    onStdout: (chunk) => {
      // This will be handled by the generator
    },
    onStderr: (chunk) => {
      // This will be handled by the generator  
    }
  });

  // Yield stdout if available
  if (result.stdout) {
    yield ["stdout", result.stdout];
  }

  // Yield stderr if available
  if (result.stderr) {
    yield ["stderr", result.stderr];
  }

  // Yield exit code
  yield ["exit_code", result.code || 0];
}

async function instanceExec(
  instance: Instance,
  command: string,
  onStdout: (txt: string) => void,
  onStderr: (txt: string) => void
): Promise<number> {
  const ssh = await instance.ssh();
  
  try {
    for await (const msg of sshStream(ssh, command)) {
      switch (msg[0]) {
        case "stdout":
          onStdout(msg[1]);
          break;
        case "stderr":
          onStderr(msg[1]);
          break;
        case "exit_code":
          return msg[1];
      }
    }
  } finally {
    ssh.dispose();
  }
  
  throw new Error("SSH stream did not yield exit code.");
}

// Main Snapshot class
export class Snapshot {
  private snapshot: BaseSnapshot;
  private client: MorphCloudClient;

  constructor(snapshot: BaseSnapshot) {
    this.snapshot = snapshot;
    this.client = new MorphCloudClient(); // We'll need to pass this properly
  }

  get id(): string {
    return this.snapshot.id;
  }

  static async create(
    name: string,
    imageId: string = "morphvm-minimal",
    vcpus: number = 1,
    memory: number = 4096,
    diskSize: number = 8192,
    invalidate: InvalidateFn | boolean = false
  ): Promise<Snapshot> {
    console.log("🖼  Snapshot.create()", {
      image_id: imageId,
      vcpus,
      memory,
      disk_size: diskSize,
      snapshot_name: name
    });

    const client = new MorphCloudClient();
    
    if (invalidate) {
      const invalidateFn = typeof invalidate === 'function' 
        ? invalidate 
        : () => invalidate;
      
      const snaps = await client.snapshots.list({ digest: name });
      for (const s of snaps) {
        if (invalidateFn(new Snapshot(s))) {
          await s.delete();
        }
      }
    }

    const snap = await client.snapshots.create({
      imageId,
      vcpus,
      memory,
      diskSize,
      digest: name,
      metadata: { name }
    });

    return new Snapshot(snap);
  }

  static async fromSnapshotId(snapshotId: string): Promise<Snapshot> {
    console.log("🔍 Snapshot.fromSnapshotId()", { snapshot_id: snapshotId });
    const client = new MorphCloudClient();
    const snap = await client.snapshots.get({ snapshotId });
    return new Snapshot(snap);
  }

  static async fromTag(tag: string): Promise<Snapshot | null> {
    console.log("🏷️  Snapshot.fromTag()", { tag });
    const client = new MorphCloudClient();
    const snapshots = await client.snapshots.list({ metadata: { tag } });
    if (snapshots.length === 0) {
      return null;
    }
    // Return the most recent snapshot
    return new Snapshot(snapshots[0]);
  }

  async start(
    metadata?: Record<string, string>,
    ttlSeconds?: number,
    ttlAction?: "stop" | "pause"
  ): Promise<Instance> {
    // Merge default metadata with provided metadata
    const defaultMetadata = { root: this.snapshot.id };
    const finalMetadata = metadata ? { ...defaultMetadata, ...metadata } : defaultMetadata;

    return await this.client.instances.start({
      snapshotId: this.snapshot.id,
      metadata: finalMetadata,
      ttlSeconds,
      ttlAction
    });
  }

  async boot(
    vcpus?: number,
    memory?: number,
    diskSize?: number
  ): Promise<{ instance: Instance; cleanup: () => Promise<void> }> {
    console.log("🔄 Snapshot.boot()", {
      vcpus: vcpus || this.snapshot.spec.vcpus,
      memory: memory || this.snapshot.spec.memory,
      disk_size: diskSize || this.snapshot.spec.diskSize
    });

    // Start instance with specified resources
    const instance = await this.start();
    
    return {
      instance,
      cleanup: async () => {
        await instance.stop();
      }
    };
  }

  keyToDigest(key: string): string {
    return (this.snapshot.digest || "") + this.snapshot.id + key;
  }

  async apply(
    func: (instance: Instance) => Promise<Instance | void>,
    key?: string,
    startFn?: () => Promise<Instance> | Promise<{ instance: Instance; cleanup: () => Promise<void> }>,
    invalidate: InvalidateFn | boolean = false
  ): Promise<Snapshot> {
    const invalidateFn = typeof invalidate === 'function' 
      ? invalidate 
      : () => invalidate;

    if (key) {
      const digest = this.keyToDigest(key);
      const snaps = await this.client.snapshots.list({ digest });
      
      if (invalidate) {
        const valid = [];
        for (const s of snaps) {
          if (invalidateFn(new Snapshot(s))) {
            await s.delete();
          } else {
            valid.push(s);
          }
        }
        if (valid.length > 0) {
          return new Snapshot(valid[0]);
        }
      } else if (snaps.length > 0) {
        return new Snapshot(snaps[0]);
      }
    }

    let instance: Instance;
    let cleanup: (() => Promise<void>) | undefined;
    
    if (startFn) {
      const result = await startFn();
      if (result && typeof result === 'object' && 'instance' in result && 'cleanup' in result) {
        // Handle boot result with cleanup
        const bootResult = result as { instance: Instance; cleanup: () => Promise<void> };
        instance = bootResult.instance;
        cleanup = bootResult.cleanup;
      } else {
        instance = result as Instance;
      }
    } else {
      instance = await this.start();
    }

    try {
      const res = await func(instance);
      const finalInstance = res || instance;
      
      const newSnap = await finalInstance.snapshot({ 
        digest: key ? this.keyToDigest(key) : undefined 
      });
      
      return new Snapshot(newSnap);
    } finally {
      if (cleanup) {
        await cleanup();
      } else if (!startFn) {
        await instance.stop();
      }
    }
  }

  async run(command: string, invalidate: InvalidateFn | boolean = false): Promise<Snapshot> {
    console.log("🚀 Snapshot.run()", { command });

    const execute = async (instance: Instance): Promise<void> => {
      console.log("🖥  Snapshot.run() - Starting command execution", { command });
      
      const buf: Line[] = [];
      const _out = (c: string) => appendStreamChunk(buf, c);
      const _err = (c: string) => appendStreamChunk(buf, c, "error");

      const exitCode = await instanceExec(instance, command, _out, _err);
      console.log("🖥  Snapshot.run() - Command completed", { command, exit_code: exitCode });

      if (exitCode !== 0) {
        // Get the last few lines from buffer for error context
        const recentOutput = buf.slice(-5).map(([line]) => line).join('');
        throw new Error(`Command execution failed: ${command} exit=${exitCode} recent_output=${recentOutput}`);
      }
    };

    return await this.apply(execute, command, undefined, invalidate);
  }

  async copy(
    src: string,
    dest: string,
    invalidate: InvalidateFn | boolean = false
  ): Promise<Snapshot> {
    console.log("📁 Snapshot.copy()", { src, dest });

    const executeCopy = async (instance: Instance): Promise<void> => {
      console.log("📋 File Copy Progress - Starting copy operation");

      const updateProgress = (message: string, style?: string) => {
        if (style === "error") {
          console.error(`Copy Progress: ${message}`);
        } else {
          console.log(`Copy Progress: ${message}`);
        }
      };

      try {
        // Use the instance's sync method which handles file copying
        await instance.sync(src, `${instance.id}:${dest}`, { verbose: true });
        updateProgress("✅ Copy completed successfully");
      } catch (error) {
        updateProgress(`❌ Copy failed: ${error}`, "error");
        throw error;
      }
    };

    return await this.apply(executeCopy, `copy-${src}-${dest}`, undefined, invalidate);
  }

  async do(
    instructions: string,
    verify?: ((instance: Instance) => Promise<void>) | ((instance: Instance) => Promise<void>)[],
    invalidate: InvalidateFn | boolean = false
  ): Promise<Snapshot> {
    const verifyFuncs = Array.isArray(verify) ? verify : (verify ? [verify] : []);
    const digest = this.keyToDigest(
      instructions + "," + verifyFuncs.map(v => v.name).join(",")
    );

    console.log("🔍 Snapshot.do() - Starting verification", {
      instructions,
      verify_funcs: verifyFuncs.map(v => v.name)
    });

    const snapsExist = await this.client.snapshots.list({ digest });
    if (snapsExist.length > 0 && !invalidate) {
      console.log("💾 Cached ✅ - Using existing snapshot");
      return new Snapshot(snapsExist[0]);
    }

    const verifier = async (inst: Instance): Promise<boolean> => {
      if (verifyFuncs.length === 0) {
        return true;
      }

      const vpanel = new VerificationPanelImpl(verifyFuncs);
      let allOk = true;
      const verificationErrors: string[] = [];

      for (const func of verifyFuncs) {
        try {
          await func(inst);
          vpanel.update(func.name, "✅ passed");
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          vpanel.update(func.name, `❌ failed (${errorMsg})`);
          verificationErrors.push(`${func.name}: ${errorMsg}`);
          allOk = false;
        }
      }

      if (verificationErrors.length > 0) {
        console.error("Verification errors", { errors: verificationErrors });
      }

      return allOk;
    };

    const runVerification = async (instance: Instance): Promise<void> => {
      console.log("🔍 Starting verification", { instructions });
      const success = await verifier(instance);
      if (!success) {
        throw new Error("Verification failed.");
      }
    };

    const newSnap = await this.apply(runVerification, digest, undefined, invalidate);
    console.log("🔍 Verification completed successfully");
    return newSnap;
  }

  async resize(
    vcpus?: number,
    memory?: number,
    diskSize?: number,
    invalidate: boolean = false
  ): Promise<Snapshot> {
    console.log("🔧 Snapshot.resize()", {
      vcpus: vcpus || this.snapshot.spec.vcpus,
      memory: memory || this.snapshot.spec.memory,
      disk_size: diskSize || this.snapshot.spec.diskSize
    });

    const bootSnapshot = async () => {
      return await this.boot(vcpus, memory, diskSize);
    };

    return await this.apply(
      async (x: Instance) => x,
      `resize-${vcpus}-${memory}-${diskSize}`,
      bootSnapshot,
      invalidate
    );
  }

  async deploy(
    name: string,
    port: number,
    minReplicas: number = 0,
    maxReplicas: number = 3
  ): Promise<{ instance: Instance; url: string; cleanup: () => Promise<void> }> {
    console.log("🌐 Snapshot.deploy()", {
      service_name: name,
      port,
      min_replicas: minReplicas,
      max_replicas: maxReplicas
    });

    const instance = await this.start();
    const service = await instance.exposeHttpService(name, port);
    console.log(`Started service at ${service.url}`);
    
    return {
      instance,
      url: service.url,
      cleanup: async () => {
        await instance.stop();
      }
    };
  }

  async tag(tag: string): Promise<void> {
    console.log("🏷  Snapshot.tag()", { tag });
    const meta = { ...this.snapshot.metadata, tag };
    await this.snapshot.setMetadata(meta);
    console.log("Snapshot tagged successfully!");
  }

  static prettyBuild(): LoggingSystem {
    return renderer;
  }
}

// Export the client for compatibility
export const client = new MorphCloudClient();

// Re-export browser functionality
export { MorphBrowser, BrowserSession, SessionManager } from './browser.js';