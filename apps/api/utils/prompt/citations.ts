import type { Citation, DocumentContext, ProcessedResponse, SourceInfo } from './types.js';

export function extractCitationsFromText(
  text: string,
  documentContext: DocumentContext[],
  logPrefix: string = 'citation-extractor'
): Citation[] {
  console.log(`[${logPrefix}] Extracting citations from text length: ${text.length}`);
  console.log(`[${logPrefix}] Document context length: ${documentContext.length}`);
  console.log(`[${logPrefix}] Text preview:`, text.substring(0, 200));

  const extractedCitations: Citation[] = [];

  const citationPatterns: RegExp[] = [
    /\[(\d+)\]\s*"([^"]+)"\s*\(Dokument:\s*([^)]+)\)/g,
    /\[(\d+)\]\s*"([^"]+)"/g,
    /\[(\d+)\]\s*„([^"]+)"/g,
    /\[(\d+)\]\s*'([^']+)'/g,
    />\s*\[(\d+)\]\s*"([^"]+)"/g
  ];

  const allCitationRefs = new Set<string>();
  const citationRefPattern = /\[(\d+)\]/g;
  let refMatch: RegExpExecArray | null;
  while ((refMatch = citationRefPattern.exec(text)) !== null) {
    allCitationRefs.add(refMatch[1]);
  }
  console.log(`[${logPrefix}] Found citation references:`, Array.from(allCitationRefs).sort());

  for (const pattern of citationPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const citationNumber = match[1];
      const citationIndex = parseInt(citationNumber) - 1;
      const citedText = match[2];
      const documentTitle = match[3];

      console.log(`[${logPrefix}] Parsing citation: [${citationNumber}] "${citedText.substring(0, 30)}..."`);

      if (citationIndex >= 0 && citationIndex < documentContext.length) {
        const docContext = documentContext[citationIndex];

        extractedCitations.push({
          index: citationNumber,
          cited_text: citedText.trim(),
          document_title: documentTitle || docContext.title,
          document_id: docContext.metadata.document_id,
          similarity_score: docContext.metadata.similarity_score,
          chunk_index: docContext.metadata.chunk_index,
          filename: docContext.metadata.filename
        });
      } else {
        console.warn(`[${logPrefix}] Citation index ${citationIndex} out of range (0-${documentContext.length - 1})`);

        if (citationIndex >= 0) {
          let bestMatch: DocumentContext | null = null;

          for (let i = 0; i < documentContext.length; i++) {
            const doc = documentContext[i];
            if (doc.content.includes(citedText.substring(0, 20))) {
              bestMatch = doc;
              break;
            }
          }

          if (bestMatch) {
            console.log(`[${logPrefix}] Creating fallback citation for [${citationNumber}] using best match`);
            extractedCitations.push({
              index: citationNumber,
              cited_text: citedText.trim(),
              document_title: bestMatch.title,
              document_id: bestMatch.metadata.document_id,
              similarity_score: bestMatch.metadata.similarity_score,
              chunk_index: bestMatch.metadata.chunk_index,
              filename: bestMatch.metadata.filename
            });
          }
        }
      }
    }

    pattern.lastIndex = 0;
  }

  for (const refNum of allCitationRefs) {
    const existing = extractedCitations.find(c => c.index === refNum);
    if (!existing) {
      const refIndex = parseInt(refNum) - 1;
      if (refIndex >= 0 && refIndex < documentContext.length) {
        const docContext = documentContext[refIndex];
        console.log(`[${logPrefix}] Creating minimal citation for reference [${refNum}]`);

        extractedCitations.push({
          index: refNum,
          cited_text: `Reference from ${docContext.title}`,
          document_title: docContext.title,
          document_id: docContext.metadata.document_id,
          similarity_score: docContext.metadata.similarity_score,
          chunk_index: docContext.metadata.chunk_index,
          filename: docContext.metadata.filename
        });
      } else if (refIndex >= 0) {
        const lastDocIndex = documentContext.length - 1;
        if (lastDocIndex >= 0) {
          const docContext = documentContext[lastDocIndex];
          console.log(`[${logPrefix}] Creating fallback citation for out-of-range reference [${refNum}] using last document`);

          extractedCitations.push({
            index: refNum,
            cited_text: `Reference to additional content from ${docContext.title}`,
            document_title: docContext.title,
            document_id: docContext.metadata.document_id,
            similarity_score: docContext.metadata.similarity_score,
            chunk_index: docContext.metadata.chunk_index,
            filename: docContext.metadata.filename
          });
        }
      }
    }
  }

  const uniqueCitations: Citation[] = [];
  const seenIndices = new Set<string>();

  for (const citation of extractedCitations) {
    if (!seenIndices.has(citation.index)) {
      uniqueCitations.push(citation);
      seenIndices.add(citation.index);
    }
  }

  console.log(`[${logPrefix}] Final citations extracted:`, uniqueCitations.map(c => `[${c.index}]`));

  return uniqueCitations;
}

export function processAIResponseWithCitations(
  responseContent: string,
  documentContext: DocumentContext[],
  logPrefix: string = 'citation-processor'
): ProcessedResponse {
  console.log(`[${logPrefix}] Processing AI response, length: ${responseContent.length}`);

  let citations: Citation[] = [];
  let answer = responseContent;

  const citationSectionPatterns: RegExp[] = [
    /Hier sind die relevanten Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Relevante Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i,
    /Zitate.*?:\s*\n\n([\s\S]*?)\n\nAntwort:/i
  ];

  let citationSectionFound = false;
  for (const pattern of citationSectionPatterns) {
    const citationMatch = responseContent.match(pattern);
    if (citationMatch) {
      const citationText = citationMatch[1];
      answer = responseContent.substring(responseContent.indexOf('Antwort:') + 8).trim();

      console.log(`[${logPrefix}] Found citation section using pattern, extracting citations...`);
      citations = extractCitationsFromText(citationText, documentContext, logPrefix);
      citationSectionFound = true;
      break;
    }
  }

  if (!citationSectionFound) {
    console.log(`[${logPrefix}] No structured citation section found, searching entire response...`);
    citations = extractCitationsFromText(responseContent, documentContext, logPrefix);

    if (citations.length > 0) {
      const answerMatch = responseContent.match(/\nAntwort:\s*([\s\S]*)$/i);
      if (answerMatch) {
        answer = answerMatch[1].trim();
      } else {
        answer = responseContent.replace(/\[\d+\]\s*"[^"]*"(?:\s*\([^)]*\))?/g, '').trim();
      }
    }
  }

  console.log(`[${logPrefix}] Citation extraction complete. Found`, citations.length, 'citations');

  let processedAnswer = answer;
  citations.forEach(citation => {
    const citationPattern = new RegExp(`\\[${citation.index}\\]`, 'g');
    const marker = `⚡CITE${citation.index}⚡`;
    processedAnswer = processedAnswer.replace(citationPattern, marker);
    console.log(`[${logPrefix}] Replaced [${citation.index}] with ${marker}`);
  });

  const sources: SourceInfo[] = documentContext.map((doc) => {
    const citationsForDoc = citations.filter(c => c.document_id === doc.metadata.document_id);
    return {
      document_id: doc.metadata.document_id,
      document_title: doc.title,
      chunk_text: doc.content.substring(0, 200) + '...',
      similarity_score: doc.metadata.similarity_score,
      citations: citationsForDoc
    };
  });

  return {
    answer: processedAnswer,
    citations,
    sources
  };
}
