const PETAL_COUNT = 12;

interface HeroImagePlaceholderProps {
  className?: string;
}

/**
 * Decorative stand-in for the hero profile image so the hero layout looks the
 * same whether or not a photo has been uploaded: a stylized sunflower pattern
 * on the primary gradient.
 */
export function HeroImagePlaceholder({ className }: HeroImagePlaceholderProps) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-primary-500 to-primary-800 ${className ?? ''}`}
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 500"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <circle cx="340" cy="60" r="150" fill="white" opacity="0.06" />
        <circle cx="40" cy="460" r="190" fill="white" opacity="0.05" />
        <g transform="translate(200, 250)">
          {Array.from({ length: PETAL_COUNT }, (_, i) => (
            <ellipse
              key={i}
              rx="22"
              ry="68"
              fill="white"
              opacity="0.14"
              transform={`rotate(${(360 / PETAL_COUNT) * i}) translate(0, -88)`}
            />
          ))}
          <circle r="42" fill="white" opacity="0.22" />
        </g>
      </svg>
    </div>
  );
}
