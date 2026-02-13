interface ContentObject {
  social?: { content?: string; [key: string]: unknown };
  content?: string;
  text?: string;
  sharepic?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
}

export type Content = string | ContentObject | null | undefined;

// Extract the editable text from mixed or plain content
export const extractEditableText = (content: Content): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (content?.social?.content && typeof content.social.content === 'string')
      return content.social.content;
    if (typeof content.content === 'string') return content.content;
    if (typeof content.text === 'string') return content.text;
  }
  return '';
};
