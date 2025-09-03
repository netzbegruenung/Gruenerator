import React, { useEffect, useRef, useCallback, useState } from 'react';
// marked imported dynamically
import { convertHtmlToMarkdown } from '../../../utils/markdownUtils';

const AntragEditForm = ({ editedAntrag, handleInputChange, handleMarkdownChange, handleSaveClick, handleCancelClick, loading, error }) => {
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const markdownRef = useRef(null);
  const isInitialized = useRef(false);
  const [quillLoaded, setQuillLoaded] = useState(false);

  const onTextChange = useCallback(() => {
    if (quillRef.current) {
      const html = quillRef.current.root.innerHTML;
      try {
        const markdown = convertHtmlToMarkdown(html);
        if (editedAntrag?.antragstext !== markdown) {
            handleMarkdownChange(markdown);
        }
      } catch (error) {
          console.error("[AntragEditForm] Error converting editor content to markdown:", error);
      }
    }
  }, [handleMarkdownChange, editedAntrag?.antragstext]);

  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      console.log('[AntragEditForm] Initializing Quill...');
      isInitialized.current = true;

      // Dynamically import Quill and QuillMarkdown
      Promise.all([
        import('quill'),
        import('quilljs-markdown')
      ]).then(async ([{ default: Quill }, { default: QuillMarkdown }]) => {
        const toolbarOptions = [
          ['bold', 'italic', 'underline'],
          [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['link', 'blockquote', 'code-block'],
          ['clean']
        ];

        const quill = new Quill(editorRef.current, {
          modules: {
            toolbar: toolbarOptions
          },
          theme: 'snow',
          placeholder: 'Antragstext eingeben...',
        });
        quillRef.current = quill;

        const markdownOptions = {};
        const quillMarkdown = new QuillMarkdown(quill, markdownOptions);
        markdownRef.current = quillMarkdown;
        setQuillLoaded(true);

        quill.on('text-change', onTextChange);

        if (editedAntrag?.antragstext) {
          try {
            const { marked } = await import('marked');
            const initialHtml = marked(editedAntrag.antragstext);
            console.log('[AntragEditForm] Converted initial Markdown to HTML:', initialHtml.substring(0,100) + '...');
            quill.clipboard.dangerouslyPasteHTML(initialHtml);
            const length = quill.getLength();
            quill.setSelection(length, 0, 'silent');
          } catch (error) {
            console.error("Fehler beim Konvertieren/Setzen des initialen HTML-Inhalts:", error);
            quill.setText(editedAntrag.antragstext || '');
          }
        }

        quill.focus();
      }).catch(error => {
        console.error('[AntragEditForm] Failed to load Quill:', error);
      });
    }

    return () => {
      if (isInitialized.current) {
        console.log('[AntragEditForm] Cleaning up Quill...');
        if (quillRef.current) {
            quillRef.current.off('text-change', onTextChange);
        }
        if (markdownRef.current) {
          if (typeof markdownRef.current.destroy === 'function') {
            markdownRef.current.destroy();
          } else {
            console.warn('[AntragEditForm] markdownRef.current.destroy is not a function');
          }
          markdownRef.current = null;
        }
        quillRef.current = null;
        isInitialized.current = false;
      }
    };
  }, []);

  useEffect(async () => {
    const quill = quillRef.current;
    if (quill && editedAntrag?.antragstext !== undefined) {
      const currentHtml = quill.root.innerHTML;
      let currentMarkdown = '';
      try {
        currentMarkdown = convertHtmlToMarkdown(currentHtml);
      } catch(error) {
        console.error("[AntragEditForm] Error converting current editor HTML to Markdown:", error);
        return;
      }

      if (editedAntrag.antragstext !== currentMarkdown) {
         console.log('[AntragEditForm] Updating content from prop (Markdown comparison)...');
         try {
           const { marked } = await import('marked');
           const incomingHtml = marked(editedAntrag.antragstext);
           const selection = quill.getSelection();
           quill.clipboard.dangerouslyPasteHTML(0, quill.getLength(), incomingHtml);
           if (selection) {
             const newLength = quill.getLength();
             const newIndex = Math.min(selection.index, newLength -1);
             quill.setSelection(newIndex, 0, 'silent');
           } else {
             const newLength = quill.getLength();
             quill.setSelection(newLength, 0, 'silent');
           }
         } catch (error) {
           console.error("Fehler beim Konvertieren/Aktualisieren des HTML-Inhalts von Prop:", error);
           try {
                const selection = quill.getSelection();
                quill.setText(editedAntrag.antragstext);
                 if (selection) {
                    const newLength = quill.getLength();
                    const newIndex = Math.min(selection.index, newLength -1);
                    quill.setSelection(newIndex, 0, 'silent');
                } else {
                    const newLength = quill.getLength();
                    quill.setSelection(newLength, 0, 'silent');
                }
           } catch (setTextError) {
               console.error("Fallback setText failed:", setTextError);
           }
         }
      }
    }
  }, [editedAntrag?.antragstext]);

  return (
    <div className="antrag-edit-form">
      {/* Form Header */}
      <div className="antrag-edit-form-header">
        <h2>Antrag bearbeiten</h2>
        {error && <p className="error-message">{error}</p>}
      </div>
      
      {/* Edit Title */}
      <div className="form-group">
        <label htmlFor="title">Titel</label>
        <input
          type="text"
          id="title"
          name="title"
          value={editedAntrag?.title || ''}
          onChange={handleInputChange}
          className="input-field"
          placeholder="Titel des Antrags"
        />
      </div>

      {/* Edit Description */}
      <div className="form-group">
        <label htmlFor="description">Beschreibung</label>
        <textarea
          id="description"
          name="description"
          value={editedAntrag?.description || ''}
          onChange={handleInputChange}
          className="textarea-field"
          rows="4"
          placeholder="Kurze Beschreibung des Antrags"
        />
      </div>

      {/* Edit Antragsteller */}
      <div className="form-group">
        <label htmlFor="antragsteller">Antragsteller*in</label>
        <input
          type="text"
          id="antragsteller"
          name="antragsteller"
          value={editedAntrag?.antragsteller || ''}
          onChange={handleInputChange}
          className="input-field"
          placeholder="Name der antragstellenden Person"
        />
      </div>

      {/* Edit Kontakt Email */}
      <div className="form-group">
        <label htmlFor="kontakt_email">Kontakt E-Mail</label>
        <input
          type="email"
          id="kontakt_email"
          name="kontakt_email"
          value={editedAntrag?.kontakt_email || ''}
          onChange={handleInputChange}
          className="input-field"
          placeholder="E-Mail-Adresse für Rückfragen"
        />
      </div>

      {/* Quill Editor für Antragstext */}
      <div className="form-group">
        <label htmlFor="antragstext">Antragstext</label>
        <div className="quill-editor-container">
          <div ref={editorRef} className="quill-editor"></div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="antrag-edit-form-actions">
        <button onClick={handleCancelClick} className="button button-secondary" disabled={loading}>
          Abbrechen
        </button>
        <button onClick={handleSaveClick} className="button button-primary" disabled={loading}>
          {loading ? 'Speichern...' : 'Speichern'}
        </button>
      </div>
    </div>
  );
};

export default AntragEditForm; 