interface TemplateData {
  preserveName?: boolean;
  thema?: string;
  [key: string]: unknown;
}

const MAX_TEMPLATE_LENGTH = 50000;

function parseConditional(text: string, startTag: string, elseTag: string, endTag: string): { fullMatch: string; trueBranch: string; falseBranch: string } | null {
  const startIdx = text.indexOf(startTag);
  if (startIdx === -1) return null;

  const elseIdx = text.indexOf(elseTag, startIdx + startTag.length);
  if (elseIdx === -1) return null;

  const endIdx = text.indexOf(endTag, elseIdx + elseTag.length);
  if (endIdx === -1) return null;

  return {
    fullMatch: text.slice(startIdx, endIdx + endTag.length),
    trueBranch: text.slice(startIdx + startTag.length, elseIdx),
    falseBranch: text.slice(elseIdx + elseTag.length, endIdx),
  };
}

/**
 * Replace placeholders in template strings with data values
 * Supports conditionals like {{#if preserveName}}...{{else}}...{{/if}}
 */
export function replaceTemplate(template: string | null | undefined, data: TemplateData): string {
  if (!template || typeof template !== 'string') {
    return template ?? '';
  }

  if (template.length > MAX_TEMPLATE_LENGTH) {
    return template.slice(0, MAX_TEMPLATE_LENGTH);
  }

  let result = template;

  const preserveNameConditional = parseConditional(result, '{{#if preserveName}}', '{{else}}', '{{/if}}');
  if (preserveNameConditional) {
    result = result.replace(
      preserveNameConditional.fullMatch,
      data.preserveName ? preserveNameConditional.trueBranch : preserveNameConditional.falseBranch
    );
  }

  const themaConditional = parseConditional(result, '{{#if thema}}', '{{else}}', '{{/if}}');
  if (themaConditional) {
    result = result.replace(
      themaConditional.fullMatch,
      data.thema ? themaConditional.trueBranch : themaConditional.falseBranch
    );
  }

  result = result.replace(/\{\{([^#/}][^}]*)\}\}/g, (match, key) => {
    const cleanKey = key.trim();

    if (cleanKey.includes('|default:')) {
      const [actualKey, defaultValue] = cleanKey.split('|default:');
      const value = data[actualKey.trim()];
      return value !== undefined && value !== null && value !== ''
        ? String(value)
        : defaultValue.replace(/'/g, '');
    }

    const value = data[cleanKey];
    return value !== undefined ? String(value) : '';
  });

  return result;
}
