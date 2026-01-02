interface TemplateData {
  preserveName?: boolean;
  thema?: string;
  [key: string]: unknown;
}

/**
 * Replace placeholders in template strings with data values
 * Supports conditionals like {{#if preserveName}}...{{else}}...{{/if}}
 */
export function replaceTemplate(template: string | null | undefined, data: TemplateData): string {
  if (!template || typeof template !== 'string') {
    return template ?? '';
  }

  let result = template;

  if (result.includes('{{#if preserveName}}')) {
    const preserveNameRegex = /\{\{#if preserveName\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/;
    const match = result.match(preserveNameRegex);
    if (match) {
      const preserveBranch = match[1];
      const nonPreserveBranch = match[2];
      result = result.replace(match[0], data.preserveName ? preserveBranch : nonPreserveBranch);
    }
  }

  if (result.includes('{{#if thema}}')) {
    const themaRegex = /\{\{#if thema\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/;
    const match = result.match(themaRegex);
    if (match) {
      const themaBranch = match[1];
      const fallbackBranch = match[2];
      result = result.replace(match[0], data.thema ? themaBranch : fallbackBranch);
    }
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
