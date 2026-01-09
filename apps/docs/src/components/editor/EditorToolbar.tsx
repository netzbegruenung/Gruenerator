import { Editor } from '@tiptap/react';
import './EditorToolbar.css';

interface EditorToolbarProps {
  editor: Editor;
}

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  const setLink = () => {
    const url = window.prompt('URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const removeLink = () => {
    editor.chain().focus().unsetLink().run();
  };

  const getCurrentHeadingLevel = () => {
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    if (editor.isActive('heading', { level: 4 })) return 'h4';
    if (editor.isActive('heading', { level: 5 })) return 'h5';
    if (editor.isActive('heading', { level: 6 })) return 'h6';
    return 'paragraph';
  };

  const handleHeadingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run();
    } else {
      const level = parseInt(value.replace('h', '')) as 1 | 2 | 3 | 4 | 5 | 6;
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Rückgängig (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Wiederholen (Ctrl+Y)"
        >
          ↷
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="Fett (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="Kursiv (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'is-active' : ''}
          title="Unterstrichen (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'is-active' : ''}
          title="Durchgestrichen"
        >
          <s>S</s>
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <select
          value={getCurrentHeadingLevel()}
          onChange={handleHeadingChange}
          className="heading-dropdown"
          title="Textformat"
        >
          <option value="paragraph">Normal</option>
          <option value="h1">Überschrift 1</option>
          <option value="h2">Überschrift 2</option>
          <option value="h3">Überschrift 3</option>
          <option value="h4">Überschrift 4</option>
          <option value="h5">Überschrift 5</option>
          <option value="h6">Überschrift 6</option>
        </select>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          title="Aufzählung"
        >
          • Liste
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          title="Nummerierte Liste"
        >
          1. Liste
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          onClick={setLink}
          className={editor.isActive('link') ? 'is-active' : ''}
          title="Link einfügen"
        >
          🔗 Link
        </button>
        {editor.isActive('link') && (
          <button
            onClick={removeLink}
            title="Link entfernen"
          >
            ✂️
          </button>
        )}
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
          title="Zitat"
        >
          " Zitat
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontale Linie"
        >
          ―
        </button>
      </div>
    </div>
  );
};
