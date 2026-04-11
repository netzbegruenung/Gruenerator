export * from './client.js';
// contractsClient is NOT re-exported here to avoid forcing all consumers
// to resolve @gruenerator/contracts + @ts-rest/core at build time.
// Import directly: import { getContractsClient } from '@gruenerator/shared/src/api/contractsClient'
