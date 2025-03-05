// CommonJS style import
const { MorphCloudClient } = require('../dist/index.cjs');

console.log('Testing CommonJS import:');
console.log(typeof MorphCloudClient === 'function' 
  ? '✅ MorphCloudClient imported successfully with CommonJS' 
  : '❌ Failed to import MorphCloudClient with CommonJS');

// Create an instance (without API key) just to test initialization
try {
  const client = new MorphCloudClient({ apiKey: 'test-key' });
  console.log('✅ Successfully created MorphCloudClient instance');
} catch (error) {
  console.error('❌ Failed to create MorphCloudClient instance:', error);
}
