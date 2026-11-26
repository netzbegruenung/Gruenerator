/**
 * The recipe `sharepic-gestalten` names buttons and menus of the chat client.
 * A renamed button would leave the model sending people to a label that no
 * longer exists, so each name is read back from the client's source here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILLS } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { CODE_RECIPE_BODIES, isCodeRecipeAvailable } from './codeRecipes.js';
import { buildSharepicDesignGuide } from './sharepicDesignGuide.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = (path: string) => readFileSync(join(repo, path), 'utf8');

const UI_NAMES: [label: string, file: string][] = [
  ['Im Chat bearbeiten', 'packages/chat/src/components/message-parts/SharepicVariantCard.tsx'],
  ['Studio', 'packages/chat/src/components/message-parts/SharepicVariantCard.tsx'],
  ['Herunterladen', 'packages/chat/src/components/message-parts/SharepicVariantCard.tsx'],
  ['Wiederherstellen', 'packages/chat/src/components/message-parts/SharepicVariantCard.tsx'],
  ['Als {label}', 'packages/chat/src/components/message-parts/SharepicVariantStack.tsx'],
  ["title: 'Sharepic-Vorlage'", 'packages/chat/src/lib/mentionables.ts'],
  ['Im Chat erstellen', 'apps/web/src/features/vorlagen/components/SharepicVorlageDialog.tsx'],
  ["'Überarbeitet'", 'apps/api/routes/chat/services/sharepicCreatorVariant.ts'],
];

describe('recipe sharepic-gestalten', () => {
  it('is a system recipe with a code body that is always available', () => {
    expect(SKILLS.some((s) => s.mention === 'sharepic-gestalten')).toBe(true);
    expect(CODE_RECIPE_BODIES['sharepic-gestalten']).toBeDefined();
    expect(isCodeRecipeAvailable('sharepic-gestalten', { kinds: [] })).toBe(true);
  });

  it.each(UI_NAMES)('names „%s“, which the client still shows', (label, file) => {
    expect(source(file)).toContain(label);
  });

  it('takes forms and CD colours from the registers', () => {
    const body = buildSharepicDesignGuide();
    expect(body).toContain('Formen: Einzelbild, Zitat, Karussell');
    expect(body).toContain('Deutschland: Tanne, Dunkeltanne, Grasgrün, Mint');
    expect(body).toContain('Österreich: Dunkelgrün, Hellgrün, Weiß');
  });
});
