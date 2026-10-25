import { describe, expect, it } from 'vitest';

import { buildEditorBar, type EditorBarState, titleMaxWidth } from './editorBar';

const visible = (state: EditorBarState | null) =>
  buildEditorBar('editor', state)
    .buttons.filter((button) => !button.hidden)
    .map((button) => button.command);

const canvas: EditorBarState = { title: 'Plakat', canEdit: true, canUndo: true, canRedo: false };

describe('buildEditorBar', () => {
  it('draws title and close only for a plain page', () => {
    expect(buildEditorBar('plain', canvas)).toEqual({ canRename: false, buttons: [], menu: [] });
  });

  it('holds all three buttons disabled until the page reports', () => {
    const model = buildEditorBar('editor', null);
    expect(visible(null)).toEqual(['undo', 'redo', 'share']);
    expect(model.buttons.every((button) => button.disabled)).toBe(true);
    expect(model.canRename).toBe(false);
    expect(model.menu).toEqual([]);
  });

  it('reads a canvas page that predates history, canShare and actions', () => {
    const model = buildEditorBar('editor', canvas);
    expect(visible(canvas)).toEqual(['undo', 'redo', 'share']);
    expect(model.buttons.map((button) => button.disabled)).toEqual([false, true, false]);
    expect(model.canRename).toBe(true);
  });

  it('hides undo and redo for a viewer and for a page without history', () => {
    expect(visible({ ...canvas, canEdit: false })).toEqual(['share']);
    expect(visible({ ...canvas, history: false })).toEqual(['share']);
  });

  it('hides share where there is nothing to share', () => {
    expect(visible({ ...canvas, canShare: false })).toEqual(['undo', 'redo']);
  });

  it('passes the page menu through', () => {
    const actions = [{ id: 'chat', label: 'Chat', checked: true }];
    expect(buildEditorBar('editor', { ...canvas, actions }).menu).toEqual(actions);
  });
});

describe('titleMaxWidth', () => {
  it('keeps the canvas bar as wide as before and shrinks for the menu', () => {
    expect(titleMaxWidth(390, buildEditorBar('editor', canvas))).toBe(150);
    const withMenu = buildEditorBar('editor', { ...canvas, actions: [{ id: 'a', label: 'A' }] });
    expect(titleMaxWidth(390, withMenu)).toBe(106);
  });

  it('never squeezes the title to nothing', () => {
    expect(titleMaxWidth(200, buildEditorBar('editor', canvas))).toBe(96);
  });
});
