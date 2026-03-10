'use dom';

import '@gruenerator/canvas-editor/styles/bundle';

import { CanvasEditorProvider, MasterCanvasEditor } from '@gruenerator/canvas-editor';
import { type DOMProps } from 'expo/dom';

interface CanvasEditorDOMProps {
  type: string;
  initialState: Record<string, unknown>;
  imageSrc?: string;
  onExport: (base64: string) => Promise<void>;
  onCancel: () => Promise<void>;
  dom?: DOMProps;
}

export default function CanvasEditorDOM({
  type,
  initialState,
  imageSrc,
  onExport,
  onCancel,
}: CanvasEditorDOMProps) {
  return (
    <CanvasEditorProvider services={{}}>
      <div style={{ width: '100%', height: '100vh' }}>
        <MasterCanvasEditor
          type={type}
          initialState={initialState}
          imageSrc={imageSrc}
          onExport={onExport}
          onCancel={onCancel}
        />
      </div>
    </CanvasEditorProvider>
  );
}
