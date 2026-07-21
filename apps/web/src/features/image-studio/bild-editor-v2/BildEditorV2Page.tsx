import { UploadZone } from '@gruenerator/ui';
import { LayoutTemplate } from 'lucide-react';
import { type DragEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './bild-editor-v2.css';
import { BevComposer } from './BevComposer';
import { mintCanvasFromImage } from './canvasHandoff';
import { useBildEditorV2 } from './useBildEditorV2';

const INK = 'var(--bev-ink)';
const ACCEPT_IMAGES = { 'image/*': [] as string[] };

function captionFor(bev: ReturnType<typeof useBildEditorV2>): string {
  const a = bev.active;
  if (!a) return '';
  if (a.kind === 'upload') return `V${a.num} · Hochgeladen`;
  if (a.kind === 'create') return `V${a.num} · KI-erstellt`;
  const parent = bev.versions.find((p) => p.id === a.parentId);
  const parentLabel = `V${parent?.num ?? '?'}`;
  if (a.kind === 'green') return `V${a.num} · Grün verwandelt aus ${parentLabel}`;
  if (a.kind === 'outpaint') return `V${a.num} · Vergrößert aus ${parentLabel}`;
  if (a.kind === 'nobg') return `V${a.num} · Freigestellt aus ${parentLabel}`;
  return `V${a.num} · Bearbeitung von ${parentLabel}`;
}

export default function BildEditorV2Page() {
  const bev = useBildEditorV2();
  const navigate = useNavigate();
  const [canvasLoading, setCanvasLoading] = useState(false);

  const openInCanvas = async () => {
    if (!bev.active || canvasLoading) return;
    setCanvasLoading(true);
    try {
      const id = await mintCanvasFromImage(bev.active.image, `Bild-Editor · V${bev.active.num}`);
      void navigate(`/studio/canvas/${id}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Canvas konnte nicht geöffnet werden.');
      setCanvasLoading(false);
    }
  };

  const {
    screen,
    generating,
    statusText,
    active,
    versions,
    activeHasChildren,
    dragActive,
    setDragActive,
    handleUpload,
    selectVersion,
    download,
    resetAll,
  } = bev;

  const editLoading = generating && screen === 'result';
  const startVisible = screen === 'start' && !generating;
  const loadingVisible = generating && screen === 'start';
  const resultVisible = screen === 'result';

  // Page-level drag overlay for the Start screen. UploadZone (react-dropzone)
  // calls preventDefault on its own drop, so a drop that lands on the zone is
  // skipped here via `defaultPrevented` — no double upload.
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragActive(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    setDragActive(false);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) void handleUpload(file);
  };

  return (
    <div
      data-bev2
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        // All layers are position:absolute (no intrinsic height), so anchor the
        // root to the viewport in case an ancestor isn't a flex column. The
        // sidebarOnly layout hides the header, so 100dvh fills cleanly.
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--bev-bg)',
        color: INK,
      }}
    >
      {/* Static radial background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--bev-radial)',
        }}
      />

      {/* Animated gradient — fades in while generating */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: generating ? 1 : 0,
          transition: 'opacity 1.2s ease',
          background:
            'linear-gradient(118deg, #f7ecce 0%, #dcebe1 28%, #b7d8c8 50%, #f4d58d 76%, #f7ecce 100%)',
          backgroundSize: '300% 300%',
          animation: 'bwgradient 7s ease infinite',
        }}
      />

      {/* ── Start ── */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          overflow: 'auto',
          zIndex: 3,
          opacity: startVisible ? 1 : 0,
          transform: `scale(${startVisible ? 1 : 1.04})`,
          transition: 'opacity 0.7s ease, transform 0.9s ease',
          pointerEvents: startVisible ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            margin: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 26,
            padding: 32,
            width: '100%',
            maxWidth: 720,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.2, textAlign: 'center', color: INK }}>
            Was möchtest du erschaffen?
          </h1>
          <div style={{ width: '100%', maxWidth: 680 }}>
            <BevComposer bev={bev} />
          </div>
          <div style={{ width: '100%', maxWidth: 680 }}>
            <UploadZone
              variant="minimal"
              onFileSelected={(f) => void handleUpload(f)}
              accept={ACCEPT_IMAGES}
              maxSizeMB={10}
              title="Oder editiere ein eigenes Bild"
              dragActiveTitle="Loslassen zum Hochladen"
              subtitle="Bild hierher ziehen oder klicken – PNG, JPG bis 10 MB"
            />
          </div>
        </div>

        {dragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 10,
              border: '2px dashed var(--bev-drag-border)',
              borderRadius: 20,
              background: 'var(--bev-drag-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 30,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: INK }}>
              Bild loslassen zum Hochladen
            </span>
          </div>
        )}
      </div>

      {/* ── Generieren (full screen, only from Start) ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          zIndex: 2,
          opacity: loadingVisible ? 1 : 0,
          transition: 'opacity 0.9s ease',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 38,
              lineHeight: 1.2,
              color: INK,
              animation: 'bwpulse 2s ease infinite',
            }}
          >
            {statusText}
          </h1>
          <div style={{ fontSize: 15, color: 'var(--bev-ink-soft)' }}>
            Dein Bild entsteht – einen Moment …
          </div>
        </div>
      </div>

      {/* ── Ergebnis ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          zIndex: 4,
          opacity: resultVisible ? 1 : 0,
          transition: 'opacity 1s ease',
          pointerEvents: resultVisible ? 'auto' : 'none',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-full bg-transparent px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-white/60 dark:hover:bg-white/10"
            style={{ color: 'var(--bev-accent)' }}
          >
            Neu starten
          </button>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            {active && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: INK,
                  background: 'var(--bev-chip-bg)',
                  border: '1px solid var(--bev-chip-border)',
                  borderRadius: 999,
                  padding: '6px 16px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {captionFor(bev)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => void openInCanvas()}
              disabled={canvasLoading || !active}
              className="flex items-center gap-1.5 rounded-full border bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-white disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/20"
              style={{ color: 'var(--bev-accent)', borderColor: 'var(--bev-accent-border)' }}
            >
              <LayoutTemplate className="size-3.5" />
              {canvasLoading ? 'Öffne Canvas …' : 'In Canvas bearbeiten'}
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition-transform hover:scale-[1.02]"
              style={{ background: 'var(--color-primary)' }}
            >
              Herunterladen
            </button>
          </div>
        </div>

        {/* Image / edit-loading card */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
            padding: '16px 32px',
          }}
        >
          <div
            style={{
              borderRadius: 20,
              background: 'var(--bev-card)',
              padding: 6,
              boxShadow: 'var(--bev-card-shadow)',
              maxWidth: 'min(640px, 72vw)',
              maxHeight: '100%',
              display: 'flex',
            }}
          >
            {editLoading ? (
              <div
                style={{
                  width: 'min(600px, 68vw)',
                  aspectRatio: '16 / 10',
                  borderRadius: 15,
                  position: 'relative',
                  overflow: 'hidden',
                  background:
                    'linear-gradient(118deg, #f7ecce 0%, #b7d8c8 26%, #52907A 50%, #f4d58d 74%, #f7ecce 100%)',
                  backgroundSize: '300% 300%',
                  animation: 'bwbreathe 3.4s ease-in-out infinite, bwgradient 5.5s ease infinite',
                }}
              >
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      width: '45%',
                      background:
                        'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)',
                      animation: 'bwsheen 2.2s ease-in-out infinite',
                    }}
                  />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#fff',
                      textShadow: '0 1px 8px rgba(35,55,46,0.4)',
                      animation: 'bwpulse 2s ease infinite',
                    }}
                  >
                    {statusText}
                  </span>
                </div>
              </div>
            ) : (
              active && (
                <img
                  key={active.id}
                  src={active.image}
                  alt="Aktuelle Version"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 'min(46vh, 520px)',
                    borderRadius: 15,
                    display: 'block',
                    objectFit: 'contain',
                    minWidth: 0,
                    minHeight: 0,
                    animation: 'bwreveal 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
              )
            )}
          </div>
        </div>

        {/* Version strip + branch hint + composer */}
        <div
          style={{
            flexShrink: 0,
            padding: '14px 20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'center',
          }}
        >
          {versions.length > 1 && (
            <div
              style={{ display: 'flex', gap: 10, overflowX: 'auto', maxWidth: '100%', padding: 4 }}
            >
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVersion(v.id)}
                  title={v.prompt}
                  style={{
                    flexShrink: 0,
                    padding: 3,
                    borderRadius: 12,
                    border: `2px solid ${
                      active && v.id === active.id ? 'var(--color-primary)' : 'var(--bev-hairline)'
                    }`,
                    background: 'var(--bev-card)',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <img
                    src={v.image}
                    alt={`V${v.num}`}
                    style={{
                      width: 72,
                      height: 48,
                      objectFit: 'cover',
                      borderRadius: 8,
                      display: 'block',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: 7,
                      bottom: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                      background: 'rgba(35,55,46,0.6)',
                      borderRadius: 5,
                      padding: '1px 5px',
                    }}
                  >
                    V{v.num}
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeHasChildren && !generating && active && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--bev-accent)',
                background: 'var(--bev-chip-bg)',
                border: '1px solid var(--bev-accent-border)',
                borderRadius: 999,
                padding: '4px 12px',
              }}
            >
              Änderungen an V{active.num} erstellen einen neuen Zweig
            </span>
          )}

          <div style={{ width: '100%', maxWidth: 620 }}>
            <BevComposer bev={bev} />
          </div>
        </div>
      </div>
    </div>
  );
}
