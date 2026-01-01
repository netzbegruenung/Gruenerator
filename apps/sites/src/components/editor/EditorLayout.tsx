import { forwardRef, type ReactNode } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import '../../styles/components/editor-layout.css';

interface EditorLayoutProps {
  sidebar: ReactNode;
  preview: ReactNode;
}

export const EditorLayout = forwardRef<HTMLDivElement, EditorLayoutProps>(
  function EditorLayout({ sidebar, preview }, ref) {
    const { isMobileEditorOpen, toggleMobileEditor } = useEditorStore();

    return (
      <div className="editor-layout">
        <div className={`editor-sidebar ${isMobileEditorOpen ? 'editor-sidebar--open' : ''}`}>
          <div className="editor-sidebar-handle" onClick={toggleMobileEditor} />
          <div className="editor-sidebar-content">
            {sidebar}
          </div>
        </div>

        <div className="editor-preview-pane">
          <div className="editor-preview-header">
            <h3>Vorschau</h3>
          </div>
          <div className="editor-preview-scroll" ref={ref}>
            <div className="editor-preview-container">
              {preview}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
