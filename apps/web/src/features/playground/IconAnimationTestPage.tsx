import { GrueneratorHomeIconLoading } from '@gruenerator/chat';
import { Button } from '@gruenerator/ui';
import { Pause, Play } from 'lucide-react';
import { useState } from 'react';

import GrueneratorHomeIcon from '../../components/icons/GrueneratorHomeIcon';

const IconAnimationTestPage = () => {
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Workplace icon — loading</h1>
        <p className="text-sm text-muted-foreground">
          The cog spins slowly. The bar transforms into three pulsing dots. Press play.
        </p>
      </header>

      <section className="flex flex-col items-center gap-8 rounded-lg border bg-card p-10">
        <div style={{ fontSize: 240, lineHeight: 1 }}>
          <GrueneratorHomeIconLoading loading={loading} />
        </div>

        <div className="flex items-end gap-8">
          {[16, 20, 24, 32, 48].map((size) => (
            <div key={size} className="flex flex-col items-center gap-1.5">
              <GrueneratorHomeIconLoading loading={loading} style={{ fontSize: size }} />
              <span className="text-[10px] text-muted-foreground">{size}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex justify-center rounded-lg border bg-card p-4">
        <Button
          onClick={() => setLoading((v) => !v)}
          variant={loading ? 'secondary' : 'default'}
          size="lg"
        >
          {loading ? <Pause className="mr-2 size-4" /> : <Play className="mr-2 size-4" />}
          {loading ? 'Stop' : 'Play'}
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Static reference — current production icon</h2>
        <div className="flex items-end gap-8">
          {[16, 20, 32, 160].map((size) => (
            <div key={size} className="flex flex-col items-center gap-1.5">
              <GrueneratorHomeIcon style={{ fontSize: size }} />
              <span className="text-[10px] text-muted-foreground">{size}px</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default IconAnimationTestPage;
