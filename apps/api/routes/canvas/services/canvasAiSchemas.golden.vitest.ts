/**
 * Golden files for everything the canvas op planner shows the model: the two
 * tool input schemas, the snapshot schema and the system prompt in both modes.
 *
 * They exist as a refactor guard for moving the op schema out of
 * `@gruenerator/contracts` (schemas/canvasAi.ts) into `@ggraphic/schema`: a
 * `.describe()` text, a field order or a union order that shifts is a changed
 * request to the model without any type error. Update the files in
 * `__golden__/` (`vitest run -u`) only when a change to the model-facing
 * schema or prompt is intended.
 */
import {
  buildSharepicSnapshot,
  canvasAiPlannedBatchSchema,
  canvasAiSnapshotSchema,
  getSharepicTemplateDescriptor,
  sharepicEditDecisionSchema,
  type CanvasAiOperationKind,
  type CanvasAiSnapshot,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { toolInputJsonSchema } from '../../../services/ai/toolJsonSchema.js';

import {
  buildCanvasSuggestSystemPrompt,
  buildCanvasSuggestUserMessage,
  sharepicCapabilitiesView,
} from './buildCanvasSuggestPrompt.js';

const json = (schema: Parameters<typeof toolInputJsonSchema>[0]) =>
  JSON.stringify(toolInputJsonSchema(schema), null, 2);

describe('model-facing canvas ai schemas', () => {
  it('planned batch tool schema', async () => {
    await expect(json(canvasAiPlannedBatchSchema)).toMatchFileSnapshot(
      './__golden__/plannedBatch.schema.json'
    );
  });

  it('sharepic edit decision tool schema', async () => {
    await expect(json(sharepicEditDecisionSchema)).toMatchFileSnapshot(
      './__golden__/sharepicEditDecision.schema.json'
    );
  });

  it('snapshot schema', async () => {
    await expect(json(canvasAiSnapshotSchema)).toMatchFileSnapshot(
      './__golden__/snapshot.schema.json'
    );
  });
});

describe('model-facing canvas ai prompts', () => {
  const d = getSharepicTemplateDescriptor('dreizeilen') as SharepicTemplateDescriptor;
  const dreizeilenSnapshot = buildSharepicSnapshot(d, d.defaultState);
  const dreizeilenCaps = sharepicCapabilitiesView(d);

  it('dreizeilen studio mode', async () => {
    expect(dreizeilenCaps.supportedOperations).toEqual(
      expect.arrayContaining(['toggle-sunflower', 'set-color-scheme'])
    );
    await expect(
      buildCanvasSuggestSystemPrompt(dreizeilenSnapshot, dreizeilenCaps)
    ).toMatchFileSnapshot('./__golden__/prompt.dreizeilen.studio.txt');
  });

  it('dreizeilen chat edit mode', async () => {
    await expect(
      buildCanvasSuggestSystemPrompt(dreizeilenSnapshot, dreizeilenCaps, undefined, null, {
        recentEditSummaries: ['Zeile 2 gekürzt'],
      })
    ).toMatchFileSnapshot('./__golden__/prompt.dreizeilen.chat.txt');
  });

  it('freeform canvas with selection and hints', async () => {
    const snapshot: CanvasAiSnapshot = {
      template: 'freeform',
      textFields: [
        { field: 'headline', label: 'Headline', value: 'Klimaschutz jetzt' },
        { field: 'subline', label: 'Subline', value: 'Für alle' },
      ],
      currentColorScheme: 'tanne',
      currentBackgroundColor: '#005437',
      currentColorMode: 'dark',
      canvasSize: { width: 1080, height: 1350 },
      elementsSummary: [
        { id: 'el-1', kind: 'text', label: 'Headline' },
        { id: 'el-2', kind: 'illustration', label: 'Sonnenblume' },
        { id: 'el-3', kind: 'shape', label: 'Kreis' },
      ],
    };
    await expect(
      buildCanvasSuggestSystemPrompt(
        snapshot,
        {
          supportedOperations: [
            'set-text',
            'set-color-scheme',
            'set-background-color',
            'set-color-mode',
            'add-illustration',
            'add-asset',
            'remove-element',
            'set-font-size',
            'update-element',
            'set-background-image',
          ],
          colorSchemes: [
            { id: 'tanne', label: 'Tanne' },
            { id: 'klee', label: 'Klee' },
          ],
          illustrations: [{ id: 'sonnenblume', label: 'Sonnenblume' }],
          assets: [{ id: 'logo', label: 'Logo' }],
        },
        { prose: 'Der Kreisverband lädt zum Sommerfest ein.' },
        ['el-1']
      )
    ).toMatchFileSnapshot('./__golden__/prompt.freeform.txt');
  });

  it('user message', async () => {
    await expect(buildCanvasSuggestUserMessage('Mach den Text kürzer')).toMatchFileSnapshot(
      './__golden__/prompt.userMessage.txt'
    );
  });
});

describe('CanvasAiOperationKind', () => {
  it('is exactly this set', () => {
    expectTypeOf<CanvasAiOperationKind>().toEqualTypeOf<
      | 'set-text'
      | 'set-color-scheme'
      | 'set-background-color'
      | 'set-color-mode'
      | 'add-illustration'
      | 'add-asset'
      | 'remove-element'
      | 'toggle-sunflower'
      | 'set-font-size'
      | 'update-element'
      | 'set-background-image'
    >();
  });
});
