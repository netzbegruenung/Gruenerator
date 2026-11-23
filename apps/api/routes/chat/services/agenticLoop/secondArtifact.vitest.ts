import { describe, expect, it } from 'vitest';

import { createSecondArtifactGate, secondArtifactTools } from './secondArtifact.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

const MOUNTED = ['gruenerator_search', 'sharepic', 'create_presentation', 'create_sheet'];
const state = (s: Partial<ChatGraphState>) => s as ChatGraphState;
const sharepicMade = state({ sharepicVariants: [{} as never] });
const deckMade = state({ createdDocument: {} as never });
const steps = (n: number, toolName = 'gruenerator_search') =>
  Array.from({ length: n }, () => ({ content: [{ type: 'tool-result', toolName }] }));

describe('secondArtifactTools', () => {
  it('offers the tools of the free slots after a sharepic (#5957)', () => {
    expect(secondArtifactTools(sharepicMade, MOUNTED)).toEqual([
      'create_presentation',
      'create_sheet',
    ]);
  });

  it('never offers the slot that is taken: no second sharepic, no second document', () => {
    expect(secondArtifactTools(sharepicMade, MOUNTED)).not.toContain('sharepic');
    // createdDocument is one field for every document kind: a sheet after a deck
    // would overwrite it.
    expect(secondArtifactTools(deckMade, MOUNTED)).toEqual(['sharepic']);
  });

  it('offers nothing before an artifact, after two, after an edit, or without free tools', () => {
    expect(secondArtifactTools(state({}), MOUNTED)).toBeNull();
    expect(
      secondArtifactTools(state({ ...sharepicMade, createdDocument: {} as never }), MOUNTED)
    ).toBeNull();
    expect(
      secondArtifactTools(state({ ...sharepicMade, chatSharepicEdits: [{} as never] }), MOUNTED)
    ).toBeNull();
    expect(secondArtifactTools(sharepicMade, ['gruenerator_search', 'sharepic'])).toBeNull();
  });
});

describe('createSecondArtifactGate', () => {
  it('opens exactly one step after the first artifact, then stays closed', () => {
    let current = state({});
    const gate = createSecondArtifactGate(
      () => current,
      () => MOUNTED
    );
    // Step 0: nothing built yet.
    expect(gate.tools(steps(0))).toBeNull();
    expect(gate.open()).toBe(false);
    // The pure order built the sharepic before step 1.
    current = sharepicMade;
    expect(gate.tools(steps(1))).toEqual(['create_presentation', 'create_sheet']);
    expect(gate.open()).toBe(true);
    // Step 2: the extra step is used up, whether or not it built anything.
    expect(gate.tools(steps(2))).toBeNull();
    expect(gate.open()).toBe(false);
    expect(gate.tools(steps(3))).toBeNull();
  });

  it('closes as soon as the second artifact exists', () => {
    let current = sharepicMade;
    const gate = createSecondArtifactGate(
      () => current,
      () => MOUNTED
    );
    expect(gate.tools(steps(0))).not.toBeNull();
    current = state({ ...sharepicMade, createdDocument: {} as never });
    expect(gate.open()).toBe(false);
  });

  it('stays closed after an image edit: edit_image fills the image slot like a new image', () => {
    const gate = createSecondArtifactGate(
      () => state({ generatedImage: {} as never }),
      () => [...MOUNTED, 'generate_image']
    );
    expect(gate.tools(steps(1, 'edit_image'))).toBeNull();
    expect(gate.open()).toBe(false);
    expect(gate.tools(steps(2, 'edit_image'))).toBeNull();
  });

  it('opens after a newly generated image', () => {
    const gate = createSecondArtifactGate(
      () => state({ generatedImage: {} as never }),
      () => [...MOUNTED, 'generate_image']
    );
    expect(gate.tools(steps(1, 'generate_image'))).toEqual([
      'sharepic',
      'create_presentation',
      'create_sheet',
    ]);
  });
});
