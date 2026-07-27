import type { CanvaDesignToken, ConnectFileToken, WolkeFileToken } from './mentionables';

/**
 * Composer attachments for the typed `@` mentions — Nextcloud (Wolke),
 * connected accounts (Connect), and a plain web page.
 *
 * The backend recognises one of these ONLY by the exact triple of
 * `contentType`, the `gruenerator-mention` data part's name, and its `kind`.
 * Get any of them wrong and nothing errors: the attachment travels, the backend
 * does not recognise it, and the model answers without ever seeing the file.
 * That silence is why these live in one shared module with tests rather than
 * inline in each platform's composer.
 *
 * Canva is deliberately absent — a Canva pick is not an attachment but a
 * markdown link in the draft (`canvaDesignsMarkdown`), because a design is a
 * place to go rather than content to read.
 */

export interface MentionAttachment {
  id: string;
  type: 'document';
  name: string;
  contentType: string;
  content: [
    {
      type: 'data';
      name: 'gruenerator-mention';
      data: Record<string, unknown>;
    },
  ];
}

function mentionAttachment(
  id: string,
  name: string,
  contentType: string,
  data: Record<string, unknown>
): MentionAttachment {
  return {
    id,
    type: 'document',
    name,
    contentType,
    content: [{ type: 'data', name: 'gruenerator-mention', data }],
  };
}

/** A file from one of the user's Nextcloud share links. */
export function buildWolkeAttachment(file: WolkeFileToken): MentionAttachment {
  return mentionAttachment(
    `gruenerator-wolke-${file.shareLinkId}:${file.path}`,
    file.name,
    'application/x-gruenerator-wolke',
    { kind: 'wolke', shareLinkId: file.shareLinkId, path: file.path, name: file.name }
  );
}

/** A file from a connected account (Drive, OneDrive, …). */
export function buildConnectAttachment(file: ConnectFileToken): MentionAttachment {
  return mentionAttachment(
    `gruenerator-connect-${file.provider}:${file.fileId}`,
    file.name,
    'application/x-gruenerator-connect',
    {
      kind: 'connect',
      provider: file.provider,
      fileId: file.fileId,
      name: file.name,
      // Omitted rather than set to undefined: the data part is serialised, and
      // an explicit `mimeType: undefined` survives as a null on the wire.
      ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    }
  );
}

/** A web page the user pasted or picked. Named by host, since the full URL
 *  makes an unreadable chip. */
export function buildWebpageAttachment(url: string): MentionAttachment {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Not a parsable URL — the raw string is still the best label available.
  }
  return mentionAttachment(
    `gruenerator-webpage-${url}`,
    hostname,
    'application/x-gruenerator-webpage',
    { kind: 'webpage', url, name: hostname }
  );
}

/**
 * Chosen Canva designs as markdown links, ready to append to the draft. View
 * URLs stay valid for 30 days, so the link is a durable reference the user or
 * the agent can act on.
 */
export function canvaDesignsMarkdown(designs: readonly CanvaDesignToken[]): string {
  return designs.map((d) => `[🎨 ${d.title}](${d.viewUrl})`).join(' ');
}

/**
 * Append text to a composer draft with exactly one separating space — never a
 * double space, never a word glued to the previous one.
 */
export function appendToDraft(current: string, addition: string): string {
  if (!addition) return current;
  const needsSpace = current.length > 0 && !current.endsWith(' ');
  return `${current}${needsSpace ? ' ' : ''}${addition} `;
}
