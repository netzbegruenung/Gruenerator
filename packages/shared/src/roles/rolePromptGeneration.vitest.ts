import { describe, expect, it } from 'vitest';

import {
  ROLE_BLOCK_END,
  ROLE_BLOCK_START,
  buildRoleDescription,
  stripRoleBlock,
} from './rolePromptGeneration';

describe('buildRoleDescription', () => {
  it('names the level, the role and the optional fields', () => {
    const description = buildRoleDescription(
      {
        rolle: 'Mitarbeiter*in MdB-Büro',
        gliederung: 'KV Köln',
        bundesland: 'Nordrhein-Westfalen',
        abgeordnete: 'Katharina Dröge',
        instructions: 'Immer mit Zitat.',
      },
      'Kreisverband',
      false
    );

    expect(description).toContain('Ebene: Kreisverband');
    expect(description).toContain('Rolle: Mitarbeiter*in MdB-Büro');
    expect(description).toContain('Kreisverband: KV Köln');
    expect(description).toContain('Abgeordnete*r: Katharina Dröge');
    expect(description).toContain('Zusätzliche Anweisungen: Immer mit Zitat.');
    expect(description).not.toContain('Österreich');
  });

  it('adds the Austrian country line for AT users', () => {
    const description = buildRoleDescription({ rolle: 'Gemeinderät*in' }, 'Gemeinde', true);
    expect(description).toContain('Land: Österreich (Die Grünen – Die Grüne Alternative)');
  });

  it('omits lines for fields the role does not carry', () => {
    expect(buildRoleDescription({ rolle: 'Ratsmitglied' }, 'Ortsverband', false)).toBe(
      'Ebene: Ortsverband\nRolle: Ratsmitglied'
    );
  });
});

describe('stripRoleBlock', () => {
  const fenced = (block: string) => `${ROLE_BLOCK_START}\n${block}\n${ROLE_BLOCK_END}`;

  it('removes the fenced block including its content', () => {
    const stored = `Duze die Leser*innen.\n\n${fenced('Rollen bei Bündnis 90/Die Grünen:\n\n- Ratsmitglied')}`;
    const result = stripRoleBlock(stored);

    expect(result).toBe('Duze die Leser*innen.');
    expect(result).not.toContain('Ratsmitglied');
    expect(result).not.toContain('<!--');
  });

  it('keeps free text written after the block', () => {
    const stored = `${fenced('- Ratsmitglied')}\n\nSchreibe knapp.`;
    expect(stripRoleBlock(stored)).toBe('Schreibe knapp.');
  });

  // Vor dem Markerformat hat der Rollen-Wizard die ganze Spalte überschrieben —
  // dieser Bestand trägt keinen Zaun, muss aber genauso verschwinden.
  it('removes the legacy unfenced role prose', () => {
    const legacy = [
      'Du unterstützt eine*n Mitarbeiter*in von Bündnis 90/Die Grünen mit folgenden Rollen:',
      '',
      '- Mitarbeiter*in MdB-Büro, KV Köln',
      '  Hinweis: Immer mit Zitat.',
      '',
      'Passe deine Antworten an die jeweils relevante Rolle an. Berücksichtige die Zuständigkeiten und die Ebene bei Stil, Detailtiefe und Zielgruppe.',
    ].join('\n');

    expect(stripRoleBlock(legacy)).toBe('');
    expect(stripRoleBlock(`${legacy}\n\nSchreibe knapp.`)).toBe('Schreibe knapp.');
  });

  it('handles repeated legacy prefixes in linear passes', () => {
    const repeatedPrefix = 'Du unterstützt eine*n Mitarbeiter*in von '.repeat(100);

    expect(stripRoleBlock(`${repeatedPrefix}eigener Text`)).toContain('eigener Text');
  });

  it('leaves hand-written text untouched apart from trimming', () => {
    expect(stripRoleBlock('  Schreibe knapp.  ')).toBe('Schreibe knapp.');
    expect(stripRoleBlock('Meine Rollen sind mir wichtig.')).toBe('Meine Rollen sind mir wichtig.');
  });

  it('treats null/undefined as empty so the caller can fall back', () => {
    expect(stripRoleBlock(null)).toBe('');
    expect(stripRoleBlock(undefined)).toBe('');
    expect(stripRoleBlock('   ')).toBe('');
  });

  it('removes a stray lone marker too', () => {
    expect(stripRoleBlock(`Freitext\n${ROLE_BLOCK_START}`)).toBe('Freitext');
  });

  it('collapses the gap the removed block leaves behind', () => {
    const stored = `Freitext.\n\n${fenced('- Ratsmitglied')}\n\nMehr Freitext.`;
    expect(stripRoleBlock(stored)).toBe('Freitext.\n\nMehr Freitext.');
  });
});
