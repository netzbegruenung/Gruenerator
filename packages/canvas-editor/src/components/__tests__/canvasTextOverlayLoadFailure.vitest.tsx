/**
 * Lädt der Editor nicht, versucht es das Öffnen noch einmal; scheitert auch
 * das, schließt die Sitzung ohne Änderung und sagt, warum (#4384).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';

const attempts = vi.hoisted(() => ({ count: 0 }));

vi.mock('../RichTextField', () => {
  attempts.count += 1;
  throw new Error('chunk load failed');
});

afterEach(cleanup);

describe('Editor lädt nicht', () => {
  it('versucht es erneut, schließt dann die Sitzung und meldet es', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onTextChange = vi.fn();
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={600} height={600}>
        <CanvasText
          id="text-1"
          x={10}
          y={20}
          width={400}
          fontSize={24}
          text="Klimaschutz"
          editable
          onTextChange={onTextChange}
        />
      </CanvasStage>
    );
    // Das Vorladen beim Erscheinen scheitert bereits einmal.
    await vi.waitFor(() => expect(attempts.count).toBe(1));
    await act(async () => {});

    const node = stageRef.current?.getStage()?.findOne('#text-1');
    if (!node) throw new Error('Textknoten nicht auf der Bühne gefunden');
    act(() => {
      node.fire('dblclick');
    });
    expect(document.querySelector('.canvas-rte')).not.toBeNull();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Der Texteditor konnte nicht geladen werden'
    );
    expect(attempts.count).toBe(3);
    expect(document.querySelector('.canvas-rte')).toBeNull();
    expect(onTextChange).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
  });
});
