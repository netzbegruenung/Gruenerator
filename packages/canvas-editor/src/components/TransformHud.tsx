import { useEffect, useRef } from 'react';

import { readNodeFrame, type NodeFrame } from '../utils/orientation';
import { transformHudLabel } from '../utils/transformHudLabel';

import type Konva from 'konva';

const GAP = 12;

/**
 * Angle / size badge while a Transformer is dragged. Sits in the DOM beside
 * the stage, so no export ever captures it. Updated imperatively from a
 * rAF-coalesced stage listener: no React state, no store writes per frame.
 * Node frames are read inside the logical group, i.e. already in logical px.
 */
export function TransformHud({
  stageRef,
  enabled,
}: {
  stageRef: React.RefObject<Konva.Stage | null>;
  enabled: boolean;
}) {
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const badge = badgeRef.current;
    if (!stage || !badge || !enabled) return;

    let raf = 0;
    let active: Konva.Transformer | null = null;
    const attached = new Set<Konva.Transformer>();

    const hide = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      active = null;
      badge.style.display = 'none';
    };

    const paint = () => {
      raf = 0;
      const tr = active;
      const anchor = tr?.getActiveAnchor() ?? null;
      const nodes = tr?.nodes() ?? [];
      if (!tr || nodes.length === 0) return;

      let frame: NodeFrame;
      if (nodes.length === 1) {
        frame = readNodeFrame(nodes[0]!);
      } else {
        // The transformer box is in absolute px; the nodes live in the logical
        // group, so divide by that group's absolute scale to get logical px.
        const abs = nodes[0]!.getParent()?.getAbsoluteScale() ?? { x: 1, y: 1 };
        frame = {
          x: 0,
          y: 0,
          rotation: tr.rotation(),
          scaleX: 1,
          scaleY: 1,
          offsetX: 0,
          offsetY: 0,
          local: { x: 0, y: 0, width: tr.width() / abs.x, height: tr.height() / abs.y },
        };
      }
      const label = transformHudLabel(anchor, frame, 1);
      if (!label) {
        badge.style.display = 'none';
        return;
      }

      const rect = tr.getClientRect();
      const host = badge.parentElement;
      const hostWidth = host?.getBoundingClientRect().width ?? 0;
      const css = stage.width() && hostWidth ? hostWidth / stage.width() : 1;
      badge.textContent = label;
      badge.style.display = 'block';
      // Konva px -> container px; the badge itself is counter-scaled so it
      // keeps its size under the page zoom.
      const w = badge.offsetWidth;
      const h = badge.offsetHeight;
      const left = Math.min(
        Math.max(rect.x + rect.width / 2, w / (2 * css)),
        stage.width() - w / (2 * css)
      );
      const below = rect.y + rect.height + GAP / css;
      const top = below + h / css > stage.height() ? rect.y - GAP / css - h / css : below;
      badge.style.transform =
        `translate(${left}px, ${Math.max(0, top)}px) ` + `scale(${1 / css}) translate(-50%, 0)`;
    };

    const onTransform = (tr: Konva.Transformer) => {
      active = tr;
      if (!raf) raf = requestAnimationFrame(paint);
    };

    // Konva fires transform / transformend on the Transformer and its nodes
    // without bubbling, so the stage never sees them. Transformers come and go
    // with the selection, so (re)attach to all of them on each press, which
    // always precedes a transform.
    const attach = () => {
      for (const tr of stage.find<Konva.Transformer>('Transformer')) {
        if (attached.has(tr)) continue;
        attached.add(tr);
        tr.on('transform.hud', () => onTransform(tr));
        tr.on('transformend.hud', hide);
      }
    };
    const container = stage.container();
    attach();
    container.addEventListener('pointerdown', attach, true);
    container.addEventListener('touchstart', attach, true);
    return () => {
      container.removeEventListener('pointerdown', attach, true);
      container.removeEventListener('touchstart', attach, true);
      attached.forEach((tr) => {
        tr.off('transform.hud');
        tr.off('transformend.hud');
      });
      hide();
    };
  }, [stageRef, enabled]);

  return (
    <div
      ref={badgeRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-md bg-[var(--editor-text)] px-2 py-1 text-[11px] font-medium tabular-nums text-[var(--editor-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
      style={{ display: 'none', transformOrigin: '0 0' }}
    />
  );
}
