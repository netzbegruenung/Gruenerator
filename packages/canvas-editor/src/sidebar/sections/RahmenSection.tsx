import { FRAME_PRESET_PATHS, type FrameClipType } from '../../utils/frameUtils';

const PREVIEW_GRADIENT_ID = 'rahmen-preset-preview-gradient';

/** The gradient every `FramePresetPreview` fills with; render once per document. */
export function FramePreviewDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id={PREVIEW_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="55%" stopColor="#bbf7d0" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function FramePresetPreview({
  clipType,
  className = 'size-11',
}: {
  clipType: FrameClipType;
  className?: string;
}) {
  const path = FRAME_PRESET_PATHS[clipType];
  const clipId = `frame-preset-clip-${clipType}`;
  // Ring is the only annular preset; render its two subpaths with even-odd
  // fill so the hole shows through the gradient miniature.
  const isAnnular = clipType === 'ring';
  const evenOddProps = isAnnular ? { clipRule: 'evenodd' as const } : {};
  const fillRuleProps = isAnnular ? { fillRule: 'evenodd' as const } : {};
  return (
    <svg viewBox="0 0 44 44" className={className}>
      <defs>
        <clipPath id={clipId} {...evenOddProps}>
          <path d={path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="44" height="44" fill={`url(#${PREVIEW_GRADIENT_ID})`} />
        <path
          d="M0 36 L12 22 L20 30 L28 18 L36 28 L44 24 L44 44 L0 44 z"
          fill="#15803d"
          opacity={0.55}
        />
        <circle cx="33" cy="13" r="3" fill="#fde68a" />
      </g>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={1.25}
        {...fillRuleProps}
      />
    </svg>
  );
}
