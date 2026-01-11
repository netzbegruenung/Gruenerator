import { useCallback } from 'react';
import { FiTrash2, FiFilm } from 'react-icons/fi';
import useVideoEditorStore from '../../../../stores/videoEditorStore';
import './ClipPanel.css';

const ClipPanel = () => {

  const {
    activeClipId,
    setActiveClip,
    removeClip,
    getClipsArray,
    getClipCount
  } = useVideoEditorStore();

  const clipsArray = getClipsArray();
  const clipCount = getClipCount();

  const handleRemoveClip = useCallback((e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    removeClip(clipId);
  }, [removeClip]);

  const handleDragStart = useCallback((e: React.DragEvent, clipId: string) => {
    e.dataTransfer.setData('application/clip-id', clipId);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <div className="clip-panel">
      <div className="clip-panel__list">
        {clipsArray.map((clip) => (
          <div
            key={clip.id}
            className={`clip-panel__item ${activeClipId === clip.id ? 'clip-panel__item--active' : ''}`}
            onClick={() => setActiveClip(clip.id)}
            draggable
            onDragStart={(e: React.DragEvent) => handleDragStart(e, clip.id)}
          >
            <div
              className="clip-panel__thumbnail"
              style={{
                backgroundImage: clip.thumbnail ? `url(${clip.thumbnail})` : 'none',
                backgroundColor: clip.thumbnail ? 'transparent' : clip.color,
                aspectRatio: clip.width && clip.height ? `${clip.width} / ${clip.height}` : '16 / 9'
              }}
            >
              {!clip.thumbnail && <FiFilm />}
            </div>

            {clipCount > 1 && (
              <button
                className="clip-panel__delete"
                onClick={(e: React.MouseEvent) => handleRemoveClip(e, clip.id)}
                title="Clip entfernen"
                aria-label="Clip entfernen"
              >
                <FiTrash2 />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClipPanel;
