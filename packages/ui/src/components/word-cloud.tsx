import * as React from 'react';

import { cn } from '../lib/cn';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface WordCloudItem {
  key: string;
  label: string;
  value: number;
  color?: string;
  href?: string;
  tooltip?: React.ReactNode;
}

interface WordCloudProps {
  items: WordCloudItem[];
  minFontSize?: number;
  maxFontSize?: number;
  minOpacity?: number;
  className?: string;
}

function getFontSize(
  value: number,
  min: number,
  max: number,
  minFont: number,
  maxFont: number
): number {
  if (max === min) return (minFont + maxFont) / 2;
  const ratio = (value - min) / (max - min);
  return minFont + ratio * (maxFont - minFont);
}

function getOpacity(value: number, min: number, max: number, minOpacity: number): number {
  if (max === min) return 1;
  const ratio = (value - min) / (max - min);
  return minOpacity + ratio * (1 - minOpacity);
}

function WordCloud({
  items,
  minFontSize = 0.75,
  maxFontSize = 2.55,
  minOpacity = 0.45,
  className,
}: WordCloudProps) {
  if (items.length === 0) return null;

  const values = items.map((i) => i.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1.5', className)}>
        {items.map((item) => {
          const fontSize = getFontSize(item.value, minVal, maxVal, minFontSize, maxFontSize);
          const opacity = getOpacity(item.value, minVal, maxVal, minOpacity);

          const element = item.href ? (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold leading-tight no-underline hover:underline transition-opacity hover:opacity-100"
              style={{ fontSize: `${fontSize}rem`, color: item.color, opacity }}
            >
              {item.label}
            </a>
          ) : (
            <span
              className="font-semibold leading-tight cursor-default transition-opacity hover:opacity-100"
              style={{ fontSize: `${fontSize}rem`, color: item.color, opacity }}
            >
              {item.label}
            </span>
          );

          if (item.tooltip) {
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>{element}</TooltipTrigger>
                <TooltipContent>{item.tooltip}</TooltipContent>
              </Tooltip>
            );
          }

          return <React.Fragment key={item.key}>{element}</React.Fragment>;
        })}
      </div>
    </TooltipProvider>
  );
}

export { WordCloud, type WordCloudItem, type WordCloudProps };
