import { useCallback, useMemo, useRef, useState } from 'react';
import { Layer, Line, Stage } from 'react-konva';
import { PiShuffle, PiDropSimpleFill } from 'react-icons/pi';

import { BRAND_COLORS } from '../../../utils/shapes';
import { useUserUploads } from '../../UserUploadsProvider';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

import type Konva from 'konva';

export interface BlobCreatorToolProps {
  onJumpToUploads?: () => void;
}

const STAGE_SIZE = 220;
const CENTER = STAGE_SIZE / 2;
const BASE_RADIUS = STAGE_SIZE * 0.38;
const EXPORT_PIXEL_RATIO = 4; // 220 * 4 = 880px PNG
const MAX_POINTS = 12;
const TENSION = 0.6;

const DEFAULT_COLOR = BRAND_COLORS[3]?.value ?? BRAND_COLORS[0]?.value ?? '#8ABD24';

function randomSeed(): number[] {
  return Array.from({ length: MAX_POINTS }, () => Math.random());
}

/**
 * A "beautiful blob" is a closed Konva.Line with tension (Catmull-Rom spline)
 * over points placed around a circle with per-point radius jitter. See
 * https://konvajs.org/docs/shapes/Line_-_Blob.html
 */
function computeBlobPoints(seed: number[], numPoints: number, irregularity: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const jitter = 1 - irregularity + seed[i % seed.length] * irregularity * 2;
    const r = BASE_RADIUS * jitter;
    points.push(CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle));
  }
  return points;
}

function ColorRow({
  selected,
  onSelect,
  disabled,
}: {
  selected: string;
  onSelect: (color: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-foreground-muted">Farbe</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {BRAND_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(c.value)}
            title={c.name}
            className="size-6 rounded-full border border-black/10 transition-transform hover:scale-110 disabled:opacity-50"
            style={{
              backgroundColor: c.value,
              outline: selected === c.value ? '2px solid var(--editor-accent, #005538)' : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function LabeledRange({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="text-foreground-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-primary-600 disabled:opacity-50"
      />
    </label>
  );
}

export function BlobCreatorTool({ onJumpToUploads }: BlobCreatorToolProps) {
  const { upload, isUploading } = useUserUploads();
  const stageRef = useRef<Konva.Stage>(null);

  const [seed, setSeed] = useState<number[]>(randomSeed);
  const [numPoints, setNumPoints] = useState(7);
  const [irregularity, setIrregularity] = useState(0.35);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const points = useMemo(
    () => computeBlobPoints(seed, numPoints, irregularity),
    [seed, numPoints, irregularity]
  );

  const disabled = isBusy || isUploading;

  const handleAction = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) {
      setError('Vorschau konnte nicht erzeugt werden.');
      return;
    }
    setError(null);
    setSuccess(null);
    setIsBusy(true);

    try {
      const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: EXPORT_PIXEL_RATIO });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `blob_${Date.now()}.png`, { type: 'image/png' });
      const item = await upload(file);
      if (!item) throw new Error('Upload fehlgeschlagen');

      const objectUrl = URL.createObjectURL(file);
      setSuccess({
        thumbnailUrl: objectUrl,
        itemName: item.originalFilename ?? item.title ?? file.name,
        onJumpToUploads,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Erstellen des Blobs';
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }, [upload, onJumpToUploads]);

  return (
    <ToolPanel
      body={
        <div className="flex flex-col gap-3">
          <div className="self-center rounded-lg bg-grey-50 dark:bg-grey-900 p-3">
            <Stage ref={stageRef} width={STAGE_SIZE} height={STAGE_SIZE}>
              <Layer>
                <Line points={points} closed tension={TENSION} fill={color} />
              </Layer>
            </Stage>
          </div>

          <button
            type="button"
            onClick={() => setSeed(randomSeed())}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-grey-300 bg-background px-sm py-xs text-sm text-foreground transition-colors hover:border-primary-500 disabled:opacity-50 dark:border-grey-600"
          >
            <PiShuffle size={16} />
            Neu würfeln
          </button>

          <ColorRow selected={color} onSelect={setColor} disabled={disabled} />
          <LabeledRange
            label={`Punkte: ${numPoints}`}
            value={numPoints}
            min={4}
            max={MAX_POINTS}
            step={1}
            onChange={setNumPoints}
            disabled={disabled}
          />
          <LabeledRange
            label={`Unregelmäßigkeit: ${Math.round(irregularity * 100)}%`}
            value={irregularity}
            min={0.1}
            max={0.6}
            step={0.05}
            onChange={setIrregularity}
            disabled={disabled}
          />
        </div>
      }
      actionLabel="Blob zu Uploads hinzufügen"
      actionIcon={PiDropSimpleFill}
      canSubmit={!disabled}
      isBusy={disabled}
      progressMessage={isBusy ? 'Blob wird gespeichert…' : null}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
