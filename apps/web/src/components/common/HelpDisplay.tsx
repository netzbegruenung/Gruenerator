import React, { useEffect, useState, type JSX } from 'react';

import useGeneratedTextStore from '../../stores/core/generatedTextStore';

import { cn } from '@/utils/cn';

interface HelpDisplayProps {
  content: string;
  tips?: string[];
  forceHidden?: boolean;
  hasGeneratedContent?: boolean;
  isNewFeature?: boolean;
  featureId?: string;
  fallbackContent?: string;
  fallbackTips?: string[];
  layout?: 'default' | 'cards';
  features?: {
    title?: string;
    description?: string;
  }[];
}

const HelpDisplay = ({
  content,
  tips,
  forceHidden,
  hasGeneratedContent,
  isNewFeature,
  featureId,
  fallbackContent,
  fallbackTips,
  layout = 'default',
  features = [],
}: HelpDisplayProps): JSX.Element | null => {
  // Check if any generated text exists in the store
  const generatedTexts = useGeneratedTextStore((state) => state.generatedTexts);
  const hasAnyGeneratedText = Object.values(generatedTexts).some((text) => text && text.length > 0);

  const hasSeenFeature = React.useMemo(() => {
    if (!featureId || !isNewFeature) return false;
    return localStorage.getItem(`feature-seen-${featureId}`) === 'true';
  }, [featureId, isNewFeature]);

  // Mark as seen AFTER first render (so border shows on first visit)
  useEffect(() => {
    if (isNewFeature && featureId && !hasSeenFeature) {
      localStorage.setItem(`feature-seen-${featureId}`, 'true');
    }
  }, [isNewFeature, featureId, hasSeenFeature]);

  // All hooks must be called before any conditional returns
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const displayContent = hasSeenFeature && fallbackContent ? fallbackContent : content;
  const displayTips = hasSeenFeature && fallbackTips ? fallbackTips : tips;
  const showNewFeatureStyle = isNewFeature && !hasSeenFeature;

  const featureItems =
    layout === 'cards'
      ? features ||
        displayTips?.map((tip, idx) => ({
          title: `Tipp ${idx + 1}`,
          description: typeof tip === 'string' ? tip : '',
        })) ||
        []
      : [];

  // Auto-scroll effect for cards layout
  useEffect(() => {
    if (layout !== 'cards' || featureItems.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % featureItems.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [layout, featureItems.length, isPaused]);

  const isHidden = forceHidden || hasGeneratedContent || hasAnyGeneratedText;

  if (!displayContent || isHidden) {
    return null;
  }

  if (layout === 'cards') {
    if (featureItems.length === 0) return null;

    const currentTip = featureItems[activeIndex] || featureItems[0];

    return (
      <div
        className="flex flex-col gap-sm max-w-[280px] p-0 mb-0 max-[768px]:max-w-full"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {displayContent && (
          <p className="text-left text-grey-500 mb-sm text-[0.9rem]">{displayContent}</p>
        )}
        <div className="bg-background-pure border border-grey-200 dark:border-grey-700 rounded-2xl p-md transition-colors duration-200 hover:border-primary-600 max-[768px]:w-[240px] max-[768px]:p-sm">
          <h3 className="text-[0.95rem] font-semibold text-foreground-heading m-0 mb-xs">
            {currentTip.title}
          </h3>
          <p className="text-[0.85rem] text-grey-500 m-0 leading-relaxed">
            {currentTip.description}
          </p>
        </div>
        {featureItems.length > 1 && (
          <div className="flex justify-center gap-xs pt-xs">
            {featureItems.map((_, index) => (
              <button
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full bg-foreground opacity-30 cursor-pointer border-none p-0 transition-all duration-200 hover:opacity-50',
                  index === activeIndex && 'opacity-100 scale-[1.2]'
                )}
                onClick={() => setActiveIndex(index)}
                aria-label={`Tipp ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg pt-0 mb-5',
        showNewFeatureStyle && 'bg-background-alt rounded-lg px-md py-sm'
      )}
    >
      <div className="text-base leading-relaxed max-[768px]:p-0 [&_h4]:mt-2.5 [&_h4]:mb-2.5 [&_h4]:text-foreground-heading [&_h4]:block [&_p_strong]:mt-2.5 [&_p_strong]:mb-2.5 [&_p_strong]:text-foreground-heading [&_p_strong]:block [&_ul]:list-none [&_ul]:pl-0 [&_ul]:m-0 [&_li]:mb-2 [&_li]:pl-5 [&_li]:relative [&_li]:before:content-['\\2022'] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:text-primary-600">
        {showNewFeatureStyle && (
          <span className="inline-block bg-primary-600 text-white px-2 py-0.5 rounded-[4px] text-xs font-semibold mb-sm uppercase tracking-wider">
            Neu
          </span>
        )}
        <div className="[&_p]:mb-sm [&_p]:whitespace-pre-line [&_p:last-child]:mb-0">
          {(() => {
            const colonOrPeriodMatch = displayContent.match(/^([^:.]+[:.]\s*)(.+)$/);

            if (colonOrPeriodMatch && colonOrPeriodMatch[2].includes(',')) {
              const [, prefix, itemsText] = colonOrPeriodMatch;
              const items = itemsText
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item);

              if (items.length > 1) {
                return (
                  <>
                    <p>{prefix}</p>
                    <ul>
                      {items.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </>
                );
              }
            }

            return displayContent
              .split('\n')
              .filter((line) => line.trim())
              .map((line, idx) => <p key={idx}>{line}</p>);
          })()}
        </div>
        {displayTips && displayTips.length > 0 && (
          <>
            <p>
              <strong>Tipps:</strong>
            </p>
            <ul>
              {displayTips.map((tip, index) => (
                <li key={index}>
                  {(() => {
                    if (typeof tip === 'string') {
                      const beiMatch = tip.match(/^(Bei [^:]+:\s*)(.+)$/);
                      if (beiMatch && beiMatch[2].includes(' - ')) {
                        const [, prefix, rest] = beiMatch;
                        const parts = rest.split(' - ');
                        const description = parts[0];
                        const formats = parts[1];

                        if (formats && formats.includes(', ')) {
                          const formatItems = formats.split(', ').map((item) => item.trim());
                          return (
                            <>
                              <strong>{prefix}</strong>
                              {description}
                              <ul style={{ marginTop: '4px' }}>
                                {formatItems.map((format, idx) => (
                                  <li key={idx}>{format}</li>
                                ))}
                              </ul>
                            </>
                          );
                        }
                      }
                    }

                    return tip;
                  })()}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default HelpDisplay;
