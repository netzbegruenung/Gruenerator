/**
 * Test file for Mistral API with tools
 * Run with: npx tsx apps/api/routes/chat/test-mistral.ts
 */

import { streamText, tool, stepCountIs } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { z } from 'zod';
import 'dotenv/config';

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const tools = {
  web_search: tool({
    description: 'Search the web for information',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
    }),
    execute: async ({ query }) => {
      console.log('[Tool] web_search called with:', query);
      return { results: ['Test result 1', 'Test result 2'], query };
    },
  }),
  direct_response: tool({
    description: 'Respond directly without search - use for greetings, creative tasks, follow-ups',
    inputSchema: z.object({
      content: z.string().describe('The full response to the user'),
      reason: z.string().optional().describe('Optional: why no search was needed'),
    }),
    execute: async ({ content, reason }) => {
      console.log('[Tool] direct_response called, content length:', content?.length, 'reason:', reason);
      return { type: 'direct', content, reason };
    },
  }),
};

async function testMistral() {
  console.log('Testing Mistral API...');
  console.log('API Key:', process.env.MISTRAL_API_KEY ? 'Set' : 'NOT SET');

  try {
    // Test 3: With tools, toolChoice required
    console.log('\n=== Test 3: With tools (required) ===');
    const result3 = await streamText({
      model: mistral('mistral-large-latest'),
      messages: [
        { role: 'user', content: 'Erstelle einen Instagram-Post zum Thema Verkehrswende' },
      ],
      tools,
      toolChoice: 'auto',
      maxOutputTokens: 500,
      stopWhen: stepCountIs(3),
      onChunk: ({ chunk }) => {
        if (chunk.type === 'tool-call') {
          console.log('\n[Tool Call]', chunk.toolName, (chunk as any).input);
        }
      },
      onStepFinish: ({ toolCalls, text }) => {
        console.log('\n[Step] tools:', toolCalls?.length || 0, 'text:', text?.length || 0);
      },
    });

    // Use fullStream to see all events
    for await (const event of result3.fullStream) {
      if (event.type === 'error') {
        console.log('[ERROR EVENT]', JSON.stringify(event, null, 2));
      } else {
        console.log('[Event]', event.type);
      }
    }

    console.log('\n[Test 3] Done');

  } catch (error) {
    console.error('\n[ERROR]', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

testMistral();
