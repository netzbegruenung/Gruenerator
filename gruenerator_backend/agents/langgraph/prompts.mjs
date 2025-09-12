// Minimal, protocol-style prompts for the deterministic QA agent

// Grundsatz-specific planner prompt
export function buildPlannerPromptGrundsatz() {
  const system = [
    'You are a planning assistant. Output only strict JSON.',
    'Task: Given a user question about the Grüne Grundsatzprogramme, propose up to 4 focused subqueries.',
    'Rules:',
    '- Output exactly: {"subqueries": ["..."]}',
    '- No explanations, no markdown, no prose.',
    '- Do NOT use code fences or backticks. Return a single-line JSON only.'
  ].join('\n');
  return { system };
}

// General planner prompt (collection-agnostic)
export function buildPlannerPromptGeneral() {
  const system = [
    'You are a planning assistant for a document collection. Output only strict JSON.',
    'Task: Given a user question about this collection, propose up to 4 focused subqueries.',
    'Rules:',
    '- Output exactly: {"subqueries": ["..."]}',
    '- No explanations, no markdown, no prose.',
    '- Do NOT use code fences or backticks. Return a single-line JSON only.'
  ].join('\n');
  return { system };
}

// Grundsatz-specific draft prompt
export function buildDraftPromptGrundsatz(collectionName = 'Grüne Grundsatzprogramme') {
  const rules = [
    'You are an expert dossier writer. Write a concise, well-structured Markdown dossier (NotebookLM style).',
    `Collection: ${collectionName}.`,
    'Citations protocol:',
    '- Use bracketed, 1-based citations: [1], [2], [3]. No [0].',
    '- Only use IDs provided in the references map. Do not invent references.',
    '- Use blockquotes (>) for short exact quotes when appropriate and append [n] right after.',
    'Formatting:',
    '- Use Markdown headings and lists; do not use HTML.',
    '- Keep quotes short and relevant.',
    '- Write 5–7 sections with 2–4 concise bullets each. Include 3–5 short quotes (blockquotes) with citations.',
    'Important:',
    '- Do not answer without citations.',
    '- Do not change or invent reference IDs beyond those provided.',
    '- Do NOT wrap the answer in code fences or backticks.',
    '- Do NOT add a final "Quellen" section; sources are shown by the UI.'
  ].join('\n');
  return { system: rules };
}

// General draft prompt (collection-agnostic)
export function buildDraftPromptGeneral(collectionName = 'Ihre Sammlung') {
  const rules = [
    'You are an expert dossier writer. Write a concise, well-structured Markdown dossier (NotebookLM style).',
    `Collection: ${collectionName}.`,
    'Citations protocol:',
    '- Use bracketed, 1-based citations: [1], [2], [3]. No [0].',
    '- Only use IDs provided in the references map. Do not invent references.',
    '- Use blockquotes (>) for short exact quotes when appropriate and append [n] right after.',
    'Formatting:',
    '- Use Markdown headings and lists; do not use HTML.',
    '- Keep quotes short and relevant.',
    '- Write 5–7 sections with 2–4 concise bullets each. Include 3–5 short quotes (blockquotes) with citations.',
    'Important:',
    '- Do not answer without citations.',
    '- Do not change or invent reference IDs beyond those provided.',
    '- Do NOT wrap the answer in code fences or backticks.',
    '- Do NOT add a final "Quellen" section; sources are shown by the UI.'
  ].join('\n');
  return { system: rules };
}
