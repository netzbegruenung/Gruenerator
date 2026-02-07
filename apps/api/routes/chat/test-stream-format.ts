/**
 * Test file to capture the actual stream format from Mistral
 * Run with: npx tsx apps/api/routes/chat/test-stream-format.ts
 */

import 'dotenv/config';
import { createMistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';

console.log('MISTRAL_API_KEY set:', !!process.env.MISTRAL_API_KEY);

async function testStreamFormat() {
  const mistral = createMistral({
    apiKey: process.env.MISTRAL_API_KEY,
  });

  const model = mistral('mistral-large-latest');

  console.log('Starting stream test...\n');

  const result = streamText({
    model,
    messages: [
      { role: 'system', content: 'Du bist ein hilfreicher Assistent.' },
      { role: 'user', content: 'Sag einfach Hallo!' },
    ],
    maxOutputTokens: 100,
    temperature: 0.7,
  });

  // Test 1: Get the UI message stream and log raw chunks
  console.log('=== Testing toUIMessageStream() ===\n');

  const uiStream = result.toUIMessageStream();
  const reader = uiStream.getReader();

  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkCount++;
    console.log(`Chunk ${chunkCount}:`);
    console.log('  Type:', typeof value);
    console.log('  Value:', JSON.stringify(value).slice(0, 300));
    console.log('');
  }

  console.log(`\nTotal chunks: ${chunkCount}`);
}

// Also test what toUIMessageStreamResponse produces
async function testResponseFormat() {
  const mistral = createMistral({
    apiKey: process.env.MISTRAL_API_KEY,
  });

  const model = mistral('mistral-large-latest');

  console.log('\n\n=== Testing toUIMessageStreamResponse() ===\n');

  const result = streamText({
    model,
    messages: [
      { role: 'system', content: 'Du bist ein hilfreicher Assistent.' },
      { role: 'user', content: 'Sag einfach Hallo!' },
    ],
    maxOutputTokens: 100,
    temperature: 0.7,
  });

  const response = result.toUIMessageStreamResponse();

  console.log('Response headers:');
  response.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('');

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }

    console.log('Full response body:');
    console.log(fullText);
  }
}

// Test what pipeUIMessageStreamToResponse actually sends
async function testPipeToResponse() {
  const mistral = createMistral({
    apiKey: process.env.MISTRAL_API_KEY,
  });

  const model = mistral('mistral-large-latest');

  console.log('\n\n=== Testing pipeUIMessageStreamToResponse() ===\n');

  const result = streamText({
    model,
    messages: [
      { role: 'system', content: 'Du bist ein hilfreicher Assistent.' },
      { role: 'user', content: 'Sag einfach Hallo!' },
    ],
    maxOutputTokens: 100,
    temperature: 0.7,
  });

  // Mock Express response
  const chunks: Buffer[] = [];
  const mockRes = {
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      console.log(`setHeader: ${name} = ${value}`);
    },
    write(chunk: any) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      console.log('write:', buf.toString().slice(0, 100));
      return true;
    },
    end() {
      console.log('\nResponse ended');
      console.log('Total chunks written:', chunks.length);
      console.log('\nFull response:');
      console.log(Buffer.concat(chunks).toString());
    },
    on() {},
    once() {},
    emit() {},
    flushHeaders() {
      console.log('flushHeaders called');
    },
  };

  result.pipeUIMessageStreamToResponse(mockRes as any, {
    headers: { 'X-Thread-Id': 'test-123' },
  });

  // Wait for stream to complete
  await result.text;
}

testStreamFormat()
  .then(() => testResponseFormat())
  .then(() => testPipeToResponse())
  .catch(console.error);
