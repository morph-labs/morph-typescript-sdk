// ESM style import
import { MorphCloudClient } from '../dist/index.mjs';

console.log('Testing ESM import:');
console.log(typeof MorphCloudClient === 'function' 
  ? '✅ MorphCloudClient imported successfully with ESM' 
  : '❌ Failed to import MorphCloudClient with ESM');

// Create an instance (without API key) just to test initialization
try {
  const client = new MorphCloudClient({ apiKey: 'test-key' });
  console.log('✅ Successfully created MorphCloudClient instance');
} catch (error) {
  console.error('❌ Failed to create MorphCloudClient instance:', error);
}
