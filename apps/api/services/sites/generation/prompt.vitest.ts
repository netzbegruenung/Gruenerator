import { describe, expect, it } from 'vitest';

import { PARTY_NAMES } from '../../localization/index.js';

import { actionLinksFor, buildWebsiteSystemPrompt, buildWebsiteUserPrompt } from './prompt.js';

describe('buildWebsiteSystemPrompt', () => {
  it('adds the Austrian block only for de-AT', () => {
    const at = buildWebsiteSystemPrompt('de-AT');
    const de = buildWebsiteSystemPrompt('de-DE');
    expect(at).toContain('## LÄNDERKONTEXT: ÖSTERREICH');
    expect(at).toContain(PARTY_NAMES['de-AT']);
    expect(de).not.toContain('## LÄNDERKONTEXT: ÖSTERREICH');
    expect(de).not.toContain('{{');
    expect(de).toContain(PARTY_NAMES['de-DE']);
  });

  it('lists exactly the allowed action links of the locale', () => {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      const prompt = buildWebsiteSystemPrompt(locale);
      for (const link of actionLinksFor(locale)) expect(prompt).toContain(link);
    }
    expect(buildWebsiteSystemPrompt('de-AT')).not.toContain('gruene.de');
    expect(actionLinksFor('de-DE')).not.toContain('#spenden');
  });

  it('never puts an e-mail address into the prompt', () => {
    expect(buildWebsiteSystemPrompt('de-DE')).not.toMatch(/@/);
    expect(buildWebsiteSystemPrompt('de-AT')).not.toMatch(/@/);
  });
});

describe('buildWebsiteUserPrompt', () => {
  it('carries flyer hints and omits the line without them', () => {
    const withHints = buildWebsiteUserPrompt('Ich bin …', { themes: ['Rad'], slogans: ['Mut'] });
    expect(withHints).toContain('Rad');
    expect(withHints).toContain('Mut');
    expect(buildWebsiteUserPrompt('Ich bin …', null)).not.toContain('Schwerpunkte');
  });
});
