// SPDX-License-Identifier: MPL-2.0
import {
  buildCanvasItems,
  buildSortedRenderList,
  type CanvasItem,
} from '@ggraphic/editor/utils/canvasLayerManager';
import { hostElementKind } from '@ggraphic/editor/utils/elementKinds';
import { isLayerLocked } from '@ggraphic/editor/utils/layerLock';
import { isComposerPlane } from '@ggraphic/editor/utils/shapes';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';
import type { HostCanvasAiSnapshot } from '@ggraphic/editor/ai/types';
import type { HostElementKindName } from '@ggraphic/editor/utils/canvasItem';

type HostEntry = HostCanvasAiSnapshot['elementsSummary'][number];
// `balken` is the one kind the core itself draws but its own snapshot schema
// leaves to the host (the host binds it through `CanvasAiHostTypes`), and a
// host kind is named by its registration; the host's snapshot lists both.
type SummaryEntry = Omit<HostEntry, 'kind'> & {
  kind: HostEntry['kind'] | 'balken' | HostElementKindName;
};

/** Keeps the prompt bounded on crowded canvases. */
const MAX_ENTRIES = 40;

const r = (n: number) => Math.round(n);
const pos = (x: number, y: number) => `x=${r(x)} y=${r(y)}`;
const sc = (n: number) => Math.round(n * 100) / 100;
const size = (w: number, h: number) => `${r(w)}×${r(h)}`;
/** Drehung um die Mitte, wie `update-element` sie setzt; ungedreht steht nichts da. */
const turned = (deg: number | undefined) => (deg ? ` · gedreht ${r(deg)}°` : '');
const quote = (text: string) => `"${text.replace(/\s+/g, ' ').trim().slice(0, 40)}"`;

/** The wording of the element lines, for a host kind's `describe` (`registerElementKind`). */
export const aiLabelFormat = { position: pos, size, turned, quote } as const;

/**
 * One compact German line per user-placed element, in z-order (Ebene 1 is at
 * the back), so the planner can target any of them with update-element /
 * remove-element and reason about where things are.
 */
export function describeCanvasElements(state: BaseCanvasState): HostEntry[] {
  // Boundary cast: see SummaryEntry — the host's snapshot lists `balken`.
  return describeEntries(state) as HostEntry[];
}

function describeEntries(state: BaseCanvasState): SummaryEntry[] {
  const items = buildSortedRenderList(
    // Boundary cast: buildCanvasItems reads only `elements`, and template
    // elements are not AI-targetable anyway.
    buildCanvasItems({ elements: [] } as unknown as FullCanvasConfig<BaseCanvasState>, state),
    state.layerOrder ?? []
  );
  const total = items.length;
  const entries = items.flatMap((item, i) => {
    const entry = describeItem(item, state);
    if (!entry) return [];
    const locked = isLayerLocked(state, item.id) ? ' · gesperrt' : '';
    return [{ ...entry, label: `${entry.label} · Ebene ${i + 1}/${total}${locked}` }];
  });
  if (entries.length <= MAX_ENTRIES) return entries;
  const listed = entries.slice(0, MAX_ENTRIES);
  const last = listed[MAX_ENTRIES - 1];
  listed[MAX_ENTRIES - 1] = {
    ...last,
    label: `${last.label} · … und ${entries.length - MAX_ENTRIES} weitere`,
  };
  return listed;
}

function describeItem(item: CanvasItem, state: BaseCanvasState): SummaryEntry | null {
  switch (item.type) {
    case 'additional-text': {
      const t = item.data;
      return {
        id: t.id,
        kind: 'text',
        label: `${quote(t.text)} · ${pos(t.x, t.y)}${turned(t.rotation)} Breite ${r(t.width)} · Schrift ${r(t.fontSize)}px · Farbe ${t.fill}`,
      };
    }
    case 'shape': {
      const s = item.data;
      const plane = isComposerPlane(s.id) ? ' (Hintergrundfläche)' : '';
      const gradient = s.fillGradient ? ' · Verlauf' : '';
      return {
        id: s.id,
        kind: 'shape',
        label: `${s.type}${plane} · ${pos(s.x, s.y)}${turned(s.rotation)} · ${size(s.width * s.scaleX, s.height * s.scaleY)} · Farbe ${s.fill}${gradient}`,
      };
    }
    case 'pill-badge': {
      const p = item.data;
      return {
        id: p.id,
        kind: 'pill-badge',
        label: `${quote(p.text)} · ${pos(p.x, p.y)}${turned(p.rotation)} · Schrift ${r(p.fontSize * p.scale)}px · Farbe ${p.backgroundColor}`,
      };
    }
    case 'circle-badge': {
      const c = item.data;
      const text = c.textLines.map((l) => l.text).join(' ');
      return {
        id: c.id,
        kind: 'circle-badge',
        label: `${quote(text)} · ${pos(c.x, c.y)}${turned(c.rotation)} · Durchmesser ${r(2 * c.radius * c.scale)} · Farbe ${c.backgroundColor}`,
      };
    }
    case 'icon': {
      const icon = state.iconStates?.[item.id];
      if (!icon) return null;
      return {
        id: item.id,
        kind: 'icon',
        label: `${icon.iconId ?? item.id} · ${pos(icon.x, icon.y)}${turned(icon.rotation)} · Skalierung ${sc(icon.scale)}${icon.color ? ` · Farbe ${icon.color}` : ''}`,
      };
    }
    case 'asset':
      return {
        id: item.id,
        kind: 'asset',
        label: `${item.data.assetId} · ${pos(item.data.x, item.data.y)}${turned(item.data.rotation)} · Skalierung ${sc(item.data.scale)}`,
      };
    case 'illustration':
      return {
        id: item.id,
        kind: 'illustration',
        label: `${item.data.illustrationId} · ${pos(item.data.x, item.data.y)}${turned(item.data.rotation)} · Skalierung ${sc(item.data.scale)}`,
      };
    case 'chart': {
      const c = item.data;
      return {
        id: c.id,
        kind: 'chart',
        label: `Diagramm ${c.title ? quote(c.title) : c.chartType} · ${pos(c.x, c.y)}${turned(c.rotation)} · ${size(c.width * c.scale, c.height * c.scale)}`,
      };
    }
    case 'user-image': {
      const u = item.data;
      return {
        id: u.id,
        kind: 'user-image',
        label: `Bild ${u.fileName} · ${pos(u.x, u.y)}${turned(u.rotation)} · ${size(u.width * u.scale, u.height * u.scale)}`,
      };
    }
    case 'frame': {
      const f = item.data;
      return {
        id: f.id,
        kind: 'frame',
        label: `Rahmen ${f.clipType} · ${pos(f.x, f.y)}${turned(f.rotation)} · ${size(f.width * f.scaleX, f.height * f.scaleY)}`,
      };
    }
    case 'balken':
      return {
        id: item.id,
        kind: 'balken',
        label: `Balken ${quote(item.data.texts.join(' / '))} · Versatz ${pos(item.data.offset.x, item.data.offset.y)}${turned(item.data.rotation)}`,
      };
    case 'element':
      return null;
    default:
      return describeHostItem(item);
  }
}

/** A host kind's line, by its registration's `describe`; none without one. */
function describeHostItem(item: { id: string; type: string; data: unknown }): SummaryEntry | null {
  const host = hostElementKind(item.type);
  if (!host?.describe) return null;
  // Boundary: the item of this host kind carries the registration's own instance.
  return { id: item.id, kind: host.kind, label: host.describe(item.data as never) };
}
