/**
 * tiptap wird erst nachgeladen (#4384). Bis dahin steht derselbe Rahmen mit
 * dem reinen Text; danach übernimmt der echte Editor an derselben Stelle.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';

afterEach(cleanup);

describe('Text-Editor wird nachgeladen', () => {
  it('zeigt erst den reinen Text und dann den Editor', async () => {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={600} height={600}>
        <CanvasText
          id="text-1"
          x={10}
          y={20}
          width={400}
          fontSize={24}
          text="Klima**schutz**"
          editable
          onTextChange={() => {}}
        />
      </CanvasStage>
    );
    const node = stageRef.current?.getStage()?.findOne('#text-1');
    if (!node) throw new Error('Textknoten nicht auf der Bühne gefunden');
    act(() => {
      node.fire('dblclick');
    });

    const placeholder = document.querySelector<HTMLElement>('.canvas-rte__content');
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveTextContent('Klimaschutz');
    expect(placeholder?.getAttribute('contenteditable')).toBeNull();
    expect(placeholder?.parentElement?.style.fontSize).toBe('24px');

    await waitFor(() =>
      expect(document.querySelector('.canvas-rte__content[contenteditable="true"]')).not.toBeNull()
    );
    const content = document.querySelector<HTMLElement>('.canvas-rte__content')!;
    expect(content.querySelector('strong')).toHaveTextContent('schutz');
    expect(content.parentElement?.style.fontSize).toBe('24px');
  });
});
