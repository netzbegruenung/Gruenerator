import { describe, expect, it } from 'vitest';

import {
  ROLE_BLOCK_END,
  ROLE_BLOCK_START,
  generateProfilePrompt,
  mergeRoleBlock,
} from './rolePromptGeneration';

describe('generateProfilePrompt', () => {
  it('returns an empty string for no roles', () => {
    expect(generateProfilePrompt([], false)).toBe('');
  });

  it('names the Austrian party for AT users', () => {
    const prompt = generateProfilePrompt([{ rolle: 'Gemeinderät*in' }], true);
    expect(prompt).toContain('Die Grünen – Die Grüne Alternative');
    expect(prompt).not.toContain('Bündnis 90');
  });

  it('folds gliederung, bundesland, abgeordnete and instructions into the line', () => {
    const prompt = generateProfilePrompt(
      [
        {
          rolle: 'Mitarbeiter*in MdB-Büro',
          gliederung: 'KV Köln',
          bundesland: 'Nordrhein-Westfalen',
          abgeordnete: 'Katharina Dröge',
          instructions: 'Immer mit Zitat.',
        },
      ],
      false
    );
    expect(prompt).toContain(
      '- Mitarbeiter*in MdB-Büro, KV Köln, Nordrhein-Westfalen, (Katharina Dröge)'
    );
    expect(prompt).toContain('Hinweis: Immer mit Zitat.');
  });
});

describe('mergeRoleBlock', () => {
  const block = 'Du unterstützt eine*n Mitarbeiter*in …';

  it('writes only the fenced block when there is no free text', () => {
    const result = mergeRoleBlock('', block);
    expect(result).toBe(`${ROLE_BLOCK_START}\n${block}\n${ROLE_BLOCK_END}`);
  });

  it('keeps hand-written instructions and appends the block', () => {
    const result = mergeRoleBlock('Duze die Leser*innen.', block);
    expect(result).toContain('Duze die Leser*innen.');
    expect(result).toContain(block);
    expect(result.indexOf('Duze')).toBeLessThan(result.indexOf(ROLE_BLOCK_START));
  });

  it('replaces an existing block instead of nesting a second one', () => {
    const first = mergeRoleBlock('Duze die Leser*innen.', block);
    const second = mergeRoleBlock(first, 'Neuer Rollenblock');

    expect(second.match(new RegExp(ROLE_BLOCK_START, 'g'))).toHaveLength(1);
    expect(second).toContain('Duze die Leser*innen.');
    expect(second).toContain('Neuer Rollenblock');
    expect(second).not.toContain(block);
  });

  it('preserves free text written after the block', () => {
    const withTail = `${ROLE_BLOCK_START}\n${block}\n${ROLE_BLOCK_END}\n\nSchreibe knapp.`;
    const result = mergeRoleBlock(withTail, 'Neuer Rollenblock');
    expect(result).toContain('Schreibe knapp.');
    expect(result).toContain('Neuer Rollenblock');
  });

  it('removes the block but keeps the free text when the last role is deleted', () => {
    const first = mergeRoleBlock('Duze die Leser*innen.', block);
    expect(mergeRoleBlock(first, '')).toBe('Duze die Leser*innen.');
  });

  it('treats null/undefined as empty', () => {
    expect(mergeRoleBlock(null, '')).toBe('');
    expect(mergeRoleBlock(undefined, block)).toContain(block);
  });

  it('drops a stray lone marker rather than nesting fences', () => {
    const broken = `Freitext\n${ROLE_BLOCK_START}\nhalb geschrieben`;
    const result = mergeRoleBlock(broken, block);
    expect(result.match(new RegExp(ROLE_BLOCK_START, 'g'))).toHaveLength(1);
    expect(result).toContain('Freitext');
  });
});
