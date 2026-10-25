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

    const hide = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      badge.style.display = 'none';
    };

    const paint = () => {
      raf = 0;
      const tr = stage.find<Konva.Transformer>('Transformer').find((t) => t.isTransforming());
      const anchor = tr?.getActiveAnchor() ?? null;
      const nodes = tr?.nodes() ?? [];
      if (!tr || nodes.length === 0) return hide();

      let frame: NodeFrame;
      if (nodes.length === 1) {
        frame = readNodeFrame(nodes[0]!);
      } else {
        const w = tr.width() / stage.scaleX();
        const h = tr.height() / stage.scaleY();
        frame = {
          x: 0,
          y: 0,
          rotation: tr.rotation(),
          scaleX: 1,
          scaleY: 1,
          offsetX: 0,
          offsetY: 0,
          local: { x: 0, y: 0, width: w, height: h },
        };
      }
      const label = transformHudLabel(anchor, frame, 1);
      if (!label) return hide();

      const rect = tr.getClientRect();
      const host = badge.parentElement;
      const hostWidth = host?.getBoundingClientRect().width ?? 0;
      const css = stage.width() && hostWidth ? hostWidth / stage.width() : 1;
      badge.textContent = label;
      badge.style.display = 'block';
      badge.style.transform =
        `translate(${rect.x + rect.width / 2}px, ${rect.y + rect.height + GAP / css}px) ` +
        `translate(-50%, 0) scale(${1 / css})`;
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    stage.on('transform.hud', schedule);
    stage.on('transformend.hud', hide);
    return () => {
      stage.off('transform.hud');
      stage.off('transformend.hud');
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
