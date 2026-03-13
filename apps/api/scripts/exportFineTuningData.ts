#!/usr/bin/env npx tsx
/**
 * Fine-Tuning Data Export Script
 *
 * Exports social media examples from Qdrant and generates synthetic prompts
 * using LiteLLM to create training data for Mistral fine-tuning.
 *
 * Usage:
 *   npx tsx scripts/exportFineTuningData.ts [options]
 *
 * Options:
 *   --dry-run       Show stats without generating prompts
 *   --limit N       Limit number of examples (default: all)
 *   --output FILE   Output file path (default: fine_tuning_data.jsonl)
 *   --platform P    Filter by platform (instagram, facebook, pressemitteilung)
 */

import { writeFileSync, appendFileSync, existsSync, unlinkSync } from 'fs';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_BASIC_AUTH_USERNAME = process.env.QDRANT_BASIC_AUTH_USERNAME;
const QDRANT_BASIC_AUTH_PASSWORD = process.env.QDRANT_BASIC_AUTH_PASSWORD;

const LITELLM_URL = 'https://litellm.netzbegruenung.verdigado.net';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY;

const COLLECTIONS = {
  content: 'content_examples',
  social: 'social_media_examples',
};

// Model for generating synthetic prompts
const PROMPT_GEN_MODEL = 'mistral/mistral-small-latest';

// ============================================================================
// Types
// ============================================================================

interface Example {
  id: string | number;
  content: string;
  platform?: string;
  type?: string;
  title?: string;
  country?: string;
  categories?: string[];
  tags?: string[];
}

interface FineTuningPair {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

interface ExportStats {
  total: number;
  byPlatform: Record<string, number>;
  byCountry: Record<string, number>;
  exported: number;
  failed: number;
}

// ============================================================================
// Qdrant Client
// ============================================================================

function getQdrantClient(): QdrantClient {
  if (!QDRANT_API_KEY) {
    throw new Error('QDRANT_API_KEY environment variable is required');
  }

  // Build headers for basic auth if provided
  const headers: Record<string, string> = {};
  if (QDRANT_BASIC_AUTH_USERNAME && QDRANT_BASIC_AUTH_PASSWORD) {
    const basicAuth = Buffer.from(
      `${QDRANT_BASIC_AUTH_USERNAME}:${QDRANT_BASIC_AUTH_PASSWORD}`
    ).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  }

  // Handle HTTPS URLs specially (Qdrant client URL parsing quirk)
  if (QDRANT_URL.startsWith('https://')) {
    const url = new URL(QDRANT_URL);
    const port = url.port ? parseInt(url.port) : 443;

    return new QdrantClient({
      host: url.hostname,
      port: port,
      https: true,
      apiKey: QDRANT_API_KEY,
      timeout: 60000,
      checkCompatibility: false,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
  }

  return new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
    timeout: 60000,
    checkCompatibility: false,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });
}

async function scrollAllExamples(
  client: QdrantClient,
  collection: string,
  platformFilter?: string
): Promise<Example[]> {
  const examples: Example[] = [];
  let offset: number | string | undefined = undefined;
  const batchSize = 100;

  console.log(`📥 Fetching examples from ${collection}...`);

  while (true) {
    const filter = platformFilter
      ? { must: [{ key: 'platform', match: { value: platformFilter } }] }
      : undefined;

    const result = await client.scroll(collection, {
      limit: batchSize,
      offset,
      with_payload: true,
      with_vector: false,
      filter,
    });

    for (const point of result.points) {
      const payload = point.payload || {};

      // Extract content from various possible fields
      let content =
        (payload.content as string) ||
        (payload.text as string) ||
        ((payload.content_data as Record<string, unknown>)?.content as string) ||
        ((payload.content_data as Record<string, unknown>)?.caption as string) ||
        '';

      if (!content || content.trim().length < 20) {
        continue; // Skip empty or too short examples
      }

      examples.push({
        id: (payload.example_id as string) || String(point.id),
        content: content.trim(),
        platform: payload.platform as string | undefined,
        type: payload.type as string | undefined,
        title: payload.title as string | undefined,
        country: payload.country as string | undefined,
        categories: payload.categories as string[] | undefined,
        tags: payload.tags as string[] | undefined,
      });
    }

    if (!result.next_page_offset) {
      break;
    }
    offset = result.next_page_offset as number | string;
    process.stdout.write(`\r  Fetched ${examples.length} examples...`);
  }

  console.log(`\n  ✓ Total: ${examples.length} examples from ${collection}`);
  return examples;
}

// ============================================================================
// LiteLLM Synthetic Prompt Generation
// ============================================================================

async function generateSyntheticPrompt(example: Example): Promise<string | null> {
  if (!LITELLM_API_KEY) {
    throw new Error('LITELLM_API_KEY is required');
  }

  const platform = example.platform || example.type || 'social media';
  const platformName = getPlatformDisplayName(platform);

  const systemPrompt = `Du bist ein Experte für die Analyse von Social-Media-Inhalten.
Deine Aufgabe: Generiere eine realistische User-Anfrage, die zu dem gegebenen Output geführt haben könnte.

Regeln:
- Die Anfrage soll kurz und natürlich klingen (1-2 Sätze)
- Extrahiere das Hauptthema aus dem Text
- Erwähne die Zielplattform (${platformName})
- Keine Meta-Kommentare, nur die reine Anfrage
- Deutsch`;

  const userPrompt = `Generiere eine User-Anfrage für diesen ${platformName}-Post:

"""
${example.content.slice(0, 800)}
"""

Antworte NUR mit der Anfrage, nichts anderes.`;

  try {
    const response = await fetch(`${LITELLM_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: PROMPT_GEN_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`\n  ⚠ LiteLLM error: ${error}`);
      return null;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const generatedPrompt = data.choices[0]?.message?.content?.trim();

    if (!generatedPrompt || generatedPrompt.length < 10) {
      return null;
    }

    return generatedPrompt;
  } catch (error) {
    console.error(`\n  ⚠ Request failed:`, error);
    return null;
  }
}

function getPlatformDisplayName(platform: string): string {
  const names: Record<string, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    twitter: 'Twitter/X',
    linkedin: 'LinkedIn',
    pressemitteilung: 'Pressemitteilung',
    rede: 'Rede',
    antrag: 'Antrag',
  };
  return names[platform.toLowerCase()] || platform;
}

// ============================================================================
// Fine-Tuning Data Export
// ============================================================================

function createFineTuningPair(userPrompt: string, assistantResponse: string): FineTuningPair {
  return {
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: assistantResponse },
    ],
  };
}

async function exportToJsonl(
  examples: Example[],
  outputPath: string,
  limit?: number
): Promise<ExportStats> {
  const stats: ExportStats = {
    total: examples.length,
    byPlatform: {},
    byCountry: {},
    exported: 0,
    failed: 0,
  };

  // Calculate stats
  for (const ex of examples) {
    const platform = ex.platform || ex.type || 'unknown';
    stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;

    const country = ex.country || 'unknown';
    stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
  }

  // Limit examples if specified
  const toProcess = limit ? examples.slice(0, limit) : examples;

  // Remove existing file
  if (existsSync(outputPath)) {
    unlinkSync(outputPath);
  }

  console.log(`\n🔄 Generating synthetic prompts for ${toProcess.length} examples...`);
  console.log(`   Using model: ${PROMPT_GEN_MODEL}`);
  console.log(`   Output: ${outputPath}\n`);

  for (let i = 0; i < toProcess.length; i++) {
    const example = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;

    process.stdout.write(`\r${progress} Processing ${example.id}...`.padEnd(60));

    const syntheticPrompt = await generateSyntheticPrompt(example);

    if (syntheticPrompt) {
      const pair = createFineTuningPair(syntheticPrompt, example.content);
      appendFileSync(outputPath, JSON.stringify(pair) + '\n');
      stats.exported++;
    } else {
      stats.failed++;
    }

    // Rate limiting - be nice to the API
    if (i < toProcess.length - 1) {
      await sleep(200);
    }
  }

  console.log(`\n\n✅ Export complete!`);
  return stats;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): {
  dryRun: boolean;
  limit?: number;
  output: string;
  platform?: string;
} {
  const args = process.argv.slice(2);
  const result = {
    dryRun: args.includes('--dry-run'),
    limit: undefined as number | undefined,
    output: 'fine_tuning_data.jsonl',
    platform: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[i + 1], 10);
    }
    if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
    }
    if (args[i] === '--platform' && args[i + 1]) {
      result.platform = args[i + 1];
    }
  }

  return result;
}

function printStats(stats: ExportStats): void {
  console.log('\n📊 Statistics:');
  console.log(`   Total examples: ${stats.total}`);

  console.log('\n   By Platform:');
  for (const [platform, count] of Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${platform}: ${count}`);
  }

  console.log('\n   By Country:');
  for (const [country, count] of Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${country}: ${count}`);
  }

  if (stats.exported > 0 || stats.failed > 0) {
    console.log('\n   Export Results:');
    console.log(`     ✓ Exported: ${stats.exported}`);
    console.log(`     ✗ Failed: ${stats.failed}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 Fine-Tuning Data Export Script\n');

  const args = parseArgs();

  if (!LITELLM_API_KEY && !args.dryRun) {
    console.error('❌ LITELLM_API_KEY environment variable is required');
    console.error('   Set it in your .env file or environment');
    process.exit(1);
  }

  const client = getQdrantClient();

  // Check Qdrant connection
  try {
    await client.getCollections();
    console.log(`✓ Connected to Qdrant at ${QDRANT_URL}`);
  } catch (error) {
    console.error(`❌ Could not connect to Qdrant at ${QDRANT_URL}`);
    console.error('   Make sure Qdrant is running');
    process.exit(1);
  }

  // Fetch all examples from both collections
  let allExamples: Example[] = [];

  try {
    const socialExamples = await scrollAllExamples(client, COLLECTIONS.social, args.platform);
    allExamples = [...allExamples, ...socialExamples];
  } catch (error) {
    console.log(`  ⚠ Could not fetch from ${COLLECTIONS.social}: ${error}`);
  }

  try {
    const contentExamples = await scrollAllExamples(client, COLLECTIONS.content, args.platform);
    // Add type for content examples if not set
    for (const ex of contentExamples) {
      if (!ex.platform && ex.type) {
        ex.platform = ex.type;
      }
    }
    allExamples = [...allExamples, ...contentExamples];
  } catch (error) {
    console.log(`  ⚠ Could not fetch from ${COLLECTIONS.content}: ${error}`);
  }

  if (allExamples.length === 0) {
    console.error('\n❌ No examples found in Qdrant');
    process.exit(1);
  }

  // Calculate and print stats
  const stats: ExportStats = {
    total: allExamples.length,
    byPlatform: {},
    byCountry: {},
    exported: 0,
    failed: 0,
  };

  for (const ex of allExamples) {
    const platform = ex.platform || ex.type || 'unknown';
    stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;

    const country = ex.country || 'unknown';
    stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
  }

  printStats(stats);

  if (args.dryRun) {
    console.log('\n🔍 Dry run complete. Use without --dry-run to generate training data.');
    return;
  }

  // Generate and export
  const exportStats = await exportToJsonl(allExamples, args.output, args.limit);
  printStats(exportStats);

  console.log(`\n📁 Output file: ${args.output}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Review the generated JSONL file');
  console.log('   2. Upload to Mistral fine-tuning dashboard');
  console.log('   3. Start fine-tuning job\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
