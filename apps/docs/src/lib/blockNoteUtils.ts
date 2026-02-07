import type { BlockNoteEditor, Block } from '@blocknote/core';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
}

export async function blocksToHTML(editor: BlockNoteEditor): Promise<string> {
  try {
    const blocks = editor.document;
    const html = await editor.blocksToHTMLLossy(blocks);
    return html;
  } catch (error) {
    console.error('[blocksToHTML] Error converting blocks:', error);
    return '';
  }
}

export async function blocksToMarkdown(editor: BlockNoteEditor): Promise<string> {
  try {
    const blocks = editor.document;
    const markdown = await editor.blocksToMarkdownLossy(blocks);
    return markdown;
  } catch (error) {
    console.error('[blocksToMarkdown] Error converting blocks:', error);
    return blocksToPlainText(editor.document);
  }
}

export function blocksToPlainText(blocks: Block[]): string {
  let text = '';

  for (const block of blocks) {
    if (block.content && Array.isArray(block.content)) {
      for (const inline of block.content) {
        if (inline.type === 'text') {
          text += inline.text;
        } else if (inline.type === 'link') {
          if (inline.content && Array.isArray(inline.content)) {
            for (const linkContent of inline.content) {
              if (linkContent.type === 'text') {
                text += linkContent.text;
              }
            }
          }
        }
      }
    }

    text += '\n';

    if (block.children && block.children.length > 0) {
      text += blocksToPlainText(block.children);
    }
  }

  return text.trim();
}

export async function htmlToBlocks(editor: BlockNoteEditor, html: string): Promise<Block[]> {
  try {
    const blocks = await editor.tryParseHTMLToBlocks(html);
    return blocks;
  } catch (error) {
    console.error('[htmlToBlocks] Error parsing HTML:', error);
    return [];
  }
}

export async function markdownToBlocks(editor: BlockNoteEditor, markdown: string): Promise<Block[]> {
  try {
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    return blocks;
  } catch (error) {
    console.error('[markdownToBlocks] Error parsing markdown:', error);
    return [];
  }
}

export function getEditorText(editor: BlockNoteEditor): string {
  const blocks = editor.document;
  return blocksToPlainText(blocks);
}

export function isEditorEmpty(editor: BlockNoteEditor): boolean {
  const blocks = editor.document;

  if (blocks.length === 0) return true;
  if (blocks.length === 1) {
    const firstBlock = blocks[0];
    if (!firstBlock.content || !Array.isArray(firstBlock.content)) {
      return true;
    }
    if (firstBlock.content.length === 0) {
      return true;
    }
    const text = blocksToPlainText([firstBlock]);
    return text.trim().length === 0;
  }

  return false;
}

export async function handleImageUpload(
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  if (!file) {
    throw new Error('No file provided');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum allowed (${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
  }

  for (let progress = 0; progress <= 100; progress += 10) {
    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    onProgress?.({ progress });
  }

  return '/images/tiptap-ui-placeholder-image.jpg';
}
