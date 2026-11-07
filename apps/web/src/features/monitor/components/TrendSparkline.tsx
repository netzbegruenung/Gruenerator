/**
 * 12-week trend sparkline (area + line + end dot). Takes the surface's accent:
 * magenta under `.dashboard-surface`, forest green elsewhere (notebook overview).
 */
export function TrendSparkline({
  points,
  width = 260,
}: {
  points: { date: string; value: number }[];
  width?: number;
}) {
  const s = points.slice(-12).map((p) => p.value);
  if (s.length < 2) return null;
  const W = width;
  const H = 72;
  const P = 6;
  const min = Math.min(...s);
  const max = Math.max(...s);
  const rng = max - min || 1;
  const pts = s.map(
    (v, i) =>
      [P + (i * (W - 2 * P)) / (s.length - 1), H - P - ((v - min) / rng) * (H - 2 * P)] as const
  );
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const last = pts[pts.length - 1];
  const fill = `${line} L${last[0].toFixed(1)} ${H - P} L${pts[0][0].toFixed(1)} ${H - P} Z`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className="max-w-full overflow-visible"
    >
      <path d={fill} fill="var(--dash-mg-tint, rgba(82,144,122,0.12))" />
      <path
        d={line}
        fill="none"
        stroke="var(--dash-mg, #52907a)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={4} fill="var(--dash-mg-ink, #316049)" />
    </svg>
  );
}
