/**
 * Batch archive generator — runs all system agents once to populate briefing archives.
 * Run: npx tsx apps/api/services/briefing/generate-archives.ts
 */

import 'dotenv/config';

import { execute } from './BriefingExecutionService.js';
import { loadSystemAgents } from './SystemAgentLoader.js';

async function main() {
  const agents = loadSystemAgents();
  console.log(`Found ${agents.length} system agents\n`);

  for (const agent of agents) {
    console.log(`Running: ${agent.name} (${agent.id})...`);
    try {
      await execute(agent.id);
      console.log(`  Done.\n`);
    } catch (error) {
      console.error(`  Failed: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  console.log('Archive generation complete.');
  process.exit(0);
}

main().catch(console.error);
