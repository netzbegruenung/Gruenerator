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
  const gap = h * 0.02;
  const barW = w * 0.8;
  const skew = Math.tan((12 * Math.PI) / 180) * barH;
  const cx = w / 2;
  const totalH = barH * 3 + gap * 2;
  const startY = (h - totalH) / 2;

  const offsets = [4, -2, 6];
  const texts = ['DIE', 'GRÜNEN', ''];
  const widths = [barW * 0.55, barW, barW * 0.7];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      {[0, 1, 2].map((i) => {
        const bw = widths[i];
        const x0 = cx - bw / 2 + offsets[i];
        const y0 = startY + i * (barH + gap);
        const sk = Math.tan((12 * Math.PI) / 180) * barH;

        const pts = [
          `${x0 + sk / 2},${y0}`,
          `${x0 + bw + sk / 2},${y0}`,
          `${x0 + bw - sk / 2},${y0 + barH}`,
          `${x0 - sk / 2},${y0 + barH}`,
        ].join(' ');

        return (
          <g key={i}>
            <polygon points={pts} fill={GREEN} />
            {texts[i] && (
              <text
                x={x0 + bw / 2}
                y={y0 + barH / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={TEXT_COLOR}
                fontSize={barH * 0.42}
                fontFamily="Arial, sans-serif"
                fontWeight="bold"
              >
                {texts[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
