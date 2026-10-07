import {
  buildCanvasItems,
  buildSortedRenderList,
  type CanvasItem,
} from '../utils/canvasLayerManager';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

type SummaryEntry = CanvasAiSnapshot['elementsSummary'][number];

const r = (n: number) => Math.round(n);
const pos = (x: number, y: number) => `x=${r(x)} y=${r(y)}`;
const size = (w: number, h: number) => `${r(w)}×${r(h)}`;
const quote = (text: string) => `"${text.replace(/\s+/g, ' ').trim().slice(0, 40)}"`;

/**
 * One compact German line per user-placed element, in z-order (Ebene 1 is at
 * the back), so the planner can target any of them with update-element /
 * remove-element and reason about where things are.
 */
export function describeCanvasElements(state: BaseCanvasState): SummaryEntry[] {
  const items = buildSortedRenderList(
    buildCanvasItems({ elements: [] }, state),
    state.layerOrder ?? []
  );
  const total = items.length;
  return items.flatMap((item, i) => {
    const entry = describeItem(item, state);
    if (!entry) return [];
    return [{ ...entry, label: `${entry.label} · Ebene ${i + 1}/${total}` }];
  });
}

function describeItem(item: CanvasItem, state: BaseCanvasState): SummaryEntry | null {
  switch (item.type) {
    case 'additional-text': {
      const t = item.data;
      return {
        id: t.id,
        kind: 'text',
        label: `${quote(t.text)} · ${pos(t.x, t.y)} Breite ${r(t.width)} · Schrift ${r(t.fontSize)}px · Farbe ${t.fill}`,
      };
    }
    case 'shape': {
      const s = item.data;
      const plane = s.locked ? ' (Hintergrundfläche)' : '';
      return {
        id: s.id,
        kind: 'shape',
        label: `${s.type}${plane} · ${pos(s.x, s.y)} · ${size(s.width * s.scaleX, s.height * s.scaleY)} · Farbe ${s.fill}`,
      };
    }
    case 'pill-badge': {
      const p = item.data;
      return {
        id: p.id,
        kind: 'pill-badge',
        label: `${quote(p.text)} · ${pos(p.x, p.y)} · Schrift ${r(p.fontSize * p.scale)}px · Farbe ${p.backgroundColor}`,
      };
    }
    case 'circle-badge': {
      const c = item.data;
      const text = c.textLines.map((l) => l.text).join(' ');
      return {
        id: c.id,
        kind: 'circle-badge',
        label: `${quote(text)} · ${pos(c.x, c.y)} · Durchmesser ${r(2 * c.radius * c.scale)} · Farbe ${c.backgroundColor}`,
      };
    }
    case 'icon': {
      const icon = state.iconStates?.[item.id];
      if (!icon) return null;
      return {
        id: item.id,
        kind: 'icon',
        label: `${icon.iconId ?? item.id} · ${pos(icon.x, icon.y)} · Skalierung ${icon.scale}${icon.color ? ` · Farbe ${icon.color}` : ''}`,
      };
    }
    case 'asset':
      return {
        id: item.id,
        kind: 'asset',
        label: `${item.data.assetId} · ${pos(item.data.x, item.data.y)} · Skalierung ${item.data.scale}`,
      };
    case 'illustration':
      return {
        id: item.id,
        kind: 'illustration',
        label: `${item.data.illustrationId} · ${pos(item.data.x, item.data.y)} · Skalierung ${item.data.scale}`,
      };
    case 'chart': {
      const c = item.data;
      return {
        id: c.id,
        kind: 'chart',
        label: `Diagramm ${c.title ? quote(c.title) : c.chartType} · ${pos(c.x, c.y)} · ${size(c.width * c.scale, c.height * c.scale)}`,
      };
    }
    case 'user-image': {
      const u = item.data;
      return {
        id: u.id,
        kind: 'user-image',
        label: `Bild ${u.fileName} · ${pos(u.x, u.y)} · ${size(u.width * u.scale, u.height * u.scale)}`,
      };
    }
    case 'frame': {
      const f = item.data;
      return {
        id: f.id,
        kind: 'frame',
        label: `Rahmen ${f.clipType} · ${pos(f.x, f.y)} · ${size(f.width * f.scaleX, f.height * f.scaleY)}`,
      };
    }
    case 'balken':
      return {
        id: item.id,
        kind: 'balken',
        label: `Balken ${quote(item.data.texts.join(' / '))} · Versatz ${pos(item.data.offset.x, item.data.offset.y)}`,
      };
    case 'element':
      return null;
  }
}
