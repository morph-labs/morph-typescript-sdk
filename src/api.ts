import { generateKeyPairSync } from "crypto";
import { NodeSSH } from "node-ssh";

const MORPH_BASE_URL = "https://cloud.morph.so/api";
const MORPH_SSH_HOSTNAME = "ssh.cloud.morph.so";
const MORPH_SSH_PORT = 22;

const SSH_TEMP_KEYPAIR = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs1',
        format: 'pem'
    }
});

enum SnapshotStatus {
    PENDING = "pending",
    READY = "ready",
    FAILED = "failed",
    DELETING = "deleting",
    DELETED = "deleted"
}

enum InstanceStatus {
    PENDING = "pending",
    READY = "ready",
    SAVING = "saving",
    ERROR = "error"
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
    apiKey: string;
    baseUrl?: string;
}

interface ImageListOptions {
}

interface SnapshotListOptions {
    digest?: string;
}

interface SnapshotCreateOptions {
    imageId?: string;
    vcpus?: number;
    memory?: number;
    diskSize?: number;
    digest?: string;
}

interface SnapshotGetOptions {
    snapshotId: string;
}

interface InstanceListOptions {
}

interface InstanceStartOptions {
    snapshotId: string;
}

interface InstanceGetOptions {
    instanceId: string;
}

interface InstanceStopOptions {
    instanceId: string;
}

class Image {
    readonly id: string;
    readonly object: 'image';
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
    readonly object: 'snapshot';
    readonly created: number;
    readonly status: SnapshotStatus;
    readonly spec: ResourceSpec;
    readonly refs: SnapshotRefs;
    readonly digest?: string;
    private client: MorphCloudClient;

    constructor(data: any, client: MorphCloudClient) {
        this.id = data.id;
        this.object = data.object;
        this.created = data.created;
        this.status = data.status;
        this.spec = {
            vcpus: data.spec.vcpus,
            memory: data.spec.memory,
            diskSize: data.spec.disk_size
        };
        this.refs = {
            imageId: data.refs.image_id
        };
        this.digest = data.digest;
        this.client = client;
    }

    async delete(): Promise<void> {
        await this.client.DELETE(`/snapshot/${this.id}`);
    }
}

class Instance {
    readonly id: string;
    readonly object: 'instance';
    readonly created: number;
    status: InstanceStatus;
    readonly spec: ResourceSpec;
    readonly refs: InstanceRefs;
    networking: InstanceNetworking;
    private client: MorphCloudClient;

    constructor(data: any, client: MorphCloudClient) {
        this.id = data.id;
        this.object = data.object;
        this.created = data.created;
        this.status = data.status;
        this.spec = {
            vcpus: data.spec.vcpus,
            memory: data.spec.memory,
            diskSize: data.spec.disk_size
        };
        this.refs = {
            snapshotId: data.refs.snapshot_id,
            imageId: data.refs.image_id
        };
        this.networking = {
            internalIp: data.networking.internal_ip,
            httpServices: data.networking.http_services
        };
        this.client = client;
    }

    async stop(): Promise<void> {
        await this.client.instances.stop({ instanceId: this.id });
    }

    async snapshot(): Promise<Snapshot> {
        const response = await this.client.POST(`/instance/${this.id}/snapshot`, {}, {});
        return new Snapshot(response, this.client);
    }

    async branch(count: number): Promise<{
        snapshot: Snapshot;
        instances: Instance[];
    }> {
        const response = await this.client.POST(`/instance/${this.id}/branch`, { count }, {});
        const snapshot = new Snapshot(response.snapshot, this.client);
        const instances = response.instances.map((i: any) => new Instance(i, this.client));
        return { snapshot, instances };
    }

    async exposeHttpService(name: string, port: number): Promise<InstanceHttpService> {
        await this.client.POST(`/instance/${this.id}/http`, {}, { name, port });
        await this.refresh();

        let service = this.networking.httpServices.find(service => service.name === name);
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
        const cmd = typeof command === 'string' ? [command] : command;
        const response = await this.client.POST(`/instance/${this.id}/exec`, {}, { command: cmd });
        return response;
    }

    async waitUntilReady(timeout?: number): Promise<void> {
        const startTime = Date.now();
        while (this.status !== InstanceStatus.READY) {
            if (timeout && Date.now() - startTime > timeout * 1000) {
                throw new Error("Instance did not become ready before timeout");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.refresh();
            if (this.status === InstanceStatus.ERROR) {
                throw new Error("Instance encountered an error");
            }
        }
    }

    async ssh(): Promise<NodeSSH> {
        const ssh = new NodeSSH();
        return await ssh.connect({
            host: MORPH_SSH_HOSTNAME,
            port: MORPH_SSH_PORT,
            username: `${this.id}:${this.client.apiKey}`,
            privateKey: SSH_TEMP_KEYPAIR.privateKey
        })
    };

    private async refresh(): Promise<void> {
        const instance = await this.client.instances.get({ instanceId: this.id });
        Object.assign(this, instance);
    }
}

export class MorphCloudClient {
    readonly baseUrl: string;
    readonly apiKey: string;

    constructor({ apiKey, baseUrl = MORPH_BASE_URL }: MorphCloudClientOptions) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    private async request(method: string, endpoint: string, query?: any, data?: any) {
        let uri = new URL(this.baseUrl + endpoint);
        if (query) {
            uri.search = new URLSearchParams(query).toString()
        }
        const response = await fetch(uri, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: data ? JSON.stringify(data) : undefined
        });

        if (!response.ok) {
            let errorBody;
            try {
                errorBody = await response.json();
            } catch {
                errorBody = await response.text();
            }
            throw new Error(`HTTP Error ${response.status} for url '${response.url}'\nResponse Body: ${JSON.stringify(errorBody, null, 2)}`);
        }
        try {
            return await response.json();
        }
        catch (error) {
            return {};
        }
    }

    async GET(endpoint: string, query?: string) {
        return this.request('GET', endpoint, query);
    }

    async POST(endpoint: string, query?: any, data?: any) {
        return this.request('POST', endpoint, query, data);
    }

    async DELETE(endpoint: string, query?: any) {
        await this.request('DELETE', endpoint, query);
    }

    images = {
        list: async (options: ImageListOptions = {}): Promise<Image[]> => {
            const response = await this.GET('/image');
            return response.data.map((image: any) => new Image(image, this));
        }
    };

    snapshots = {
        list: async (options: SnapshotListOptions = {}): Promise<Snapshot[]> => {
            const params = options.digest ? `?digest=${options.digest}` : '';
            const response = await this.GET(`/snapshot${params}`);
            return response.data.map((snapshot: any) => new Snapshot(snapshot, this));
        },

        create: async (options: SnapshotCreateOptions = {}): Promise<Snapshot> => {
            const data = {
                image_id: options.imageId,
                vcpus: options.vcpus,
                memory: options.memory,
                disk_size: options.diskSize,
                digest: options.digest,
                readiness_check: { type: 'timeout', timeout: 10.0 }
            };
            const response = await this.POST('/snapshot', {}, data);
            return new Snapshot(response, this);
        },

        get: async (options: SnapshotGetOptions): Promise<Snapshot> => {
            const response = await this.GET(`/snapshot/${options.snapshotId}`);
            return new Snapshot(response, this);
        }
    };

    instances = {
        list: async (options: InstanceListOptions = {}): Promise<Instance[]> => {
            const response = await this.GET('/instance');
            return response.data.map((instance: any) => new Instance(instance, this));
        },

        start: async (options: InstanceStartOptions): Promise<Instance> => {
            const response = await this.POST('/instance', {
                snapshot_id: options.snapshotId
            });
            return new Instance(response, this);
        },

        get: async (options: InstanceGetOptions): Promise<Instance> => {
            const response = await this.GET(`/instance/${options.instanceId}`);
            return new Instance(response, this);
        },

        stop: async (options: InstanceStopOptions): Promise<void> => {
            await this.DELETE(`/instance/${options.instanceId}`);
        }
    };
}