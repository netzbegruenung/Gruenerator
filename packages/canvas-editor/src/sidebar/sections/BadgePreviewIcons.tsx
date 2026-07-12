interface PreviewIconProps {
  size?: number;
}

const GREEN = '#005538';
const TEXT_COLOR = '#fff';

export function PillBadgePreviewIcon({ size = 48 }: PreviewIconProps) {
  const w = size;
  const h = size * 0.55;
  const pillH = h * 0.5;
  const pillW = w * 0.85;
  const pillR = pillH / 2;
  const pillX = (w - pillW) / 2;
  const pillY = (h - pillH) / 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={pillR} ry={pillR} fill={GREEN} />
      <text
        x={w / 2}
        y={h / 2 + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={TEXT_COLOR}
        fontSize={pillH * 0.42}
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
      >
        Text
      </text>
    </svg>
  );
}

export function StorerPreviewIcon({ size = 48 }: PreviewIconProps) {
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cy} r={r} fill={GREEN} />
      <text
        x={cx}
        y={cy - r * 0.18}
        textAnchor="middle"
        dominantBaseline="central"
        fill={TEXT_COLOR}
        fontSize={r * 0.38}
        fontFamily="Arial, sans-serif"
      >
        SA
      </text>
      <text
        x={cx}
        y={cy + r * 0.15}
        textAnchor="middle"
        dominantBaseline="central"
        fill={TEXT_COLOR}
        fontSize={r * 0.55}
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
      >
        12.
      </text>
      <text
        x={cx}
        y={cy + r * 0.52}
        textAnchor="middle"
        dominantBaseline="central"
        fill={TEXT_COLOR}
        fontSize={r * 0.32}
        fontFamily="Arial, sans-serif"
      >
        18 Uhr
      </text>
    </svg>
  );
}

export function SingleBalkenPreviewIcon({ size = 48 }: PreviewIconProps) {
  const w = size;
  const h = size * 0.55;
  const barH = h * 0.55;
  const barW = w * 0.8;
  const skew = Math.tan((12 * Math.PI) / 180) * barH;
  const cx = w / 2;
  const cy = h / 2;
  const x0 = cx - barW / 2;
  const y0 = cy - barH / 2;

  const points = [
    `${x0 + skew / 2},${y0}`,
    `${x0 + barW + skew / 2},${y0}`,
    `${x0 + barW - skew / 2},${y0 + barH}`,
    `${x0 - skew / 2},${y0 + barH}`,
  ].join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polygon points={points} fill={GREEN} />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={TEXT_COLOR}
        fontSize={barH * 0.42}
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
      >
        GRÜNE
      </text>
    </svg>
  );
}

export function TripleBalkenPreviewIcon({ size = 48 }: PreviewIconProps) {
  const w = size;
  const h = size * 0.75;
  const barH = h * 0.28;
  const gap = h * 0.03;
  const fontSize = barH * 0.48;
  const skew = Math.tan((12 * Math.PI) / 180) * barH;
  const cx = w / 2;
  const totalH = barH * 3 + gap * 2;
  const startY = (h - totalH) / 2;
  const padX = fontSize * 0.6;

  // Each labelled bar is sized to fit its text with padding — mirroring how the
  // real canvas element fits bars to their text — and the text is constrained
  // with textLength so it always sits inside the bar regardless of the font the
  // app renders with. The third bar is decorative (no label, fixed width).
  const bars: { text: string; offset: number; width?: number }[] = [
    { text: 'DIE', offset: 4 },
    { text: 'GRÜNEN', offset: -2 },
    { text: '', offset: 6, width: w * 0.6 },
  ];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      {bars.map((bar, i) => {
        const fit = bar.text.length * fontSize * 0.62 + padX * 2 + skew;
        const bw = bar.width ?? Math.min(fit, w - 4);
        const x0 = Math.max(skew / 2, Math.min(w - bw - skew / 2, cx - bw / 2 + bar.offset));
        const y0 = startY + i * (barH + gap);

        const pts = [
          `${x0 + skew / 2},${y0}`,
          `${x0 + bw + skew / 2},${y0}`,
          `${x0 + bw - skew / 2},${y0 + barH}`,
          `${x0 - skew / 2},${y0 + barH}`,
        ].join(' ');

        const textLen = bw - skew - padX * 2;

        return (
          <g key={i}>
            <polygon points={pts} fill={GREEN} />
            {bar.text && textLen > 0 && (
              <text
                x={x0 + bw / 2}
                y={y0 + barH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={TEXT_COLOR}
                fontSize={fontSize}
                fontFamily="Arial, sans-serif"
                fontWeight="bold"
                textLength={textLen}
                lengthAdjust="spacingAndGlyphs"
              >
                {bar.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DiagrammePreviewIcon({ size = 48 }: PreviewIconProps) {
  const s = size;
  return (
    <svg width={s} height={s * 0.75} viewBox="0 0 64 48" fill="none" aria-hidden>
      <rect x="8" y="20" width="10" height="22" rx="2" fill="#005538" />
      <rect x="22" y="8" width="10" height="34" rx="2" fill="#8ABD24" />
      <rect x="36" y="26" width="10" height="16" rx="2" fill="#4A9FD4" />
      <rect x="50" y="14" width="10" height="28" rx="2" fill="#005538" />
    </svg>
  );
}
