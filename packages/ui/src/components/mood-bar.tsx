import * as React from 'react';

import { cn } from '../lib/cn';

interface MoodBarProps {
  position: number;
  label?: string;
  className?: string;
}

function getMoodLabel(position: number): string {
  if (position >= 70) return 'Überwiegend positiv';
  if (position >= 55) return 'Leicht positiv';
  if (position >= 45) return 'Ausgeglichen';
  if (position >= 30) return 'Leicht negativ';
  return 'Überwiegend negativ';
}

function MoodBar({ position, label, className }: MoodBarProps) {
  const displayLabel = label ?? getMoodLabel(position);

  return (
    <div className={cn('space-y-sm', className)}>
      <div className="relative h-4 rounded-full overflow-hidden bg-gradient-to-r from-red-400 via-yellow-300 to-green-400 dark:from-red-600 dark:via-yellow-500 dark:to-green-600">
        <div
          className="absolute top-0 h-full w-1 bg-foreground rounded-full shadow-lg transition-all duration-700 ease-out"
          style={{ left: `clamp(2%, ${position}%, 98%)` }}
        />
        <div
          className="absolute -top-0.5 h-5 w-5 rounded-full border-2 border-foreground bg-background shadow-md transition-all duration-700 ease-out"
          style={{ left: `clamp(2%, calc(${position}% - 10px), 96%)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-grey-400">
        <span>Negativ</span>
        <span className="font-medium text-foreground">{displayLabel}</span>
        <span>Positiv</span>
      </div>
    </div>
  );
}

export { MoodBar, getMoodLabel, type MoodBarProps };
