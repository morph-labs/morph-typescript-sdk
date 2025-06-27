# SSH Key Rotation Feature

## Overview

This feature adds SSH key rotation capabilities to the Morph TypeScript SDK, bringing it into parity with the Python SDK. SSH key rotation allows you to securely update SSH keys for active instances without interrupting service.

## New Methods

### `instance.rotateSSHKey(options: SSHKeyRotationOptions)`

Rotates the SSH keys for an instance.

#### Parameters

- `options.publicKey` (string): The new public key in PEM format
- `options.privateKey` (string): The new private key in PEM format  
- `options.validateConnection` (boolean, optional): Whether to validate the connection after rotation (default: false)
- `options.timeout` (number, optional): Timeout in seconds for the rotation operation (default: 30)
- `options.removeOldKeys` (boolean, optional): Whether to remove old keys after successful rotation (default: false)
- `options.auditLog` (boolean, optional): Whether to log the rotation for security auditing (default: false)

#### Returns

Returns a `SSHKeyRotationResult` object with:

- `success` (boolean): Whether the rotation was successful
- `keyFingerprint` (string): MD5 fingerprint of the new key
- `rotatedAt` (Date): Timestamp of when the rotation occurred
- `validationPassed` (boolean, optional): Whether connection validation passed
- `oldKeysRemoved` (boolean, optional): Whether old keys were removed
- `auditLogged` (boolean, optional): Whether the rotation was logged

## Usage Examples

### Basic SSH Key Rotation

\`\`\`typescript
import { MorphCloudClient } from 'morphcloud';
import { generateKeyPairSync } from 'crypto';

const client = new MorphCloudClient({ apiKey: 'your-api-key' });
const instance = await client.instances.get({ instanceId: 'your-instance-id' });

// Generate new key pair
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

// Rotate SSH keys
const result = await instance.rotateSSHKey({
  publicKey: keyPair.publicKey,
  privateKey: keyPair.privateKey
});

console.log('Rotation successful:', result.success);
console.log('Key fingerprint:', result.keyFingerprint);
\`\`\`

### SSH Key Rotation with Validation

\`\`\`typescript
const result = await instance.rotateSSHKey({
  publicKey: keyPair.publicKey,
  privateKey: keyPair.privateKey,
  validateConnection: true,
  timeout: 60
});

if (result.success && result.validationPassed) {
  console.log('SSH key rotation and validation successful!');
} else {
  console.error('SSH key rotation failed validation');
}
\`\`\`

### Secure SSH Key Rotation with Cleanup

\`\`\`typescript
const result = await instance.rotateSSHKey({
  publicKey: keyPair.publicKey,
  privateKey: keyPair.privateKey,
  validateConnection: true,
  removeOldKeys: true,
  auditLog: true,
  timeout: 45
});

console.log('Old keys removed:', result.oldKeysRemoved);
console.log('Audit logged:', result.auditLogged);
\`\`\`

## Security Considerations

1. **Key Format**: Only PEM format keys are accepted for security and compatibility
2. **Key Strength**: Use at least 2048-bit RSA keys for adequate security
3. **Validation**: Always use `validateConnection: true` in production to ensure the rotation was successful
4. **Cleanup**: Use `removeOldKeys: true` to prevent old keys from remaining on the system
5. **Auditing**: Use `auditLog: true` for security compliance and monitoring

## Error Handling

The method throws errors for:
- Invalid key formats
- Network connectivity issues
- API errors
- Validation failures (when `validateConnection: true`)

\`\`\`typescript
try {
  const result = await instance.rotateSSHKey({
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    validateConnection: true
  });
} catch (error) {
  console.error('SSH key rotation failed:', error.message);
}
\`\`\`

## Integration Tests

The feature includes comprehensive integration tests covering:
- Basic SSH key rotation
- Rotation with validation
- Error handling for invalid keys
- Security best practices
- Connection validation after rotation

Run the tests with your test framework of choice that supports the existing test structure.

## Implementation Notes

- The implementation follows the existing SDK patterns for consistency
- Key fingerprints are generated using MD5 for compatibility
- The method integrates with the existing SSH connection infrastructure
- Timeouts and error handling are implemented for robustness

## Compatibility

This feature maintains backward compatibility with existing SSH functionality while adding the new rotation capabilities. Existing code will continue to work without changes.