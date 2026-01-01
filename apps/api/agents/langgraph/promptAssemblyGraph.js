"use strict";

const mistralClient = (() => {
  try { return require('../../workers/mistralClient.js'); } catch (_) { return null; }
})();

const { contentExamplesService } = (() => {
  try { return require('../../services/contentExamplesService.js'); } catch (_) { return { contentExamplesService: null }; }
})();

import { localizePlaceholders } from '../../utils/localizationHelper.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// URL detection is now handled by requestEnrichment.js

function buildSystemText({ systemRole, toolInstructions = [], constraints = null, formatting = null, locale = 'de-DE' }) {
  if (!systemRole) throw new Error("System role is required");

  // Get current date
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
  const currentDate = dateFormatter.format(now);

  // Localize system role and append date
  const localizedSystemRole = localizePlaceholders(systemRole, locale);
  const systemWithDate = `${localizedSystemRole}\n\nAktuelles Datum: ${currentDate}`;

  console.log(`📋 [PromptAssembly] System text built with date (locale=${locale}, date=${currentDate})`);
  return systemWithDate;
}

function buildDocumentBlocks(documents = []) {
  if (!Array.isArray(documents) || documents.length === 0) return null;
  const blocks = [];
  blocks.push({ type: "text", text: "Hier sind Dokumente als Hintergrundinformation:" });
  for (const doc of documents) {
    if (doc?.type === "document" && doc.source) {
      blocks.push({ type: "document", source: doc.source });
    } else if (doc?.type === "image" && doc.source) {
      blocks.push({ type: "image", source: doc.source });
    } else if (doc?.type === "text" && doc.source?.text) {
      let textContent = doc.source.text;
      // Add source attribution for crawled URLs
      if (doc.source.metadata?.contentSource === 'url_crawl') {
        const title = doc.source.metadata.title || 'Crawled Content';
        const url = doc.source.metadata.url || '';
        textContent = `[Quelle: ${title}${url ? ` - ${url}` : ''}]\n\n${textContent}`;
      }
      blocks.push({ type: "text", text: textContent });
    }
  }
  const blockCounts = blocks.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  console.log('📋 [PromptAssembly] Document blocks summary:', blockCounts);
  return blocks;
}

// Restrict example usage to selected platforms for now
const EXAMPLES_ALLOWED_PLATFORMS = new Set(['facebook', 'instagram']);

function formatExamples(examples = []) {
  if (!Array.isArray(examples) || examples.length === 0) return "";
  let out = "<examples>\nBEISPIEL:\n";
  for (const ex of examples) {
    if (ex && ex.content) out += `${ex.content}\n`;
  }
  out += "</examples>";
  console.log(`📋 [PromptAssembly] Examples formatted (count=${examples.length})`);
  return out;
}

function formatRequestObject(request, locale = 'de-DE') {
  const parts = [];
  if (request.theme || request.thema) parts.push(`Thema: ${request.theme || request.thema}`);
  if (request.details) parts.push(`Details: ${request.details}`);
  if (Array.isArray(request.platforms) && request.platforms.length) parts.push(`Plattformen: ${request.platforms.join(", ")}`);
  if (request.zitatgeber) parts.push(`Zitatgeber: ${request.zitatgeber}`);
  if (request.textForm) parts.push(`Textform: ${request.textForm}`);
  for (const [k, v] of Object.entries(request)) {
    if (["theme", "thema", "details", "platforms", "zitatgeber", "textForm", "presseabbinder"].includes(k)) continue;
    if (v) {
      // Localize the value if it's a string
      const localizedValue = typeof v === 'string' ? localizePlaceholders(v, locale) : v;
      parts.push(`${k}: ${localizedValue}`);
    }
  }
  const result = parts.join("\n");
  console.log(`📋 [PromptAssembly] Request object formatted (lines=${parts.length}, locale=${locale})`);
  return result;
}

function buildMainUserContent({ examples = [], knowledge = [], instructions = null, request = null, toolInstructions = [], constraints = null, formatting = null, taskInstructions = null, outputFormat = null, locale = 'de-DE' }) {
  const parts = [];

  // 1. USER REQUEST (what they want) - FIRST!
  if (request) {
    let txt;
    if (typeof request === "string") {
      txt = localizePlaceholders(request, locale);
    } else {
      txt = formatRequestObject(request, locale);
    }
    parts.push(`<request>\n${txt}\n</request>`);
  }

  // 2. TASK INSTRUCTIONS (how to execute this specific task)
  if (taskInstructions) {
    parts.push(localizePlaceholders(taskInstructions, locale));
  }

  // 3. CUSTOM INSTRUCTIONS (user's personal guidance)
  if (instructions) {
    const localizedInstructions = localizePlaceholders(instructions, locale);
    parts.push(`<instructions>\n${localizedInstructions}\n</instructions>`);
  }

  // 4. CONSTRAINTS (absolute limits)
  if (constraints) {
    parts.push(localizePlaceholders(constraints, locale));
  }

  // 5. FORMATTING RULES
  if (formatting) {
    parts.push(localizePlaceholders(formatting, locale));
  }

  // 6. EXAMPLES (if applicable)
  const ex = formatExamples(examples);
  if (ex) parts.push(ex);

  // 7. CONTEXT HINTS (passive, informational)
  if (toolInstructions && toolInstructions.length > 0) {
    const localizedInstructions = toolInstructions.map(instr => localizePlaceholders(instr, locale));
    parts.push(localizedInstructions.join(" "));
  }

  // 8. BACKGROUND KNOWLEDGE (optional context)
  if (Array.isArray(knowledge) && knowledge.length > 0) {
    const localizedKnowledge = knowledge.map(k => localizePlaceholders(k, locale));
    parts.push(`<knowledge>\n${localizedKnowledge.join("\n\n")}\n</knowledge>`);
  }

  // 9. OUTPUT FORMAT (how to structure response) - LAST
  if (outputFormat) {
    parts.push(localizePlaceholders(outputFormat, locale));
  }

  const combined = parts.length > 0 ? parts.join("\n\n---\n\n") : null;
  console.log(`📋 [PromptAssembly] Main user content built (sections=${parts.length}, task=${taskInstructions ? 'y' : 'n'}, custom=${instructions ? 'y' : 'n'}, constraints=${constraints ? 'y' : 'n'}, formatting=${formatting ? 'y' : 'n'}, locale=${locale})`);
  return combined;
}

function assemblePromptGraph(state) {
  console.log('📋 [PromptAssembly] Building system text...');
  const system = buildSystemText({
    systemRole: state.systemRole,
    locale: state.locale || 'de-DE'
  });

  console.log('📋 [PromptAssembly] Processing documents and content...');
  const messages = [];
  const docBlocks = buildDocumentBlocks(state.documents);
  if (docBlocks && docBlocks.length > 0) {
    console.log(`📋 [PromptAssembly] Added ${docBlocks.length} document blocks`);
    messages.push({ role: "user", content: docBlocks });
  }

  // Only include examples for Facebook and Instagram platforms
  const allowedPlatforms = EXAMPLES_ALLOWED_PLATFORMS;
  const reqPlatforms = (state && typeof state.request === 'object' && Array.isArray(state.request.platforms))
    ? state.request.platforms.map(p => String(p || '').toLowerCase())
    : [];
  const useExamples = reqPlatforms.some(p => allowedPlatforms.has(p));
  console.log(`📋 [PromptAssembly] Examples ${useExamples ? 'included' : 'skipped'} for platforms=[${reqPlatforms.join(',')}]`);

  const mainUser = buildMainUserContent({
    examples: useExamples ? state.examples : [],
    knowledge: state.knowledge,
    instructions: state.instructions,
    request: state.requestFormatted || state.request,
    toolInstructions: state.toolInstructions || [],
    constraints: state.constraints,
    formatting: state.formatting,
    taskInstructions: state.taskInstructions,
    outputFormat: state.outputFormat,
    locale: state.locale || 'de-DE'
  });
  if (mainUser) {
    console.log('📋 [PromptAssembly] Added main user content');
    messages.push({ role: "user", content: mainUser });
  }

  const tools = Array.isArray(state.tools) ? [...state.tools] : [];
  console.log(`📋 [PromptAssembly] Completed with ${messages.length} messages, ${tools.length} tools`);
  return { system, messages, tools };
}

async function uploadDocAndGetUrl(doc) {
  if (!mistralClient) return null;
  console.log('📋 [Upload] Starting document upload...');
  
  try {
    // Prefer binary upload to Files API, fallback to data URL
    const src = doc?.source || {};
    if (src.data) {
      const fileName = src.name || 'document.pdf';
      const mediaType = src.media_type || 'application/pdf';
      console.log(`📋 [Upload] Processing ${fileName} (${mediaType})`);
      
      // Build payload using Node Buffer and OCR purpose
      const buffer = Buffer.from(src.data, 'base64');
      const uploadPayload = { file: { fileName, content: buffer }, purpose: 'ocr' };
      
      console.log('📋 [Upload] Uploading to Mistral Files API...');
      let res;
      if (mistralClient.files?.upload) res = await mistralClient.files.upload(uploadPayload);
      else if (mistralClient.files?.create) res = await mistralClient.files.create(uploadPayload);
      else if (mistralClient.files?.add) res = await mistralClient.files.add(uploadPayload);
      
      const fileId = res?.id || res?.file?.id || res?.data?.id;
      if (fileId && mistralClient.files?.getSignedUrl) {
        console.log(`📋 [Upload] Getting signed URL for file ID: ${fileId}`);
        const signed = await mistralClient.files.getSignedUrl({ fileId });
        if (signed?.url) {
          console.log('📋 [Upload] Successfully got signed URL');
          return signed.url;
        }
      }
      // Fallback to data URL
      console.log('📋 [Upload] Falling back to data URL');
      return `data:${mediaType};base64,${src.data}`;
    }
    if (src.url) {
      console.log('📋 [Upload] Using existing URL');
      return src.url;
    }
    console.log('📋 [Upload] No valid source found');
    return null;
  } catch (error) {
    console.log(`📋 [Upload] Failed: ${error.message || 'Unknown error'}`);
    return null;
  }
}

function deriveDocQnAQuestions(state) {
  const req = state.request;
  const theme = typeof req === 'object' ? (req.thema || req.theme || req.details || '') : (String(req || ''));
  const base = theme ? String(theme).substring(0, 200) : '';
  const routeType = state.type || 'social';
  switch (routeType) {
    case 'social':
      return [
        `Extrahiere knappe, überprüfbare Fakten, Zahlen und ggf. kurze Zitate aus den Dokumenten zum Thema: "${base}". Gib nur Stichpunkte (max 12) in Deutsch aus.`
      ];
    case 'presse':
      return [
        `Welche verifizierbaren Informationen und Zitate unterstützen eine sachliche Pressemitteilung zum Thema: "${base}"? Antworte in 6–10 prägnanten Stichpunkten in Deutsch.`
      ];
    default:
      return [
        `Was sagen die Dokumente zu: "${base}"? Antworte in 8–12 prägnanten Stichpunkten in Deutsch, mit klaren Fakten.`
      ];
  }
}

async function runDocumentQnA(state, docRefs) {
  if (!mistralClient || !docRefs || docRefs.length === 0) return null;
  console.log(`📋 [DocQnA] Starting extraction for ${docRefs.length} documents...`);

  const questions = deriveDocQnAQuestions(state);
  const content = [];
  content.push({ type: 'text', text: questions[0] });

  // Accept URL strings only for provider compatibility
  const first = docRefs[0];
  const usingUrls = typeof first === 'string';
  if (!usingUrls) {
    console.log('📋 [DocQnA] Unsupported direct document blocks for provider – skipping DocQnA');
    return null;
  }
  for (const url of docRefs) {
    content.push({ type: 'document_url', documentUrl: url });
  }
  
  try {
    const kinds = docRefs.map(u => (typeof u === 'string' && u.startsWith('data:')) ? 'data' : (typeof u === 'string' && u.startsWith('http') ? 'http' : 'other'));
    console.log(`📋 [DocQnA] Calling Mistral API (kinds=${kinds.join(',')})...`);
    const resp = await mistralClient.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content }],
      max_tokens: 800,
      temperature: 0.2,
      top_p: 0.85
    });
    const messageContent = resp.choices?.[0]?.message?.content;
    const text = Array.isArray(messageContent)
      ? messageContent.filter(b => b.type === 'text').map(b => b.text || '').join('\n')
      : (messageContent || '');
    if (!text || text.trim().length === 0) {
      console.log('📋 [DocQnA] No content extracted');
      return null;
    }
    // Compact the output
    let capsule = text.trim();
    if (capsule.length > 1800) capsule = capsule.substring(0, 1800) + '...';
    console.log(`📋 [DocQnA] Extracted ${capsule.length} chars of knowledge`);
    return capsule;
  } catch (error) {
    console.log(`📋 [DocQnA] Failed: ${error.message || 'Unknown error'}`);
    try {
      if (error?.response?.data) {
        console.log('📋 [DocQnA] Provider error body:', JSON.stringify(error.response.data));
      }
    } catch (_) {}
    return null;
  }
}

async function assemblePromptGraphAsync(enrichedState, flags = {}) {
  console.log('📋 [PromptAssemblyAsync] Starting assembly with pre-enriched state...');

  // State comes pre-enriched from requestEnrichment.js
  let effectiveDocuments = Array.isArray(enrichedState.documents) ? [...enrichedState.documents] : [];
  let knowledgeCapsule = null;

  // Get DocQnA setting from enriched state metadata
  const docQnAEnabled = enrichedState.enrichmentMetadata?.enableDocQnA || false;

  // Check if documents are from KnowledgeSelector (already processed via vector search)
  const hasKnowledgeSelectorDocuments = (enrichedState.selectedDocumentIds && enrichedState.selectedDocumentIds.length > 0);

  // Only apply DocQnA to attachment documents, not KnowledgeSelector documents
  const shouldUseDocQnA = docQnAEnabled && effectiveDocuments.length > 0 && !hasKnowledgeSelectorDocuments;

  if (shouldUseDocQnA) {
    console.log(`📋 [PromptAssemblyAsync] DocQnA enabled with ${effectiveDocuments.length} documents`);

    // Separate crawled URLs from file attachments
    // Crawled URLs should NOT go through DocQnA (already processed text)
    const crawledUrlDocs = effectiveDocuments.filter(d =>
      d && d.type === 'text' && d.source?.metadata?.contentSource === 'url_crawl'
    );
    const fileAttachmentDocs = effectiveDocuments.filter(d =>
      d && d.type === 'document' && d.source
    );

    console.log(`📋 [PromptAssemblyAsync] Document split: ${fileAttachmentDocs.length} file attachments, ${crawledUrlDocs.length} crawled URLs`);
    console.log(`📋 [PromptAssemblyAsync] Processing ${fileAttachmentDocs.length} file attachment uploads for DocQnA (parallel)...`);

    // Upload documents in parallel for better performance
    const uploadResults = await Promise.all(
      fileAttachmentDocs.map(d => uploadDocAndGetUrl(d))
    );
    const urlList = uploadResults.filter(Boolean);
    
    if (urlList.length > 0) {
      const kinds = urlList.map(u => (typeof u === 'string' && u.startsWith('data:')) ? 'data' : (typeof u === 'string' && u.startsWith('http') ? 'http' : 'other'));
      console.log(`📋 [PromptAssemblyAsync] Prepared Doc URLs (count=${urlList.length}, kinds=${kinds.join(',')})`);
      if (kinds.every(k => k === 'data')) {
        console.log('⚠️ [PromptAssemblyAsync] Doc URLs are data: URIs. Provider may reject them. Skipping DocQnA.');
        knowledgeCapsule = null;
      } else {
        knowledgeCapsule = await runDocumentQnA(enrichedState, urlList);
      }
      // Suppress file attachments in final prompt if capsule succeeded, but keep crawled URLs
      if (knowledgeCapsule) {
        console.log(`🧭 [LangGraph] DocQnA used: docs=${urlList.length}`);
        effectiveDocuments = crawledUrlDocs; // keep crawled URLs, remove file attachments
      } else {
        console.log('📋 [PromptAssemblyAsync] DocQnA returned no capsule; retaining all documents');
      }
    } else if (fileAttachmentDocs.length > 0) {
      // Fallback when no URLs could be prepared (e.g., upload error): send direct document blocks
      console.log('📋 [PromptAssemblyAsync] No Doc URLs prepared; falling back to direct documents for DocQnA');
      knowledgeCapsule = await runDocumentQnA(enrichedState, fileAttachmentDocs);
      if (knowledgeCapsule) {
        console.log(`🧭 [LangGraph] DocQnA used with direct documents: docs=${fileAttachmentDocs.length}`);
        effectiveDocuments = crawledUrlDocs; // keep crawled URLs, remove file attachments
      } else {
        console.log('📋 [PromptAssemblyAsync] DocQnA fallback produced no capsule; retaining all documents');
      }
    }
  } else if (hasKnowledgeSelectorDocuments) {
    console.log('📋 [PromptAssemblyAsync] DocQnA skipped: documents processed via KnowledgeSelector vector search');
  } else if (docQnAEnabled) {
    console.log('📋 [PromptAssemblyAsync] DocQnA enabled but no documents found');
  }

  // Assemble as usual but with optional knowledge capsule and possibly without docs
  console.log('📋 [PromptAssemblyAsync] Building system text...');
  const system = buildSystemText({
    systemRole: enrichedState.systemRole,
    locale: enrichedState.locale || 'de-DE'
  });

  console.log('📋 [PromptAssemblyAsync] Processing final content blocks...');
  const messages = [];

  const baseKnowledge = Array.isArray(enrichedState.knowledge) ? [...enrichedState.knowledge] : [];
  if (knowledgeCapsule) {
    console.log('📋 [PromptAssemblyAsync] Adding knowledge capsule to content');
    baseKnowledge.unshift(`DOKUMENT-FAKTEN (kompakt):\n${knowledgeCapsule}`);
  }

  // Only include examples for Facebook and Instagram platforms
  const allowedPlatforms = EXAMPLES_ALLOWED_PLATFORMS;
  const reqPlatforms = (enrichedState && typeof enrichedState.request === 'object' && Array.isArray(enrichedState.request.platforms))
    ? enrichedState.request.platforms.map(p => String(p || '').toLowerCase())
    : [];
  const useExamples = reqPlatforms.some(p => allowedPlatforms.has(p));
  console.log(`📋 [PromptAssemblyAsync] Examples ${useExamples ? 'included' : 'skipped'} for platforms=[${reqPlatforms.join(',')}]`);

  // Fetch examples from contentExamplesService if needed
  if (useExamples && (!enrichedState.examples || enrichedState.examples.length === 0) && contentExamplesService) {
    const examplePromises = [];

    // Get theme/topic for example search
    const searchQuery = enrichedState.request?.thema ||
                        enrichedState.request?.details ||
                        enrichedState.request?.theme || '';

    // Fetch examples for each platform
    for (const platform of reqPlatforms) {
      if (allowedPlatforms.has(platform)) {
        console.log(`📋 [PromptAssemblyAsync] Fetching ${platform} examples...`);
        examplePromises.push(
          contentExamplesService.getExamples(platform, searchQuery, {
            limit: 2, // 2 examples per platform
            fallbackToRandom: true
          })
        );
      }
    }

    if (examplePromises.length > 0) {
      try {
        const exampleResults = await Promise.all(examplePromises);
        const allExamples = exampleResults.flat();

        if (allExamples.length > 0) {
          enrichedState.examples = allExamples;
          console.log(`📋 [PromptAssemblyAsync] Fetched ${allExamples.length} examples from contentExamplesService`);
        }
      } catch (error) {
        console.error('📋 [PromptAssemblyAsync] Failed to fetch examples:', error.message);
        // Continue without examples on error
      }
    }
  }

  const mainUser = buildMainUserContent({
    examples: useExamples ? enrichedState.examples : [],
    knowledge: baseKnowledge,
    instructions: enrichedState.instructions,
    request: enrichedState.requestFormatted || enrichedState.request,
    toolInstructions: enrichedState.toolInstructions || [],
    constraints: enrichedState.constraints,
    formatting: enrichedState.formatting,
    taskInstructions: enrichedState.taskInstructions,
    outputFormat: enrichedState.outputFormat,
    locale: enrichedState.locale || 'de-DE'
  });
  if (mainUser) {
    console.log('📋 [PromptAssemblyAsync] Added main user content');
    messages.push({ role: 'user', content: mainUser });
  }

  if (effectiveDocuments.length > 0) {
    console.log(`📋 [PromptAssemblyAsync] Adding ${effectiveDocuments.length} effective documents`);
    messages.push({ role: 'user', content: buildDocumentBlocks(effectiveDocuments) });
  }

  const tools = Array.isArray(enrichedState.tools) ? [...enrichedState.tools] : [];
  console.log(`📋 [PromptAssemblyAsync] Completed with ${messages.length} messages, ${tools.length} tools`);

  // Add enrichment metadata to the result for route usage
  const result = { system, messages, tools };
  if (enrichedState.enrichmentMetadata) {
    result.enrichmentMetadata = enrichedState.enrichmentMetadata;
  }

  return result;
}

// URL detection and crawling is now handled by requestEnrichment.js

// Precompute Document QnA capsule for parallel execution
async function precomputeDocumentQnA(state) {
  try {
    if (!mistralClient) {
      console.log('📋 [DocQnA] Skipped: no provider client');
      return { knowledgeCapsule: null, suppressDocs: false };
    }
    const effectiveDocuments = Array.isArray(state.documents) ? state.documents : [];
    if (effectiveDocuments.length === 0) {
      console.log('📋 [DocQnA] Skipped: no documents');
      return { knowledgeCapsule: null, suppressDocs: false };
    }

    console.log(`📋 [DocQnA] Precompute start (docs=${effectiveDocuments.length})`);
    const rawDocs = effectiveDocuments.filter(d => d && d.type === 'document' && d.source);
    const urlList = [];
    for (const d of rawDocs) {
      const url = await uploadDocAndGetUrl(d);
      if (url) urlList.push(url);
    }

    if (urlList.length === 0) {
      console.log('📋 [DocQnA] No usable URLs (upload failed or unsupported)');
      return { knowledgeCapsule: null, suppressDocs: false };
    }

    const kinds = urlList.map(u => (typeof u === 'string' && u.startsWith('data:')) ? 'data' : (typeof u === 'string' && u.startsWith('http') ? 'http' : 'other'));
    console.log(`📋 [DocQnA] URLs prepared (count=${urlList.length}, kinds=${kinds.join(',')})`);
    if (kinds.every(k => k === 'data')) {
      console.log('⚠️ [DocQnA] All URLs are data: URIs; provider may reject them. Skipping DocQnA.');
      return { knowledgeCapsule: null, suppressDocs: false };
    }

    const capsule = await runDocumentQnA(state, urlList);
    if (capsule) {
      console.log('🧭 [DocQnA] Capsule ready');
      return { knowledgeCapsule: capsule, suppressDocs: true };
    }
    return { knowledgeCapsule: null, suppressDocs: false };
  } catch (e) {
    console.log('📋 [DocQnA] Precompute failed:', e?.message || e);
    return { knowledgeCapsule: null, suppressDocs: false };
  }
}

export { assemblePromptGraph, assemblePromptGraphAsync, precomputeDocumentQnA };