import { memo } from 'react';

interface SkillBadgeProps {
  avatar: string;
  title: string;
  backgroundColor: string;
}

export const SkillBadge = memo(function SkillBadge({
  avatar,
  title,
  backgroundColor,
}: SkillBadgeProps) {
  return (
    <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-xs">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none"
        style={{ backgroundColor }}
      >
        {avatar}
      </span>
      <span className="font-medium text-foreground-muted">{title}</span>
    </div>
  );
});
