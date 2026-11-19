import { type WebsiteContent } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ aiObject: vi.fn() }));
vi.mock('../../ai/generate.js', () => ({ aiObject: mocks.aiObject }));

import { buildWebsiteSystemPrompt } from './prompt.js';
import { writeSiteContent } from './writeSiteContent.js';

const generated: WebsiteContent = {
  hero: { heading: 'Hallo', text: 'Kurz' },
  about: { title: 'Über mich', content: 'Text' },
  hero_image: { title: 'Slogan', subtitle: 'Untertitel' },
  themes: [{ title: 'Rad', content: 'Mehr Radwege' }],
  actions: [{ text: 'Mach mit', link: '#kontakt' }],
  contact: { title: 'Kontakt', email: 'erfunden@x.de' },
};

const base = { description: 'Ich bin …', hints: null, locale: 'de-DE' as const };

describe('writeSiteContent', () => {
  beforeEach(() => mocks.aiObject.mockReset());

  it('asks aiObject on the website lane with the content tool', async () => {
    mocks.aiObject.mockResolvedValue({ ok: true, data: generated });
    const signal = new AbortController().signal;
    await writeSiteContent({ ...base, email: '', signal });
    expect(mocks.aiObject).toHaveBeenCalledTimes(1);
    const call = mocks.aiObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toMatchObject({
      lane: 'website',
      toolName: 'create_site_content',
      temperature: 0.7,
      system: buildWebsiteSystemPrompt('de-DE'),
    });
    expect(call.signal).toBe(signal);
    expect(call).not.toHaveProperty('pinned');
  });

  it('writes the given e-mail into the contact block', async () => {
    mocks.aiObject.mockResolvedValue({ ok: true, data: generated });
    const signal = new AbortController().signal;
    const withMail = await writeSiteContent({ ...base, email: 'echt@y.de', signal });
    const withoutMail = await writeSiteContent({ ...base, email: '', signal });
    expect(withMail.ok && withMail.data.contact.email).toBe('echt@y.de');
    expect(withoutMail.ok && withoutMail.data.contact.email).toBe('');
  });

  it('passes a failed result through unchanged', async () => {
    const failed = { ok: false, error: 'x' };
    mocks.aiObject.mockResolvedValue(failed);
    const result = await writeSiteContent({
      ...base,
      email: '',
      signal: new AbortController().signal,
    });
    expect(result).toBe(failed);
  });
});
