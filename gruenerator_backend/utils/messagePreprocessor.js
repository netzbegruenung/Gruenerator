// Message preprocessing helpers (skeleton) to keep worker adapters lean

function toOpenAICompatibleMessages({ systemPrompt, messages }) {
  const out = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  if (Array.isArray(messages)) {
    messages.forEach((msg) => {
      out.push({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(c => c.text || c.content || '').join('\n')
            : String(msg.content || '')
      });
    });
  }
  return out;
}

module.exports = { toOpenAICompatibleMessages };

