const PETALS = Array.from({ length: 12 }, (_, i) => i * 30);

export function PortraitPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`site:relative site:overflow-hidden site:bg-ground site:text-heading ${className}`}
    >
      <svg
        className="site:absolute site:inset-0 site:size-full"
        viewBox="0 0 400 500"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <rect width="400" height="500" fill="currentColor" fillOpacity="0.08" />
        <circle cx="340" cy="60" r="150" fill="currentColor" fillOpacity="0.06" />
        <circle cx="40" cy="460" r="190" fill="currentColor" fillOpacity="0.06" />
        <g transform="translate(200 250)">
          {PETALS.map((angle) => (
            <ellipse
              key={angle}
              rx="22"
              ry="68"
              fill="currentColor"
              fillOpacity="0.22"
              transform={`rotate(${angle}) translate(0 -88)`}
            />
          ))}
          <circle r="42" fill="currentColor" fillOpacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
