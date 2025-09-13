"use strict";

function buildSystemText({ systemRole, toolInstructions = [], constraints = null, formatting = null }) {
  if (!systemRole) throw new Error("System role is required");
  const parts = [systemRole];
  if (toolInstructions && toolInstructions.length > 0) {
    parts.push("\n" + toolInstructions.join(" "));
  }
  if (constraints) parts.push("\n" + constraints);
  if (formatting) parts.push("\n" + formatting);
  return parts.join("");
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
      blocks.push({ type: "text", text: doc.source.text });
    }
  }
  return blocks;
}

function formatExamples(examples = []) {
  if (!Array.isArray(examples) || examples.length === 0) return "";
  let out = "<examples>\nBEISPIEL:\n";
  for (const ex of examples) {
    if (ex && ex.content) out += `${ex.content}\n`;
  }
  out += "</examples>";
  return out;
}

function formatRequestObject(request) {
  const parts = [];
  if (request.theme || request.thema) parts.push(`Thema: ${request.theme || request.thema}`);
  if (request.details) parts.push(`Details: ${request.details}`);
  if (Array.isArray(request.platforms) && request.platforms.length) parts.push(`Plattformen: ${request.platforms.join(", ")}`);
  if (request.zitatgeber) parts.push(`Zitatgeber: ${request.zitatgeber}`);
  if (request.textForm) parts.push(`Textform: ${request.textForm}`);
  for (const [k, v] of Object.entries(request)) {
    if (["theme", "thema", "details", "platforms", "zitatgeber", "textForm"].includes(k)) continue;
    if (v) parts.push(`${k}: ${v}`);
  }
  return parts.join("\n");
}

function buildMainUserContent({ examples = [], knowledge = [], instructions = null, request = null }) {
  const parts = [];
  const ex = formatExamples(examples);
  if (ex) parts.push(ex);
  if (Array.isArray(knowledge) && knowledge.length > 0) parts.push(`<knowledge>\n${knowledge.join("\n\n")}\n</knowledge>`);
  if (instructions) parts.push(`<instructions>\n${instructions}\n</instructions>`);
  if (request) {
    let txt;
    if (typeof request === "string") txt = request;
    else txt = formatRequestObject(request);
    parts.push(`<request>\n${txt}\n</request>`);
  }
  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

function assemblePromptGraph(state) {
  const system = buildSystemText({
    systemRole: state.systemRole,
    toolInstructions: state.toolInstructions || [],
    constraints: state.constraints,
    formatting: state.formatting
  });

  const messages = [];
  const docBlocks = buildDocumentBlocks(state.documents);
  if (docBlocks && docBlocks.length > 0) messages.push({ role: "user", content: docBlocks });

  const mainUser = buildMainUserContent({
    examples: state.examples,
    knowledge: state.knowledge,
    instructions: state.instructions,
    request: state.request
  });
  if (mainUser) messages.push({ role: "user", content: mainUser });

  const tools = Array.isArray(state.tools) ? [...state.tools] : [];
  return { system, messages, tools };
}

module.exports = { assemblePromptGraph };

