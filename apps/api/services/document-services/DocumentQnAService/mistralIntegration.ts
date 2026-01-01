/**
 * Mistral integration operations
 * Handles Mistral API calls for document Q&A
 */

import type { StoredDocument, MistralContentItem } from './types.js';

/**
 * Ask Mistral to extract knowledge from documents using context-specific questions
 */
export async function askMistralAboutDocuments(
  mistral: any,
  documents: StoredDocument[],
  questions: string
): Promise<string> {
  const content: MistralContentItem[] = [];

  // Add the question
  content.push({
    type: 'text',
    text: questions
  });

  // Add documents
  for (const doc of documents) {
    if (doc.type === 'application/pdf' || doc.type.startsWith('image/')) {
      // Use Mistral's document understanding for PDFs and images
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: doc.type,
          data: doc.data
        }
      });
    } else if (doc.type.startsWith('text/')) {
      // For text files, decode base64 and add as text
      const textContent = Buffer.from(doc.data, 'base64').toString('utf-8');
      content.push({
        type: 'text',
        text: `[Inhalt von ${doc.name}]\n\n${textContent}`
      });
    }
  }

  console.log(`[DocumentQnAService] Asking Mistral about ${documents.length} documents`);

  // Convert content array to string for Mistral API
  const messageContent = content.map(item => {
    if (item.type === 'text') {
      return item.text;
    } else if (item.type === 'document') {
      return `[Dokument: ${item.source?.media_type || 'unbekannt'}]`;
    }
    return '';
  }).join('\n\n');

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: messageContent }],
    max_tokens: 800,
    temperature: 0.2,
    top_p: 0.85
  });

  const knowledge = response.choices?.[0]?.message?.content || '';

  if (!knowledge.trim()) {
    throw new Error('No knowledge extracted from documents');
  }

  return knowledge.trim();
}
