import { QuoteBlock, InfoBox, FactBox, CalloutBlock, TimelineBlock } from './blocks';

import type { ReactNode } from 'react';

interface TimelineItem {
  date?: string;
  title?: string;
  content?: string | ReactNode;
}

interface ContentBlock {
  type:
    | 'paragraph'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'quote'
    | 'infoBox'
    | 'factBox'
    | 'callout'
    | 'timeline'
    | 'html';
  text?: string;
  author?: string;
  title?: string;
  items?: string[];
  timelineItems?: TimelineItem[];
  variant?: string;
  content?: string;
  facts?: Array<{ number: string; label: string }>;
  buttonText?: string;
  buttonHref?: string;
  onClick?: () => void;
}

interface PageContentProps {
  content?: ContentBlock[] | string;
  children?: React.ReactNode;
}

const PageContent = ({ content, children }: PageContentProps) => {
  // If children are provided directly, use them
  if (children) {
    return (
      <div className="font-['PT_Sans',Arial,sans-serif] text-lg leading-[1.7] text-foreground max-w-[clamp(640px,50vw,900px)] mx-auto min-[1025px]:leading-[1.8] max-[1024px]:min-[769px]:max-w-[clamp(600px,80vw,750px)] max-md:text-base max-md:max-w-none [&>p]:mb-lg min-[1025px]:[&>p]:mb-xl [&>h2]:mt-2xl [&>h2]:mb-lg [&>h3]:mt-2xl [&>h3]:mb-lg [&>h4]:mt-2xl [&>h4]:mb-lg [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0 [&>h4:first-child]:mt-0">
        {children}
      </div>
    );
  }

  // If structured content is provided, render it
  if (content && Array.isArray(content)) {
    return (
      <div className="font-['PT_Sans',Arial,sans-serif] text-lg leading-[1.7] text-foreground max-w-[clamp(640px,50vw,900px)] mx-auto min-[1025px]:leading-[1.8] max-[1024px]:min-[769px]:max-w-[clamp(600px,80vw,750px)] max-md:text-base max-md:max-w-none [&>p]:mb-lg min-[1025px]:[&>p]:mb-xl [&>h2]:mt-2xl [&>h2]:mb-lg [&>h3]:mt-2xl [&>h3]:mb-lg [&>h4]:mt-2xl [&>h4]:mb-lg [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0 [&>h4:first-child]:mt-0">
        {content.map((block, index) => {
          switch (block.type) {
            case 'paragraph':
              return <p key={index}>{block.text}</p>;

            case 'heading2':
              return <h2 key={index}>{block.text}</h2>;

            case 'heading3':
              return <h3 key={index}>{block.text}</h3>;

            case 'heading4':
              return <h4 key={index}>{block.text}</h4>;

            case 'quote':
              return (
                <QuoteBlock
                  key={index}
                  text={block.text ?? ''}
                  author={block.author}
                  title={block.title}
                />
              );

            case 'infoBox':
              return (
                <InfoBox
                  key={index}
                  title={block.title}
                  items={block.items}
                  variant={block.variant as 'default' | 'success' | 'warning' | 'info'}
                >
                  {block.content}
                </InfoBox>
              );

            case 'factBox':
              return <FactBox key={index} facts={block.facts} />;

            case 'callout':
              return (
                <CalloutBlock
                  key={index}
                  title={block.title}
                  text={block.text}
                  buttonText={block.buttonText}
                  buttonHref={block.buttonHref}
                  onClick={block.onClick}
                />
              );

            case 'timeline':
              return <TimelineBlock key={index} items={block.timelineItems} />;

            case 'html':
              return <div key={index} dangerouslySetInnerHTML={{ __html: block.content ?? '' }} />;

            default:
              console.warn(`Unknown content block type: ${block.type}`);
              return null;
          }
        })}
      </div>
    );
  }

  // If string content is provided, render as paragraph
  if (typeof content === 'string') {
    return (
      <div className="font-['PT_Sans',Arial,sans-serif] text-lg leading-[1.7] text-foreground max-w-[clamp(640px,50vw,900px)] mx-auto min-[1025px]:leading-[1.8] max-[1024px]:min-[769px]:max-w-[clamp(600px,80vw,750px)] max-md:text-base max-md:max-w-none [&>p]:mb-lg min-[1025px]:[&>p]:mb-xl [&>h2]:mt-2xl [&>h2]:mb-lg [&>h3]:mt-2xl [&>h3]:mb-lg [&>h4]:mt-2xl [&>h4]:mb-lg [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0 [&>h4:first-child]:mt-0">
        <p>{content}</p>
      </div>
    );
  }

  // Fallback for no content
  return (
    <div className="font-['PT_Sans',Arial,sans-serif] text-lg leading-[1.7] text-foreground max-w-[clamp(640px,50vw,900px)] mx-auto min-[1025px]:leading-[1.8] max-[1024px]:min-[769px]:max-w-[clamp(600px,80vw,750px)] max-md:text-base max-md:max-w-none [&>p]:mb-lg min-[1025px]:[&>p]:mb-xl [&>h2]:mt-2xl [&>h2]:mb-lg [&>h3]:mt-2xl [&>h3]:mb-lg [&>h4]:mt-2xl [&>h4]:mb-lg [&>h2:first-child]:mt-0 [&>h3:first-child]:mt-0 [&>h4:first-child]:mt-0">
      <p>Kein Inhalt verfügbar.</p>
    </div>
  );
};

export default PageContent;
