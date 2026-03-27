import { memo } from 'react';

const CLOUD_PATH = [
  'M 14,44',
  'C 5,44 2,38 2,32',
  'C 2,25 8,20 15,20',
  'C 15,13 23,7 32,7',
  'C 38,7 42,3 50,3',
  'C 58,3 63,7 63,7',
  'C 67,4 74,5 79,9',
  'C 85,6 94,11 96,18',
  'C 103,19 108,25 108,32',
  'C 108,38 104,44 96,44',
  'Z',
].join(' ');

interface CloudButtonProps {
  onClick: () => void;
  label?: string;
}

const CloudButton = memo(({ onClick, label = 'Einrichtung starten' }: CloudButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className="group relative cursor-pointer border-none bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-xl transition-transform duration-300 ease-out hover:-translate-y-1 active:translate-y-0"
    aria-label={label}
  >
    <svg
      viewBox="0 0 110 48"
      className="w-64 h-auto drop-shadow-md transition-[filter] duration-300 group-hover:drop-shadow-lg"
      aria-hidden
    >
      <defs>
        <filter id="cloud-btn-inner" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
          <feOffset in="blur" dx="0" dy="1.5" result="offsetBlur" />
          <feComposite in="offsetBlur" in2="SourceAlpha" operator="in" result="innerShadow" />
          <feFlood floodColor="white" floodOpacity="0.25" result="white" />
          <feComposite in="white" in2="innerShadow" operator="in" result="highlight" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="highlight" />
          </feMerge>
        </filter>
      </defs>

      <path d={CLOUD_PATH} fill="var(--primary-500)" filter="url(#cloud-btn-inner)" />

      <path
        d={CLOUD_PATH}
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        strokeOpacity="0.2"
        className="pointer-events-none"
      />

      <text
        x="55"
        y="30"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="7.5"
        fontWeight="600"
        fontFamily="Raleway, PT Sans, Arial, sans-serif"
        className="pointer-events-none select-none"
      >
        {label}
      </text>
    </svg>
  </button>
));

CloudButton.displayName = 'CloudButton';

export default CloudButton;
