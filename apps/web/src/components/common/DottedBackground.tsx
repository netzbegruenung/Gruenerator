import { useId } from 'react';

export function DottedBackground() {
  const id = useId();
  const patternId = `dotted-bg-${id}`;

  return (
    <div className="absolute inset-0 h-full w-full pointer-events-none z-0">
      <svg className="h-full w-full text-grey-300 dark:text-[#3e3e3e]">
        <pattern
          id={patternId}
          x="10"
          y="10"
          width="14.4"
          height="14.4"
          patternUnits="userSpaceOnUse"
          patternTransform="translate(-0.45,-0.45)"
        >
          <circle cx="0.45" cy="0.45" r="0.45" fill="currentColor" />
        </pattern>
        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
