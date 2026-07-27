import { describe, expect, it } from 'vitest';

import {
  appendToDraft,
  buildConnectAttachment,
  buildWebpageAttachment,
  buildWolkeAttachment,
  canvaDesignsMarkdown,
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

describe('canvaDesignsMarkdown', () => {
  it('renders one link per design', () => {
    const markdown = canvaDesignsMarkdown([
      { id: '1', title: 'Plakat', viewUrl: 'https://canva.com/1' },
      { id: '2', title: 'Story', viewUrl: 'https://canva.com/2' },
    ]);

    expect(markdown).toBe('[🎨 Plakat](https://canva.com/1) [🎨 Story](https://canva.com/2)');
  });

  it('is empty for an empty pick, so nothing is appended', () => {
    expect(canvaDesignsMarkdown([])).toBe('');
  });
});

describe('appendToDraft', () => {
  it('separates from existing text with one space', () => {
    expect(appendToDraft('Schreib mir', '[x](y)')).toBe('Schreib mir [x](y) ');
  });

  it('does not double the space when the draft already ends in one', () => {
    expect(appendToDraft('Schreib mir ', '[x](y)')).toBe('Schreib mir [x](y) ');
  });

  it('adds no leading space to an empty draft', () => {
    expect(appendToDraft('', '[x](y)')).toBe('[x](y) ');
  });

  it('leaves the draft untouched when there is nothing to add', () => {
    expect(appendToDraft('Schreib mir', '')).toBe('Schreib mir');
  });
});
