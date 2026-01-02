import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });

const region = process.env.AWS_REGION;
const profile = process.env.AWS_PROFILE;

if (!region) {
  console.warn('[AWS Bedrock Client] AWS_REGION environment variable not set. Bedrock client might not work correctly.');
}
if (!profile) {
  console.warn('[AWS Bedrock Client] AWS_PROFILE environment variable not set. Ensure AWS credentials can be found (e.g., via SSO config, IAM Role).');
}

const bedrockClient = new BedrockRuntimeClient({
  region: region,
});

console.log(`[AWS Bedrock Client] Initialized for region: ${region || 'default'}. Profile: ${profile || 'default/env/role'}.`);

export default bedrockClient;
