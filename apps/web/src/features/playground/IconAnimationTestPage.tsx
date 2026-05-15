import { Button, Slider } from '@gruenerator/ui';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import GrueneratorHomeIcon from '../../components/icons/GrueneratorHomeIcon';
import GrueneratorHomeIconLoading, {
  type WorkplaceLoadingVariant,
} from '../../components/icons/GrueneratorHomeIconLoading';
import { cn } from '../../utils/cn';

interface VariantSpec {
  id: WorkplaceLoadingVariant;
  name: string;
  description: string;
  feel: string;
}

const VARIANTS: VariantSpec[] = [
  {
    id: 'A',
    name: 'Variant A — Curls in place',
    description: 'Bar fades and a single arc strokes in where the bar was, then spins.',
    feel: 'Subtle. Identity-preserving. Reads cleanly at sidebar size.',
  },
  {
    id: 'B',
    name: 'Variant B — Sweeps around gear',
    description:
      'Bar fades and a large arc strokes in around the gear, starting at the bar’s bearing, then orbits.',
    feel: 'Dramatic. The whole icon becomes a halo. Bigger visual footprint.',
  },
  {
    id: 'C',
    name: 'Variant C — Dual-arc in place',
    description:
      'Same position as A but two opposing arcs rotate together — busier, more “processing”.',
    feel: 'Most active. Two ticks rotating reads as continuous work.',
  },
];

type LoadingMap = Record<WorkplaceLoadingVariant, boolean>;
const INITIAL_LOADING: LoadingMap = { A: false, B: false, C: false };

const IconAnimationTestPage = () => {
  const [loading, setLoading] = useState<LoadingMap>(INITIAL_LOADING);
  const [speed, setSpeed] = useState(1);

  const toggle = (id: WorkplaceLoadingVariant) =>
    setLoading((prev) => ({ ...prev, [id]: !prev[id] }));
  const stop = (id: WorkplaceLoadingVariant) => setLoading((prev) => ({ ...prev, [id]: false }));
  const playAll = () => setLoading({ A: true, B: true, C: true });
  const stopAll = () => setLoading(INITIAL_LOADING);

  const allPlaying = loading.A && loading.B && loading.C;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Workplace icon — loading animation test</h1>
        <p className="text-sm text-muted-foreground">
          Three variants of the “bar → spinner” transformer for{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GrueneratorHomeIcon</code>. Press
          play on any card, or play all together. Use the speed slider to slow it down for
          inspection.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
        <Button
          onClick={allPlaying ? stopAll : playAll}
          variant={allPlaying ? 'secondary' : 'default'}
        >
          {allPlaying ? <Pause className="mr-2 size-4" /> : <Play className="mr-2 size-4" />}
          {allPlaying ? 'Stop all' : 'Play all'}
        </Button>
        <Button variant="outline" onClick={stopAll}>
          <RotateCcw className="mr-2 size-4" />
          Reset
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-medium">Speed</span>
          <Slider
            className="w-64"
            min={0.25}
            max={2}
            step={0.05}
            value={[speed]}
            onValueChange={(v) => setSpeed(v[0] ?? 1)}
          />
          <span className="w-14 text-right font-mono text-sm tabular-nums">
            {speed.toFixed(2)}x
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {VARIANTS.map((v) => (
          <VariantCard
            key={v.id}
            spec={v}
            loading={loading[v.id]}
            speed={speed}
            onToggle={() => toggle(v.id)}
            onStop={() => stop(v.id)}
          />
        ))}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Reference — static (current production icon)</h2>
        <div className="flex items-end gap-6">
          <div className="flex flex-col items-center gap-1">
            <GrueneratorHomeIcon style={{ fontSize: 16 }} />
            <span className="text-xs text-muted-foreground">16px (sidebar)</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <GrueneratorHomeIcon style={{ fontSize: 32 }} />
            <span className="text-xs text-muted-foreground">32px</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <GrueneratorHomeIcon style={{ fontSize: 160 }} />
            <span className="text-xs text-muted-foreground">160px</span>
          </div>
        </div>
      </section>
    </div>
  );
};

interface VariantCardProps {
  spec: VariantSpec;
  loading: boolean;
  speed: number;
  onToggle: () => void;
  onStop: () => void;
}

const VariantCard = ({ spec, loading, speed, onToggle, onStop }: VariantCardProps) => (
  <div
    className={cn(
      'flex flex-col gap-4 rounded-lg border bg-card p-5 transition-shadow',
      loading && 'shadow-md ring-1 ring-primary/30'
    )}
  >
    <div className="space-y-1">
      <h3 className="text-base font-semibold">{spec.name}</h3>
      <p className="text-sm text-muted-foreground">{spec.description}</p>
      <p className="text-xs italic text-muted-foreground">{spec.feel}</p>
    </div>

    <div className="flex items-center justify-center rounded-md border bg-background py-6">
      <GrueneratorHomeIconLoading
        loading={loading}
        variant={spec.id}
        speed={speed}
        style={{ fontSize: 160 }}
      />
    </div>

    <div className="flex items-end justify-around rounded-md border bg-background px-3 py-3">
      {[16, 20, 32].map((size) => (
        <div key={size} className="flex flex-col items-center gap-1">
          <GrueneratorHomeIconLoading
            loading={loading}
            variant={spec.id}
            speed={speed}
            style={{ fontSize: size }}
          />
          <span className="text-[10px] text-muted-foreground">{size}px</span>
        </div>
      ))}
    </div>

    <div className="flex gap-2">
      <Button onClick={onToggle} variant={loading ? 'secondary' : 'default'} className="flex-1">
        {loading ? <Pause className="mr-2 size-4" /> : <Play className="mr-2 size-4" />}
        {loading ? 'Stop' : 'Play'}
      </Button>
      <Button onClick={onStop} variant="outline" size="icon" disabled={!loading} title="Reset">
        <RotateCcw className="size-4" />
      </Button>
    </div>
  </div>
);

export default IconAnimationTestPage;
