import React, { useRef, useCallback, useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import PropTypes from 'prop-types';
import 'react-quill/dist/quill.snow.css';

const SocialMediaEditor = ({ value, onChange, isEditing, platform }) => {
  const quillRef = useRef(null);
  const [localValue, setLocalValue] = useState(value);
  
  // Plattform-spezifische Zeichenlimits
  const CHAR_LIMITS = {
    twitter: 280,
    facebook: 600,
    instagram: 600,
    linkedin: 600
  };

  const modules = {
    toolbar: [
      ['bold', 'italic'],
      ['link'],
      ['clean'],
      ['emoji'] // Custom Format für Emojis
    ],
    clipboard: {
      matchVisual: false // Verhindert zusätzliche Formatierungen beim Einfügen
    }
  };

  const formats = [
    'bold', 'italic', 'link', 'emoji'
  ];

  // Behandelt Änderungen und prüft Zeichenlimit
  const handleChange = useCallback((content) => {
    const textOnly = content.replace(/<[^>]*>/g, '');
    const charLimit = CHAR_LIMITS[platform];
    
    if (charLimit && textOnly.length > charLimit) {
      // Schneide den Text ab wenn er zu lang ist
      const editor = quillRef.current.getEditor();
      const delta = editor.getContents();
      let length = 0;
      const limitedDelta = delta.ops.reduce((acc, op) => {
        if (length < charLimit) {
          if (typeof op.insert === 'string') {
            const remainingChars = charLimit - length;
            length += op.insert.length;
            if (length > charLimit) {
              op.insert = op.insert.slice(0, remainingChars);
            }
          }
          acc.ops.push(op);
        }
        return acc;
      }, { ops: [] });
      
      editor.setContents(limitedDelta);
      return;
    }

    setLocalValue(content);
    onChange(content);
  }, [platform, onChange]);

  // Initialisierung
  useEffect(() => {
    if (quillRef.current) {
      const editor = quillRef.current.getEditor();
      editor.enable(isEditing);
    }
  }, [isEditing]);

  // Synchronisiere externen Wert
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="social-media-editor">
      <ReactQuill
        ref={quillRef}
        value={localValue}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        readOnly={!isEditing}
        theme="snow"
        placeholder={`Schreibe einen ${platform}-Post...`}
      />
      {platform && CHAR_LIMITS[platform] && (
        <div className="char-counter">
          {localValue.replace(/<[^>]*>/g, '').length} / {CHAR_LIMITS[platform]}
        </div>
      )}
    </div>
  );
};

SocialMediaEditor.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired,
  platform: PropTypes.oneOf(['twitter', 'facebook', 'instagram', 'linkedin']).isRequired
};

export default React.memo(SocialMediaEditor);