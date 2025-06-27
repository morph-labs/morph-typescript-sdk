/**
 * Unit tests for SSH key functionality - testing method existence and types
 */

import { MorphCloudClient, Instance, InstanceSshKey } from "../../src/api";

// Mock the HTTP client methods
const mockGET = jest.fn();
const mockPOST = jest.fn();

// Create a mock client
const mockClient = {
  GET: mockGET,
  POST: mockPOST,
  instances: {
    get: jest.fn()
  }
} as any;

// Create a mock instance
function createMockInstance(): Instance {
  const instanceData = {
    id: "test-instance-123",
    object: "instance",
    created: Date.now(),
    status: "ready",
    spec: {
      vcpus: 1,
      memory: 512,
      disk_size: 1024
    },
    refs: {
      snapshot_id: "test-snapshot",
      image_id: "test-image"
    },
    networking: {
      internal_ip: "10.0.0.1",
      http_services: []
    }
  };
  
  return new Instance(instanceData, mockClient);
}

describe("SSH Key Methods", () => {
  let instance: Instance;

  beforeEach(() => {
    jest.clearAllMocks();
    instance = createMockInstance();
  });

  describe("sshKey method", () => {
    it("should exist and be callable", () => {
      expect(typeof instance.sshKey).toBe("function");
    });

    it("should call the correct API endpoint", async () => {
      const mockResponse: InstanceSshKey = {
        object: "instance_ssh_key",
        private_key: "test-private-key",
        public_key: "test-public-key",
        password: "test-password"
      };

      mockGET.mockResolvedValue(mockResponse);

      const result = await instance.sshKey();

      expect(mockGET).toHaveBeenCalledWith("/instance/test-instance-123/ssh/key");
      expect(result).toEqual(mockResponse);
    });
  });

  describe("sshKeyRotate method", () => {
    it("should exist and be callable", () => {
      expect(typeof instance.sshKeyRotate).toBe("function");
    });

    it("should call the correct API endpoint", async () => {
      const mockResponse: InstanceSshKey = {
        object: "instance_ssh_key",
        private_key: "new-private-key",
        public_key: "new-public-key", 
        password: "new-password"
      };

      mockPOST.mockResolvedValue(mockResponse);

      const result = await instance.sshKeyRotate();

      expect(mockPOST).toHaveBeenCalledWith("/instance/test-instance-123/ssh/key");
      expect(result).toEqual(mockResponse);
    });
  });

  describe("InstanceSshKey interface", () => {
    it("should have correct type structure", () => {
      const sshKey: InstanceSshKey = {
        object: "instance_ssh_key",
        private_key: "test-private-key",
        public_key: "test-public-key",
        password: "test-password"
      };

      expect(sshKey.object).toBe("instance_ssh_key");
      expect(typeof sshKey.private_key).toBe("string");
      expect(typeof sshKey.public_key).toBe("string");
      expect(typeof sshKey.password).toBe("string");
    });
  });
});