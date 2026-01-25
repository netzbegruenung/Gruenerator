/**
 * Mistral AI-powered parameter extraction
 * Uses Mistral for semantic parameter understanding
 */

import mistralClient from '../../../../workers/mistralClient.js';
import type { ChatContext } from '../../types.js';
import type { MistralExtractionResponse } from '../types.js';
import { createExtractionPrompt } from './prompts.js';

/**
 * Extract parameters using Mistral AI for better semantic understanding
 */
export async function extractParametersWithMistral(
  message: string,
  agent: string,
  context: ChatContext = {}
): Promise<Record<string, unknown>> {
  const prompt = createExtractionPrompt(message, agent, context);

  console.log('[MistralExtractor] Using Mistral for parameter extraction:', agent);

  const response = await mistralClient.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.1,
    maxTokens: 500,
  });

  const messageContent = response.choices[0].message.content;
  let responseText =
    typeof messageContent === 'string'
      ? messageContent.trim()
      : JSON.stringify(messageContent).trim();

  // Remove markdown code blocks if present
  if (responseText.startsWith('```json')) {
    responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const extracted = JSON.parse(responseText) as MistralExtractionResponse;
    console.log('[MistralExtractor] Mistral extraction successful:', extracted);

    // Add confidence metadata in the expected format
    const result: Record<string, unknown> = {
      thema: extracted.theme || 'Grüne Politik',
      details: extracted.details || message,
      type: agent,
      _parameterConfidence: {},
      _parameterSources: {},
    };

    // Add agent-specific fields
    if (agent === 'zitat' && extracted.author) {
      result.name = extracted.author;
      (result._parameterConfidence as Record<string, number>).name =
        extracted.confidence?.author || 0.9;
      (result._parameterSources as Record<string, string>).name = 'mistral_ai';
    }

    if (agent === 'dreizeilen' && extracted.lines) {
      result.line1 = extracted.lines.line1;
      result.line2 = extracted.lines.line2;
      result.line3 = extracted.lines.line3;
    }

    return result;
  } catch (parseError) {
    console.error('[MistralExtractor] Failed to parse Mistral response:', parseError);
    console.error('[MistralExtractor] Raw response:', responseText);
    throw new Error('Invalid JSON response from Mistral');
  }
}
