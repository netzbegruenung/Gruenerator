import { useCallback, useEffect, useRef, useState } from 'react';
import { FiTrash2, FiCheck } from 'react-icons/fi';
import useVideoEditorStore from '../../../../stores/videoEditorStore';
import './TextOverlay.css';

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TextOverlayPanel = ({ overlayId, onClose }) => {
  const inputRef = useRef(null);
  const [localText, setLocalText] = useState('');

  const {
    textOverlays,
    updateTextOverlay,
    removeTextOverlay
  } = useVideoEditorStore();

  const overlay = textOverlays.find(o => o.id === overlayId);

  useEffect(() => {
    if (overlay) {
      setLocalText(overlay.text);
    }
  }, [overlay?.id, overlay?.text]);

  useEffect(() => {
    if (overlay && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [overlay?.id]);

  const handleTextChange = useCallback((e) => {
    const newText = e.target.value;
    setLocalText(newText);
  }, []);

  const handleTextBlur = useCallback(() => {
    if (overlayId && localText !== overlay?.text) {
      updateTextOverlay(overlayId, { text: localText });
    }
  }, [overlayId, localText, overlay?.text, updateTextOverlay]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setLocalText(overlay?.text || '');
      inputRef.current?.blur();
    }
  }, [overlay?.text]);

  const handleDelete = useCallback(() => {
    if (overlayId) {
      removeTextOverlay(overlayId);
      onClose?.();
    }
  }, [overlayId, removeTextOverlay, onClose]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  if (!overlay) {
    return null;
  }

  return (
    <div className="text-overlay-panel">
      <div className="text-overlay-panel__header">
        <span className="text-overlay-panel__label">Text</span>
        <span className="text-overlay-panel__duration">
          {formatTime(overlay.startTime)} - {formatTime(overlay.endTime)}
        </span>
        <button
          className="text-overlay-panel__close"
          onClick={handleClose}
          aria-label="Schließen"
        >
          ×
        </button>
      </div>

      <div className="text-overlay-panel__content">
        <textarea
          ref={inputRef}
          className="text-overlay-panel__input"
          value={localText}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onKeyDown={handleKeyDown}
          placeholder="Text eingeben..."
          rows={2}
        />
      </div>

      <div className="text-overlay-panel__actions">
        <button
          className="text-overlay-panel__delete"
          onClick={handleDelete}
          aria-label="Text löschen"
          title="Text löschen"
        >
          <FiTrash2 />
          <span>Löschen</span>
        </button>

        <button
          className="text-overlay-panel__save"
          onClick={handleClose}
          aria-label="Fertig"
          title="Fertig"
        >
          <FiCheck />
          <span>Fertig</span>
        </button>
      </div>
    </div>
  );
};

export default TextOverlayPanel;
