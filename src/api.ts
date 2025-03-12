import * as crypto from 'crypto';

import { generateKeyPairSync } from "crypto";
import { NodeSSH } from "node-ssh";

type FSPromisesModule = typeof import('fs/promises');
type PathModule = typeof import('path');

const MORPH_BASE_URL = "https://cloud.morph.so/api";
const MORPH_SSH_HOSTNAME = "ssh.cloud.morph.so";
const MORPH_SSH_PORT = 22;

const SSH_TEMP_KEYPAIR = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs1",
    format: "pem",
  },
});

enum SnapshotStatus {
  PENDING = "pending",
  READY = "ready",
  FAILED = "failed",
  DELETING = "deleting",
  DELETED = "deleted",
}

enum InstanceStatus {
  PENDING = "pending",
  READY = "ready",
  PAUSED = "paused",
  SAVING = "saving",
  ERROR = "error",
}

interface ResourceSpec {
  vcpus: number;
  memory: number;
  diskSize: number;
}

interface SnapshotRefs {
  imageId: string;
}

interface InstanceHttpService {
  name: string;
  port: number;
  url: string;
}

interface InstanceNetworking {
  internalIp?: string;
  httpServices: InstanceHttpService[];
}

interface InstanceRefs {
  snapshotId: string;
  imageId: string;
}

interface InstanceExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface MorphCloudClientOptions {
  apiKey?: string;
  baseUrl?: string;
  verbose?: boolean;
}

interface ImageListOptions {}

interface SnapshotListOptions {
  digest?: string;
  metadata?: Record<string, string>;
}

interface SnapshotCreateOptions {
  imageId?: string;
  vcpus?: number;
  memory?: number;
  diskSize?: number;
  digest?: string;
  metadata?: Record<string, string>;
}

interface SnapshotGetOptions {
  snapshotId: string;
}

interface InstanceListOptions {
  metadata?: Record<string, string>;
}

interface InstanceStartOptions {
  snapshotId: string;
}

interface InstanceSnapshotOptions {
  digest?: string;
  metadata?: Record<string, string>;
}

interface InstanceGetOptions {
  instanceId: string;
}

interface InstanceStopOptions {
  instanceId: string;
}

interface SyncOptions {
  delete?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  respectGitignore?: boolean;
}

interface SFTPError extends Error {
  code?: string | number;
}

class Image {
  readonly id: string;
  readonly object: "image";
  readonly name: string;
  readonly description?: string;
  readonly diskSize: number;
  readonly created: number;
  private client: MorphCloudClient;

  constructor(data: any, client: MorphCloudClient) {
    this.id = data.id;
    this.object = data.object;
    this.name = data.name;
    this.description = data.description;
    this.diskSize = data.disk_size;
    this.created = data.created;
    this.client = client;
  }
}

class Snapshot {
  readonly id: string;
  readonly object: "snapshot";
  readonly created: number;
  readonly status: SnapshotStatus;
  readonly spec: ResourceSpec;
  readonly refs: SnapshotRefs;
  readonly digest?: string;
  metadata?: Record<string, string>;
  private client: MorphCloudClient;

  constructor(data: any, client: MorphCloudClient) {
    this.id = data.id;
    this.object = data.object;
    this.created = data.created;
    this.status = data.status;
    this.spec = {
      vcpus: data.spec.vcpus,
      memory: data.spec.memory,
      diskSize: data.spec.disk_size,
    };
    this.refs = {
      imageId: data.refs.image_id,
    };
    this.digest = data.digest;

    if (data.metadata) {
      this.metadata = { ...data.metadata };
    } else {
      this.metadata = {};
    }

    this.client = client;
  }

  /**
   * Delete the snapshot
   */
  async delete(): Promise<void> {
    await this.client.DELETE(`/snapshot/${this.id}`);
  }

  /**
   * Computes a chain hash based on the parent's chain hash and an effect identifier.
   * The effect identifier is typically derived from the function name and its arguments.
   * @param parentChainHash The parent's chain hash
   * @param effectIdentifier A string identifier for the effect being applied
   * @returns A new hash that combines the parent hash and the effect
   */
  static computeChainHash(parentChainHash: string, effectIdentifier: string): string {
    const hasher = crypto.createHash('sha256');
    hasher.update(parentChainHash);
    hasher.update('\n');
    hasher.update(effectIdentifier);
    return hasher.digest('hex');
  }

  /**
   * Runs a command on an instance and streams the output
   * @param instance The instance to run the command on
   * @param command The command to run
   * @param background Whether to run in the background
   * @param getPty Whether to allocate a PTY
   */
  private async _runCommandEffect(
    instance: Instance,
    command: string,
    background: boolean = false,
    getPty: boolean = true
  ): Promise<void> {
    const ssh = await instance.ssh();

    try {
      // Execute the command and capture output
      const { stdout, stderr, code } = await ssh.execCommand(command, {
        cwd: '/',
        onStdout: (chunk) => {
          process.stdout.write(chunk.toString('utf8'));
        },
        onStderr: (chunk) => {
          process.stderr.write(chunk.toString('utf8'));
        },
        // Set up PTY if requested
        ...(getPty ? { pty: true } : {})
      });

      if (code !== 0 && code !== null) {
        console.warn(`⚠️ ERROR: Command (${command}) exited with code ${code}`);
        throw new Error(`Command exited with code ${code}`);
      }
    } catch (error) {
      console.error(`Error executing command: ${error}`);
      throw error;
    } finally {
      ssh.dispose();
    }
  }

  /**
   * Generic caching mechanism based on a "chain hash".
   * - Computes a unique hash from the parent's chain hash, the function name,
   *   and string representations of args and kwargs.
   * - If a snapshot already exists with that chain hash, returns it.
   * - Otherwise, starts an instance from this snapshot, applies the function,
   *   snapshots the instance, updates its metadata with the new chain hash,
   *   and returns the new snapshot.
   * 
   * @param fn The effect function to apply
   * @param args Arguments to pass to the effect function
   * @returns A new (or cached) Snapshot with the updated chain hash
   */
  private async _cacheEffect<T extends any[]>(
    fn: (instance: Instance, ...args: T) => Promise<void>,
    ...args: T
  ): Promise<Snapshot> {
    const metadata = this.metadata || {};
    const parentChainHash = this.digest || this.id;
    const effectIdentifier = fn.name + JSON.stringify(args);

    const newChainHash = Snapshot.computeChainHash(parentChainHash, effectIdentifier);

    const candidates = await this.client.snapshots.list({
      digest: newChainHash,
    });

    if (candidates.length > 0) {
      if (this.client.verbose) {
        console.log(`✅ [CACHED] ${args}`);
      }
      return candidates[0];
    }

    // 3) Otherwise, apply the effect on a fresh instance
    if (this.client.verbose) {
      console.log(`🚀 [RUN] ${args}`);
    }
    const instance = await this.client.instances.start({ snapshotId: this.id });

    try {
      await instance.waitUntilReady(300);
      await fn(instance, ...args);
      const newSnapshot = await instance.snapshot({ digest: newChainHash });

      return newSnapshot;
    } finally {
      await instance.stop();
    }
  }

  /**
   * Run a command (with getPty=true, in the foreground) on top of this snapshot.
   * Returns a new snapshot that includes the modifications from that command.
   * Uses _cacheEffect(...) to avoid rebuilding if an identical effect (command) was applied before.
   * 
   * @param command The shell command to run
   * @returns A new snapshot with the command applied
   */
  async setup(command: string): Promise<Snapshot> {
    return this._cacheEffect(
      async (instance: Instance, cmd: string, bg: boolean, pty: boolean) => {
        await this._runCommandEffect(instance, cmd, bg, pty);
      },
      command,
      false,
      true
    );
  }

  /**
   * Sets metadata for the snapshot
   * @param metadata Metadata key-value pairs to set
   */
  async setMetadata(metadata: Record<string, string>): Promise<void> {
    const metadataObj = metadata || {};

    // Send the update to the API
    await this.client.POST(`/snapshot/${this.id}/metadata`, {}, metadataObj);

    // Update the local metadata
    if (!this.metadata) {
      this.metadata = {};
    }

    Object.entries(metadataObj).forEach(([key, value]) => {
      this.metadata![key] = value;
    });
  }
}

class Instance {
  readonly id: string;
  readonly object: "instance";
  readonly created: number;
  status: InstanceStatus;
  readonly spec: ResourceSpec;
  readonly refs: InstanceRefs;
  networking: InstanceNetworking;
  readonly metadata?: Record<string, string>;
  private client: MorphCloudClient;

  constructor(data: any, client: MorphCloudClient) {
    this.id = data.id;
    this.object = data.object;
    this.created = data.created;
    this.status = data.status;
    this.spec = {
      vcpus: data.spec.vcpus,
      memory: data.spec.memory,
      diskSize: data.spec.disk_size,
    };
    this.refs = {
      snapshotId: data.refs.snapshot_id,
      imageId: data.refs.image_id,
    };
    this.networking = {
      internalIp: data.networking.internal_ip,
      httpServices: data.networking.http_services,
    };
    this.metadata = data.metadata;
    this.client = client;
  }

  async stop(): Promise<void> {
    await this.client.instances.stop({ instanceId: this.id });
  }

  async pause(): Promise<void> {
    await this.client.POST(`/instance/${this.id}/pause`);
    await this.refresh();
  }

  async resume(): Promise<void> {
    await this.client.POST(`/instance/${this.id}/resume`);
    await this.refresh();
  }

  async snapshot(options: InstanceSnapshotOptions = {}): Promise<Snapshot> {
    const digest = options.digest || undefined;
    const metadata = options.metadata || {};

    const response = await this.client.POST(
      `/instance/${this.id}/snapshot`,
      { digest },
      { metadata },
    );

    return new Snapshot(response, this.client);
  }

  async branch(count: number): Promise<{
    snapshot: Snapshot;
    instances: Instance[];
  }> {
    const response = await this.client.POST(
      `/instance/${this.id}/branch`,
      { count },
      {},
    );
    const snapshot = new Snapshot(response.snapshot, this.client);
    const instances = response.instances.map(
      (i: any) => new Instance(i, this.client),
    );
    return { snapshot, instances };
  }

  async exposeHttpService(
    name: string,
    port: number,
  ): Promise<InstanceHttpService> {
    await this.client.POST(`/instance/${this.id}/http`, {}, { name, port });
    await this.refresh();

    let service = this.networking.httpServices.find(
      (service) => service.name === name,
    );
    if (service === undefined) {
      throw new Error("Failed to expose HTTP service");
    }
    return service;
  }

  async hideHttpService(name: string): Promise<void> {
    await this.client.DELETE(`/instance/${this.id}/http/${name}`);
    await this.refresh();
  }

  async exec(command: string | string[]): Promise<InstanceExecResponse> {
    const cmd = typeof command === "string" ? [command] : command;
    const response = await this.client.POST(
      `/instance/${this.id}/exec`,
      {},
      { command: cmd },
    );
    return response;
  }

  async waitUntilReady(timeout?: number): Promise<void> {
    const startTime = Date.now();
    while (this.status !== InstanceStatus.READY) {
      if (timeout && Date.now() - startTime > timeout * 1000) {
        throw new Error("Instance did not become ready before timeout");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await this.refresh();
      if (this.status === InstanceStatus.ERROR) {
        throw new Error("Instance encountered an error");
      }
    }
  }

  async ssh(): Promise<NodeSSH> {
    const ssh = new NodeSSH();
    return await ssh.connect({
      host: process.env.MORPH_SSH_HOSTNAME || MORPH_SSH_HOSTNAME,
      port: process.env.MORPH_SSH_PORT ? parseInt(process.env.MORPH_SSH_PORT) : MORPH_SSH_PORT,
      username: `${this.id}:${this.client.apiKey}`,
      privateKey: SSH_TEMP_KEYPAIR.privateKey,
    });
  }

  async sync(
    source: string,
    dest: string,
    options: SyncOptions = {},
  ): Promise<void> {
    const ignore = require("ignore");

    const fs = await import("fs/promises");
    const path = await import("path");

    const log = (level: "info" | "debug" | "error", message: string) => {
      if (options.verbose || level === "error") {
        console.log(`[${level.toUpperCase()}] ${message}`);
      }
    };

    const getGitignore = async (dirPath: string): Promise<any> => {
      try {
        const gitignorePath = path.join(dirPath, ".gitignore");
        const content = await fs.readFile(gitignorePath, "utf8");
        return ignore().add(content);
      } catch (error) {
        return null;
      }
    };

    const shouldIgnore = (
      filePath: string,
      baseDir: string,
      ignoreRule: any,
    ): boolean => {
      if (!ignoreRule) return false;
      const relativePath = path.relative(baseDir, filePath);
      return ignoreRule.ignores(relativePath);
    };

    interface FileInfo {
      size: number;
      mtime: number;
    }

    const parseInstancePath = (path: string): [string | null, string] => {
      const match = path.match(/^([^:]+):(.+)$/);
      return match ? [match[1], match[2]] : [null, path];
    };

    const formatSize = (size: number): string => {
      const units = ["B", "KB", "MB", "GB"];
      let formatted = size;
      let unitIndex = 0;
      while (formatted >= 1024 && unitIndex < units.length - 1) {
        formatted /= 1024;
        unitIndex++;
      }
      return `${formatted.toFixed(1)}${units[unitIndex]}`;
    };

    // Get instance paths
    const [sourceInstance, sourceDirPath] = parseInstancePath(source);
    const [destInstance, destDirPath] = parseInstancePath(dest);

    // Validate paths
    if (
      (sourceInstance && destInstance) ||
      (!sourceInstance && !destInstance)
    ) {
      throw new Error(
        "One (and only one) path must be a remote path in the format instance_id:/path",
      );
    }

    // Validate instance ID matches
    const instanceId = sourceInstance || destInstance;
    if (instanceId !== this.id) {
      throw new Error(
        `Instance ID in path (${instanceId}) doesn't match this instance (${this.id})`,
      );
    }

    log("info", `Starting sync operation from ${source} to ${dest}`);
    log(
      "info",
      options.dryRun
        ? "[DRY RUN] "
        : "" + `Syncing ${sourceInstance ? "from" : "to"} remote...`,
    );

    // Connect SSH
    const ssh = await this.ssh();
    const sftp = await ssh.requestSFTP();

    // Promisify SFTP methods
    const promisifiedSftp = {
      list: (path: string): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          sftp.readdir(path, (err, list) => {
            if (err) reject(err);
            else resolve(list);
          });
        });
      },
      stat: (path: string): Promise<any> => {
        return new Promise((resolve, reject) => {
          sftp.stat(path, (err, stats) => {
            if (err) reject(err);
            else resolve(stats);
          });
        });
      },
      mkdir: (path: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          sftp.mkdir(path, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      fastPut: (src: string, dest: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          sftp.fastPut(src, dest, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      fastGet: (src: string, dest: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          sftp.fastGet(src, dest, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      utimes: (path: string, atime: number, mtime: number): Promise<void> => {
        return new Promise((resolve, reject) => {
          sftp.utimes(path, atime, mtime, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
      unlink: (path: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          sftp.unlink(path, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
    };

    try {
      const getRemoteFiles = async (
        dir: string,
      ): Promise<Map<string, FileInfo>> => {
        const files = new Map<string, FileInfo>();

        const readDir = async (currentDir: string) => {
          try {
            const list = await promisifiedSftp.list(currentDir);
            for (const item of list) {
              const fullPath = `${currentDir}/${item.filename}`;
              if (item.attrs.isDirectory()) {
                await readDir(fullPath);
              } else {
                files.set(fullPath, {
                  size: item.attrs.size,
                  mtime: item.attrs.mtime,
                });
              }
            }
          } catch (error) {
            const sftpError = error as SFTPError;
            if (sftpError.code !== "ENOENT") {
              throw error;
            }
          }
        };

        await readDir(dir);
        return files;
      };

      // Update getLocalFiles to use gitignore
      const getLocalFiles = async (dir: string): Promise<Map<string, FileInfo>> => {
        const fs = await import("fs/promises") as FSPromisesModule;
        const path = await import("path") as PathModule;
        const files = new Map<string, FileInfo>();

        const ignoreRule = options.respectGitignore
          ? await getGitignore(dir)
          : null;

        const readDir = async (currentDir: string) => {
          try {
            const items = await fs.readdir(currentDir, { withFileTypes: true });
            for (const item of items) {
              const fullPath = path.join(currentDir, item.name);

              // Skip if path matches gitignore patterns
              if (
                options.respectGitignore &&
                shouldIgnore(fullPath, dir, ignoreRule)
              ) {
                log("debug", `Ignoring file (gitignore): ${fullPath}`);
                continue;
              }

              if (item.isDirectory()) {
                await readDir(fullPath);
              } else {
                const stat = await fs.stat(fullPath);
                files.set(fullPath, {
                  size: stat.size,
                  mtime: stat.mtimeMs / 1000,
                });
              }
            }
          } catch (error) {
            const sftpError = error as SFTPError;
            if (sftpError.code !== "ENOENT") {
              throw error;
            }
          }
        };

        await readDir(dir);
        return files;
      };

      const mkdirRemote = async (dir: string) => {
        if (!dir || dir === "/") return;

        const parts = dir.split("/").filter(Boolean);
        let current = "";

        for (const part of parts) {
          current += "/" + part;
          try {
            await promisifiedSftp.stat(current);
          } catch (error) {
            const sftpError = error as SFTPError;
            const errorCode =
              typeof sftpError.code === "string"
                ? parseInt(sftpError.code)
                : sftpError.code;

            if (errorCode === 2) {
              // ENOENT
              try {
                await promisifiedSftp.mkdir(current);
                log("debug", `Created remote directory: ${current}`);
              } catch (mkdirError: unknown) {
                const err = mkdirError as SFTPError;
                const mkdirErrCode =
                  typeof err.code === "string" ? parseInt(err.code) : err.code;

                // Ignore if directory already exists or was created by another process
                if (mkdirErrCode === 4) {
                  // EEXIST
                  log("debug", `Directory already exists: ${current}`);
                } else {
                  throw mkdirError;
                }
              }
            } else {
              throw error;
            }
          }
        }
      };

      const syncToRemote = async (localDir: string, remoteDir: string) => {
        const fs = await import("fs/promises");
        const path = await import("path");

        await mkdirRemote(remoteDir);

        log("info", "Scanning directories...");
        const localFiles = await getLocalFiles(localDir);
        const remoteFiles = await getRemoteFiles(remoteDir);

        const changes: Array<{
          type: "copy" | "delete";
          source?: string;
          dest: string;
          size?: number;
        }> = [];
        const synced = new Set<string>();

        for (const [localPath, localInfo] of localFiles.entries()) {
          const relativePath = path.relative(localDir, localPath);
          const remotePath = `${remoteDir}/${relativePath}`.replace(/\\/g, "/");
          const remoteInfo = remoteFiles.get(remotePath);

          if (
            !remoteInfo ||
            remoteInfo.size !== localInfo.size ||
            Math.abs(remoteInfo.mtime - localInfo.mtime) >= 1
          ) {
            changes.push({
              type: "copy",
              source: localPath,
              dest: remotePath,
              size: localInfo.size,
            });
          }
          synced.add(remotePath);
        }

        if (options.delete) {
          for (const [remotePath] of remoteFiles) {
            if (!synced.has(remotePath)) {
              changes.push({
                type: "delete",
                dest: remotePath,
              });
            }
          }
        }

        log("info", "\nChanges to be made:");
        log(
          "info",
          `  Copy: ${changes.filter((c) => c.type === "copy").length} files (${formatSize(changes.reduce((sum, c) => sum + (c.size || 0), 0))})`,
        );
        if (options.delete) {
          log(
            "info",
            `  Delete: ${changes.filter((c) => c.type === "delete").length} files`,
          );
        }

        if (changes.length === 0) {
          log("info", "  No changes needed");
          return;
        }

        if (options.dryRun) {
          log("info", "\nDry run - no changes made");
          for (const change of changes) {
            if (change.type === "copy") {
              log(
                "info",
                `  Would copy: ${change.dest} (${formatSize(change.size!)})`,
              );
            } else {
              log("info", `  Would delete: ${change.dest}`);
            }
          }
          return;
        }

        // Execute changes
        for (const change of changes) {
          try {
            if (change.type === "copy") {
              const targetDir = path.dirname(change.dest);
              log("info", `Ensuring directory exists: ${targetDir}`);
              await mkdirRemote(targetDir);

              log("info", `Copying ${change.dest}`);
              await promisifiedSftp.fastPut(change.source!, change.dest);

              // Update mtime
              const stat = await fs.stat(change.source!);
              await promisifiedSftp.utimes(
                change.dest,
                stat.mtimeMs / 1000,
                stat.mtimeMs / 1000,
              );
            } else {
              log("info", `Deleting ${change.dest}`);
              await promisifiedSftp.unlink(change.dest).catch(() => {});
            }
          } catch (error) {
            const sftpError = error as SFTPError;
            log(
              "error",
              `Error processing ${change.dest}: ${sftpError.message} (code: ${sftpError.code})`,
            );
            throw error;
          }
        }
      };

      const syncFromRemote = async (remoteDir: string, localDir: string) => {
        const fs = await import("fs/promises");
        const path = await import("path");

        await fs.mkdir(localDir, { recursive: true });

        log("info", "Scanning directories...");
        const remoteFiles = await getRemoteFiles(remoteDir);
        const localFiles = await getLocalFiles(localDir);

        const changes: Array<{
          type: "copy" | "delete";
          source?: string;
          dest: string;
          size?: number;
        }> = [];
        const synced = new Set<string>();

        for (const [remotePath, remoteInfo] of remoteFiles.entries()) {
          const relativePath = path.relative(remoteDir, remotePath);
          const localPath = path.join(localDir, relativePath);
          const localInfo = localFiles.get(localPath);

          if (
            !localInfo ||
            localInfo.size !== remoteInfo.size ||
            Math.abs(localInfo.mtime - remoteInfo.mtime) >= 1
          ) {
            changes.push({
              type: "copy",
              source: remotePath,
              dest: localPath,
              size: remoteInfo.size,
            });
          }
          synced.add(localPath);
        }

        if (options.delete) {
          for (const [localPath] of localFiles) {
            if (!synced.has(localPath)) {
              changes.push({
                type: "delete",
                dest: localPath,
              });
            }
          }
        }

        log("info", "\nChanges to be made:");
        log(
          "info",
          `  Copy: ${changes.filter((c) => c.type === "copy").length} files (${formatSize(changes.reduce((sum, c) => sum + (c.size || 0), 0))})`,
        );
        if (options.delete) {
          log(
            "info",
            `  Delete: ${changes.filter((c) => c.type === "delete").length} files`,
          );
        }

        if (changes.length === 0) {
          log("info", "  No changes needed");
          return;
        }

        if (options.dryRun) {
          log("info", "\nDry run - no changes made");
          for (const change of changes) {
            if (change.type === "copy") {
              log(
                "info",
                `  Would copy: ${change.dest} (${formatSize(change.size!)})`,
              );
            } else {
              log("info", `  Would delete: ${change.dest}`);
            }
          }
          return;
        }

        for (const change of changes) {
          try {
            if (change.type === "copy") {
              log("info", `Copying ${change.dest}`);
              await fs.mkdir(path.dirname(change.dest), { recursive: true });
              await promisifiedSftp.fastGet(change.source!, change.dest);

              const stat = await promisifiedSftp.stat(change.source!);
              await fs.utimes(change.dest, stat.mtime, stat.mtime);
            } else {
              log("info", `Deleting ${change.dest}`);
              try {
                await fs.unlink(change.dest);
              } catch (error) {
                // Ignore errors if file doesn't exist
              }
            }
          } catch (error) {
            const err = error as Error;
            log("error", `Error processing ${change.dest}: ${err.message}`);
            throw error;
          }
        }
      };

      if (sourceInstance) {
        await syncFromRemote(sourceDirPath, destDirPath);
      } else {
        await syncToRemote(sourceDirPath, destDirPath);
      }
    } finally {
      ssh.dispose();
    }
  }

  private async refresh(): Promise<void> {
    const instance = await this.client.instances.get({ instanceId: this.id });
    Object.assign(this, instance);
  }
}

class MorphCloudClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly verbose: boolean;

  constructor(options: MorphCloudClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.MORPH_API_KEY || "";
    this.baseUrl = options.baseUrl || MORPH_BASE_URL;
    this.verbose = options.verbose || false;
  }

  private async request(
    method: string,
    endpoint: string,
    query?: any,
    data?: any,
  ) {
    let uri = new URL(this.baseUrl + endpoint);
    if (query) {
      uri.search = new URLSearchParams(query).toString();
    }
    const response = await fetch(uri, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new Error(
        `HTTP Error ${response.status} for url '${response.url}'\nResponse Body: ${JSON.stringify(errorBody, null, 2)}`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  async GET(endpoint: string, query?: string) {
    return this.request("GET", endpoint, query);
  }

  async POST(endpoint: string, query?: any, data?: any) {
    return this.request("POST", endpoint, query, data);
  }

  async DELETE(endpoint: string, query?: any) {
    await this.request("DELETE", endpoint, query);
  }

  images = {
    list: async (options: ImageListOptions = {}): Promise<Image[]> => {
      const response = await this.GET("/image");
      return response.data.map((image: any) => new Image(image, this));
    },
  };

  snapshots = {
    list: async (options: SnapshotListOptions = {}): Promise<Snapshot[]> => {
      // safely build query string
      const { digest, metadata } = options;
      const queryParams = new URLSearchParams();

      // Add digest if provided
      if (digest) {
        queryParams.append('digest', digest);
      }

      // Add metadata in stripe style format: metadata[key]=value
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          queryParams.append(`metadata[${key}]`, String(value));
        });
      }

      // Build the final query string
      const params = queryParams.toString() ? `?${queryParams.toString()}` : '';

      const response = await this.GET(`/snapshot${params}`);
      return response.data.map((snapshot: any) => new Snapshot(snapshot, this));
    },

    create: async (options: SnapshotCreateOptions = {}): Promise<Snapshot> => {
      // Convert Map to object if needed
      let metadata = options.metadata;
      if (metadata instanceof Map) {
        metadata = Object.fromEntries(metadata.entries());
      }

      const create_digest = (options: SnapshotCreateOptions) => {
        const hasher = crypto.createHash("sha256");
        hasher.update(options.imageId || "");
        hasher.update(String(options.vcpus));
        hasher.update(String(options.memory));
        hasher.update(String(options.diskSize));
        // Sort metadata keys to ensure consistent hash
        if (metadata) {
          Object.keys(metadata).sort().forEach((key) => {
            hasher.update(key);
            hasher.update(metadata[key]);
          });
        }
        return hasher.digest("hex");
      }

      const digest = options.digest || create_digest(options);

      const data = {
        image_id: options.imageId,
        vcpus: options.vcpus,
        memory: options.memory,
        disk_size: options.diskSize,
        digest: options.digest,
        readiness_check: { type: "timeout", timeout: 10.0 },
        metadata: metadata || {},
      };
      const response = await this.POST("/snapshot", {}, data);
      return new Snapshot(response, this);
    },

    get: async (options: SnapshotGetOptions): Promise<Snapshot> => {
      const response = await this.GET(`/snapshot/${options.snapshotId}`);
      return new Snapshot(response, this);
    },
  };

  instances = {
    list: async (options: InstanceListOptions = {}): Promise<Instance[]> => {
      const { metadata } = options;
      const queryParams = new URLSearchParams();

      // Add metadata in stripe style format: metadata[key]=value
      if (metadata && typeof metadata === 'object') {
        Object.entries(metadata).forEach(([key, value]) => {
          queryParams.append(`metadata[${key}]`, String(value));
        });
      }

      // Build the final query string
      const params = queryParams.toString() ? `?${queryParams.toString()}` : '';
      const response = await this.GET(`/instance${params}`);
      return response.data.map((instance: any) => new Instance(instance, this));
    },

    start: async (options: InstanceStartOptions): Promise<Instance> => {
      const response = await this.POST("/instance", {
        snapshot_id: options.snapshotId,
      });
      return new Instance(response, this);
    },

    get: async (options: InstanceGetOptions): Promise<Instance> => {
      const response = await this.GET(`/instance/${options.instanceId}`);
      return new Instance(response, this);
    },

    stop: async (options: InstanceStopOptions): Promise<void> => {
      await this.DELETE(`/instance/${options.instanceId}`);
    },
  };
}

export { MorphCloudClient };
export { InstanceStatus, SnapshotStatus };
export type {
  MorphCloudClientOptions,
  ResourceSpec,
  SnapshotRefs,
  InstanceHttpService,
  InstanceNetworking,
  InstanceRefs,
  InstanceExecResponse,
};
