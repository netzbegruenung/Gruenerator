import { cn } from '../../../../utils/cn';

import type { ReactNode } from 'react';

interface TimelineItem {
  date?: string;
  title?: string;
  content?: string | ReactNode;
}

interface TimelineBlockProps {
  items?: TimelineItem[];
  className?: string;
}

const TimelineBlock = ({ items = [], className = '' }: TimelineBlockProps) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'my-2xl relative w-full max-w-none min-[1025px]:my-[calc(var(--spacing-2xl)*1.5)]',
        "before:content-[''] before:absolute before:left-[20px] before:top-0 before:bottom-0 before:w-[2px] before:bg-secondary-600 min-[1025px]:before:left-[30px] min-[1025px]:before:w-[3px] max-md:before:left-[15px]",
        className
      )}
    >
      {items.map((item: TimelineItem, index: number) => (
        <div
          key={index}
          className={cn(
            'relative pl-[60px] mb-xl min-[1025px]:pl-[80px] min-[1025px]:mb-2xl max-md:pl-[45px]',
            "before:content-[''] before:absolute before:left-[12px] before:top-[8px] before:w-[16px] before:h-[16px] before:bg-secondary-600 before:rounded-full before:border-[3px] before:border-background before:shadow-[0_0_0_2px_var(--secondary-600)]",
            'min-[1025px]:before:left-[20px] min-[1025px]:before:top-[12px] min-[1025px]:before:w-[20px] min-[1025px]:before:h-[20px] min-[1025px]:before:border-[4px] min-[1025px]:before:shadow-[0_0_0_3px_var(--secondary-600)]',
            'max-md:before:left-[7px] max-md:before:w-[14px] max-md:before:h-[14px]'
          )}
        >
          {item.date && (
            <div className="font-['PT_Sans',Arial,sans-serif] text-[0.9rem] text-grey-400 font-semibold m-0 mb-xs">
              {item.date}
            </div>
          )}
          {item.title && (
            <h4 className="text-[1.25rem] text-[var(--font-color-h3)] m-0 mb-sm min-[1025px]:text-[1.5rem] min-[1025px]:mb-md">
              {item.title}
            </h4>
          )}
          {item.content && (
            <div className="text-foreground leading-relaxed min-[1025px]:text-lg min-[1025px]:leading-[1.7]">
              {typeof item.content === 'string' ? <p>{item.content}</p> : item.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TimelineBlock;
