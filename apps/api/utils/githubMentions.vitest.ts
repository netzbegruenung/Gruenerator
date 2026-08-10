import { describe, expect, it } from 'vitest';

import { neutralizeGithubMentions } from './githubMentions.js';

describe('neutralizeGithubMentions', () => {
  it('entschärft die Erwähnung, die den Vorfall ausgelöst hat', () => {
    const docQuote =
      'tippe die @-Erwähnung, z. B. @berlin, @mv, @hessen oder @saar. Der Chat zieht dann seine Antworten aus diesem Notebook.';
    const out = neutralizeGithubMentions(docQuote);

    for (const name of ['berlin', 'mv', 'hessen', 'saar']) {
      expect(out).not.toContain(`@${name}`);
      expect(out).toContain(`@<!---->${name}`);
    }
  });

  it('lässt ein alleinstehendes @ in Ruhe — es erwähnt niemanden', () => {
    expect(neutralizeGithubMentions('die @-Erwähnung')).toBe('die @-Erwähnung');
  });

  it('fasst Code-Spans nicht an, weil GitHub darin nicht verlinkt', () => {
    expect(neutralizeGithubMentions('nutze `@saar` im Chat')).toBe('nutze `@saar` im Chat');
  });

  it('entschärft außerhalb eines Code-Spans weiter', () => {
    expect(neutralizeGithubMentions('`@saar` und @berlin')).toBe('`@saar` und @<!---->berlin');
  });

  it('entschärft bei unpaarigem Backtick lieber einmal zu viel', () => {
    expect(neutralizeGithubMentions('kaputt ` @saar')).toContain('@<!---->saar');
  });

  it('erwischt auch Team-Erwähnungen', () => {
    expect(neutralizeGithubMentions('@netzbegruenung/team')).toBe('@<!---->netzbegruenung/team');
  });

  it('lässt Text ohne Erwähnungen unverändert', () => {
    const text = 'Die Doku sagt, dass 9 Quellen existieren — der Code zeigt 11.';
    expect(neutralizeGithubMentions(text)).toBe(text);
  });
});
