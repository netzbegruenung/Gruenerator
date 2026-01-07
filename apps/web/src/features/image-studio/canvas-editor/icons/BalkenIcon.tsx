import type { SVGProps } from 'react';

/**
 * Custom icon representing 3 skewed parallelogram bars (balkens)
 * Used in the Dreizeilen canvas editor sidebar
 */
interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
}

export function BalkenIcon({ size = '1em', ...props }: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            {/* Top balken - skewed parallelogram */}
            <path d="M 3 4 L 2 7 L 14 7 L 15 4 Z" />

            {/* Middle balken - skewed parallelogram */}
            <path d="M 5 10 L 4 13 L 20 13 L 21 10 Z" />

            {/* Bottom balken - skewed parallelogram */}
            <path d="M 4 16 L 3 19 L 17 19 L 18 16 Z" />
        </svg>
    );
}
