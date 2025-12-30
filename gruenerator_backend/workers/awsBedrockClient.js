const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
require('dotenv').config({ quiet: true });

const region = process.env.AWS_REGION;
const profile = process.env.AWS_PROFILE; // Will be used automatically if set

if (!region) {
  console.warn('[AWS Bedrock Client] AWS_REGION environment variable not set. Bedrock client might not work correctly.');
}
if (!profile) {
    // Profile is not strictly required if other credential methods are available (e.g., IAM Role in deployment),
    // but we log a warning for local development where AWS_PROFILE is expected.
    console.warn('[AWS Bedrock Client] AWS_PROFILE environment variable not set. Ensure AWS credentials can be found (e.g., via SSO config, IAM Role).');
}


// The SDK automatically uses credentials from the environment or shared config/credentials files.
// If AWS_PROFILE is set, it will use that profile from ~/.aws/config.
// In production/deployment, IAM roles are preferred and used automatically.
const bedrockClient = new BedrockRuntimeClient({
  region: region,
  // Credentials are automatically sourced based on standard AWS SDK practices.
});

console.log(`[AWS Bedrock Client] Initialized for region: ${region || 'default'}. Profile: ${profile || 'default/env/role'}.`);

module.exports = bedrockClient; 