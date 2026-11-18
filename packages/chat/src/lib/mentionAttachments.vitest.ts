import { describe, expect, it } from 'vitest';

import {
  buildConnectAttachment,
  buildWebpageAttachment,
  buildWolkeAttachment,
  normalizeWebpageUrl,
} from './mentionAttachments';

/**
 * The backend recognises a typed mention only by `contentType` + the data
 * part's name + its `kind`. None of the three produces an error when wrong —
 * the attachment simply travels unrecognised and the model answers without the
 * file. These assertions are that contract written down.
 */

describe('buildWolkeAttachment', () => {
  const file = { shareLinkId: 'share-1', path: '/Wahlkampf/plan.md', name: 'plan.md' };

  it('carries the recognition triple', () => {
    const attachment = buildWolkeAttachment(file);

    expect(attachment.contentType).toBe('application/x-gruenerator-wolke');
    expect(attachment.content[0].name).toBe('gruenerator-mention');
    expect(attachment.content[0].data.kind).toBe('wolke');
  });

  it('identifies the file by share link and path', () => {
    expect(buildWolkeAttachment(file).id).toBe('gruenerator-wolke-share-1:/Wahlkampf/plan.md');
  });

  it('names the chip after the file, not the path', () => {
    expect(buildWolkeAttachment(file).name).toBe('plan.md');
  });

  it('passes share link and path through for the backend to fetch with', () => {
    expect(buildWolkeAttachment(file).content[0].data).toEqual({
      kind: 'wolke',
      shareLinkId: 'share-1',
      path: '/Wahlkampf/plan.md',
      name: 'plan.md',
    });
  });
});

describe('buildConnectAttachment', () => {
  const file = { provider: 'google-drive', fileId: 'abc123', name: 'Konzept.docx' };

  it('carries the recognition triple', () => {
    const attachment = buildConnectAttachment(file);

    expect(attachment.contentType).toBe('application/x-gruenerator-connect');
    expect(attachment.content[0].name).toBe('gruenerator-mention');
    expect(attachment.content[0].data.kind).toBe('connect');
  });

  it('identifies the file by provider and id, since ids repeat across providers', () => {
    expect(buildConnectAttachment(file).id).toBe('gruenerator-connect-google-drive:abc123');
  });

  it('includes the mime type when there is one', () => {
    const attachment = buildConnectAttachment({ ...file, mimeType: 'application/pdf' });

    expect(attachment.content[0].data.mimeType).toBe('application/pdf');
  });

  // An explicit `mimeType: undefined` survives JSON as a missing-vs-null
  // difference the backend should never have to reason about.
  it('omits the key entirely when there is none', () => {
    expect('mimeType' in buildConnectAttachment(file).content[0].data).toBe(false);
  });
});

describe('buildWebpageAttachment', () => {
  it('names the chip after the host, since a full URL is an unreadable label', () => {
    const attachment = buildWebpageAttachment('https://gruenerator.eu/a/b?c=1');

    expect(attachment.name).toBe('gruenerator.eu');
    expect(attachment.content[0].data.url).toBe('https://gruenerator.eu/a/b?c=1');
  });

  it('falls back to the raw string when it does not parse as a URL', () => {
    const attachment = buildWebpageAttachment('kein-url');

    expect(attachment.name).toBe('kein-url');
    expect(attachment.content[0].data.kind).toBe('webpage');
  });
});

// ---------------------------------------------------------------------------
// Zwei Oberflächen tippen jetzt eine URL von Hand ein (Web-Popover, mobiles
// Sheet). Die Normalisierung liegt deshalb hier und nicht in einer der beiden.
// ---------------------------------------------------------------------------
describe('normalizeWebpageUrl', () => {
  it('completes a missing scheme', () => {
    expect(normalizeWebpageUrl('tagesschau.de/inland')).toBe('https://tagesschau.de/inland');
  });

  it('keeps an explicit scheme, http included', () => {
    expect(normalizeWebpageUrl('http://example.org/a')).toBe('http://example.org/a');
  });

  it('rejects what is not an http(s) address', () => {
    // Ohne Punkt ist es ein Wort, kein Host — sonst würde „zusammenfassen“ zu
    // https://zusammenfassen und der Anhang zeigte auf nichts.
    expect(normalizeWebpageUrl('zusammenfassen')).toBeNull();
    expect(normalizeWebpageUrl('  ')).toBeNull();
    expect(normalizeWebpageUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeWebpageUrl('file:///etc/passwd')).toBeNull();
  });

  it('feeds buildWebpageAttachment a chip named by host', () => {
    const url = normalizeWebpageUrl('www.tagesschau.de/inland/x');
    expect(url).not.toBeNull();
    expect(buildWebpageAttachment(url!).name).toBe('www.tagesschau.de');
  });
});
