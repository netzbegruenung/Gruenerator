/**
 * CanvasEditor - the Grünerator's editor: the core shell (`CanvasEditorShell`)
 * with the Grünerator's tabs, menu bar, page picker and template callbacks
 * registered (`./grueneratorEditorShell`, imported for its side effect).
 */

import { CanvasEditorShell } from '@ggraphic/editor/components/CanvasEditor/CanvasEditorShell';
import './grueneratorEditorShell';

import type { CanvasConfigId } from '../../templates/registry';
import type { CanvasEditorProps } from '@ggraphic/editor/components/CanvasEditor/types';

export function CanvasEditor(props: CanvasEditorProps<CanvasConfigId>) {
  return <CanvasEditorShell {...props} />;
}

export type {
  CanvasEditorProps,
  PageWrapperProps,
} from '@ggraphic/editor/components/CanvasEditor/types';

export default CanvasEditor;
