/**
 * CanvasEditor - the Grünerator's editor: the core shell (`CanvasEditorShell`)
 * with the Grünerator's tabs, menu bar, page picker and template callbacks
 * registered (`./grueneratorEditorShell`, imported for its side effect).
 */

import { CanvasEditorShell, type CanvasEditorProps } from '@ggraphic/editor/shell';
import './grueneratorEditorShell';

import type { CanvasConfigId } from '../../templates/registry';

export function CanvasEditor(props: CanvasEditorProps<CanvasConfigId>) {
  return <CanvasEditorShell {...props} />;
}

export type { CanvasEditorProps, PageWrapperProps } from '@ggraphic/editor/shell';

export default CanvasEditor;
