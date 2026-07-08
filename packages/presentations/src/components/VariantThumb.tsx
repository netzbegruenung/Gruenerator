import { type SlideLayout } from '@gruenerator/contracts';
import { type CSSProperties } from 'react';

/**
 * A tiny (whole-slide) mockup of a layout variant, shown inside the "Variante"
 * picker so the choice is visual. Deliberately schematic — a few bars/blocks
 * that capture each variant's distinguishing shape.
 */
export function VariantThumb({
  layout,
  variant,
  accent,
}: {
  layout: SlideLayout;
  variant: number;
  accent: string;
}) {
  const box: CSSProperties = {
    height: 46,
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    display: 'flex',
    background: '#ffffff',
    border: '1px solid #E2E8E4',
  };
  const bar = (w: string | number, h: number, c: string): CSSProperties => ({
    width: w,
    height: h,
    background: c,
    borderRadius: 2,
    flex: 'none',
  });
  const key = `${layout}-${variant}`;

  switch (key) {
    case 'title-0':
      return (
        <div
          style={{
            ...box,
            background: accent,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <span style={bar('55%', 4, 'rgba(255,255,255,0.95)')} />
          <span style={bar('38%', 3, 'rgba(255,255,255,0.6)')} />
        </div>
      );
    case 'title-1':
      return (
        <div style={{ ...box, alignItems: 'center' }}>
          <span style={{ ...bar('40%', 4, '#33443A'), marginLeft: 8 }} />
          <span
            style={{ width: '32%', alignSelf: 'stretch', background: accent, marginLeft: 'auto' }}
          />
        </div>
      );
    case 'title-2':
      return (
        <div
          style={{
            ...box,
            background: '#F5F1E9',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 3,
            paddingLeft: 8,
          }}
        >
          <span style={bar(12, 3, accent)} />
          <span style={bar('58%', 4, '#33443A')} />
          <span style={bar('40%', 3, '#9AA79F')} />
        </div>
      );
    case 'content-1':
      return (
        <div style={{ ...box, flexWrap: 'wrap', gap: 3, padding: 6, alignContent: 'center' }}>
          <span style={{ width: '46%', height: 13, background: '#EAF2EE', borderRadius: 3 }} />
          <span style={{ width: '46%', height: 13, background: '#EAF2EE', borderRadius: 3 }} />
          <span style={{ width: '46%', height: 13, background: '#EAF2EE', borderRadius: 3 }} />
          <span style={{ width: '46%', height: 13, background: '#EAF2EE', borderRadius: 3 }} />
        </div>
      );
    case 'content-2': {
      const row = (w: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: 999, background: accent, flex: 'none' }}
          />
          <span style={bar(w, 3, '#C7D3CB')} />
        </div>
      );
      return (
        <div
          style={{
            ...box,
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 4,
            paddingLeft: 8,
          }}
        >
          {row('66%')}
          {row('54%')}
          {row('60%')}
        </div>
      );
    }
    case 'quote-0':
      return (
        <div
          style={{
            ...box,
            background: accent,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <span style={bar('58%', 4, 'rgba(255,255,255,0.95)')} />
          <span style={bar('32%', 3, 'rgba(255,255,255,0.6)')} />
        </div>
      );
    case 'quote-1':
      return (
        <div
          style={{
            ...box,
            background: '#F5F1E9',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <span style={bar('58%', 4, '#33443A')} />
          <span style={bar('32%', 3, '#9AA79F')} />
        </div>
      );
    case 'image-1':
      return (
        <div style={{ ...box, gap: 5, padding: 6, alignItems: 'center' }}>
          <span style={bar('30%', 4, '#33443A')} />
          <span
            style={{
              flex: 1,
              alignSelf: 'stretch',
              border: '1.5px dashed #B9C7BE',
              borderRadius: 4,
            }}
          />
        </div>
      );
    case 'image-0':
      return (
        <div style={{ ...box, flexDirection: 'column', gap: 4, padding: 6 }}>
          <span style={bar('44%', 4, '#33443A')} />
          <span
            style={{ flex: 1, width: '100%', border: '1.5px dashed #B9C7BE', borderRadius: 4 }}
          />
        </div>
      );
    // content-0 (Liste) and any fallback: dot bullets.
    default:
      return (
        <div
          style={{
            ...box,
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 4,
            paddingLeft: 8,
          }}
        >
          <span style={bar('76%', 3, '#C7D3CB')} />
          <span style={bar('60%', 3, '#C7D3CB')} />
          <span style={bar('70%', 3, '#C7D3CB')} />
        </div>
      );
  }
}
