// TypeScript/Bun style import
import { MorphCloudClient } from '../dist/index.mjs';

console.log('Testing Bun import:');
console.log(typeof MorphCloudClient === 'function' 
  ? '✅ MorphCloudClient imported successfully with Bun' 
  : '❌ Failed to import MorphCloudClient with Bun');

// Create an instance (without API key) just to test initialization
try {
  const client = new MorphCloudClient({ apiKey: 'test-key' });
  console.log('✅ Successfully created MorphCloudClient instance');
} catch (error) {
  console.error('❌ Failed to create MorphCloudClient instance:', error);
}
