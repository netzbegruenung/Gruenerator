import {
  buildSiteSnapshot,
  siteDraftToSnapshotSource,
  type Site,
  type SiteLegalDraft,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { BASE_DRAFT } from '../../draft/testDoc';

import { publishState } from './publishState';

const LEGAL: SiteLegalDraft = {
  name: 'Anna Beispiel',
  street: 'Musterweg 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

function site(over: Partial<Site>): Site {
  return {
    id: 's1',
    subdomain: 'anna',
    is_published: false,
    legal: LEGAL,
    published_snapshot: null,
    ...over,
  } as Site;
}

function snapshotOf(draft = BASE_DRAFT) {
  const built = buildSiteSnapshot(siteDraftToSnapshotSource(draft, LEGAL), 'de-DE');
  if (!built.ok) throw new Error('fixture invalid');
  return built.snapshot;
}

describe('publishState', () => {
  it('is unpublished when is_published is false', () => {
    const r = publishState({ draft: BASE_DRAFT, site: site({}), locale: 'de-DE' });
    expect(r.status).toBe('unpublished');
    expect(r.issues).toEqual([]);
  });

  it('is live when the draft matches the published snapshot', () => {
    const r = publishState({
      draft: BASE_DRAFT,
      site: site({ is_published: true, published_snapshot: snapshotOf() }),
      locale: 'de-DE',
    });
    expect(r.status).toBe('live');
  });

  it('is changed after a title change', () => {
    const r = publishState({
      draft: { ...BASE_DRAFT, site_title: 'Anderer Titel' },
      site: site({ is_published: true, published_snapshot: snapshotOf() }),
      locale: 'de-DE',
    });
    expect(r.status).toBe('changed');
  });

  it('is changed when a published site has no snapshot', () => {
    const r = publishState({
      draft: BASE_DRAFT,
      site: site({ is_published: true }),
      locale: 'de-DE',
    });
    expect(r.status).toBe('changed');
  });

  it('issues contain legal.name when the Impressum name is empty', () => {
    const r = publishState({
      draft: BASE_DRAFT,
      site: site({ legal: { ...LEGAL, name: '' } }),
      locale: 'de-DE',
    });
    expect(r.issues.map((i) => i.path)).toContain('legal.name');
  });
});
