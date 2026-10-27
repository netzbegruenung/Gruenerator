import { notebookSourceRefSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildNotebookSourceAttachment,
  NOTEBOOK_SOURCE_CONTENT_TYPE,
} from './documentMentionables';

/**
 * The model adapter recognises the chip only by its content type, the data
 * part's name and `kind`, and sends `ref` as `notebookSourceRefs` — which the
 * contract validates. A ref the contract rejects fails the whole request.
 */

const SYSTEM_REF = {
  collectionId: 'hamburg-system',
  sourceUrl: 'wolke://share-1/Beschluesse/hitze.pdf',
};
const USER_REF = {
  documentId: '0a5a1c3e-9a3e-4a8e-9a0c-1f2d3e4f5a6b',
  notebookId: 'b1c2d3e4-0000-4000-8000-000000000001',
};

describe('buildNotebookSourceAttachment', () => {
  it('carries the recognition triple', () => {
    const attachment = buildNotebookSourceAttachment(SYSTEM_REF, 'Hitzeschutz');

    expect(attachment.contentType).toBe(NOTEBOOK_SOURCE_CONTENT_TYPE);
    expect(attachment.content[0].name).toBe('gruenerator-mention');
    expect(attachment.content[0].data.kind).toBe('notebook-source');
  });

  it('passes the ref through unchanged, in a shape the contract accepts', () => {
    for (const ref of [SYSTEM_REF, USER_REF]) {
      const data = buildNotebookSourceAttachment(ref, 'Titel').content[0].data;
      expect(data.ref).toEqual(ref);
      expect(notebookSourceRefSchema.safeParse(data.ref).success).toBe(true);
    }
  });

  it('names the chip after the document', () => {
    expect(buildNotebookSourceAttachment(USER_REF, 'Wahlprogramm 2026').name).toBe(
      'Wahlprogramm 2026'
    );
  });

  it('gives one document one id, whichever notebook it was read through', () => {
    const a = buildNotebookSourceAttachment(USER_REF, 'A');
    const b = buildNotebookSourceAttachment({ ...USER_REF, notebookId: null }, 'A');
    expect(a.id).toBe(b.id);
    expect(buildNotebookSourceAttachment(SYSTEM_REF, 'A').id).toBe(
      'gruenerator-notebook-source-hamburg-system:wolke://share-1/Beschluesse/hitze.pdf'
    );
  });
});
