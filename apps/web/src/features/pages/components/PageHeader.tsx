import { cn } from '../../../utils/cn';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  author?: string;
  readTime?: string;
  alignment?: 'center' | 'left';
  showDivider?: boolean;
}

const PageHeader = ({
  title,
  subtitle,
  author,
  readTime,
  alignment = 'center',
  showDivider = true,
}: PageHeaderProps) => {
  const isLeft = alignment === 'left';

  return (
    <header
      className={cn(
        'mb-xl py-xl relative flex flex-col items-center justify-center max-md:py-lg min-[1025px]:py-2xl',
        isLeft ? 'text-left items-start' : 'text-center',
        'max-md:text-center max-md:items-center',
        isLeft && 'max-md:text-left max-md:items-start'
      )}
    >
      {title && (
        <h1
          className={cn(
            'gradient-title text-[clamp(2rem,5vw,4rem)] text-foreground-heading leading-[1.2] m-0 mb-md font-normal tracking-[-0.02em] max-w-[clamp(640px,50vw,900px)] text-center min-[1025px]:leading-[1.1] min-[1025px]:mb-lg max-md:text-[clamp(1.75rem,4vw,2.5rem)]',
            isLeft && 'text-left',
            isLeft && 'max-md:text-left'
          )}
        >
          {title}
        </h1>
      )}

      {subtitle && (
        <p
          className={cn(
            "font-['PT_Sans',Arial,sans-serif] text-[clamp(1.125rem,3vw,1.75rem)] text-foreground leading-[1.4] m-0 mb-lg opacity-80 max-w-[clamp(640px,50vw,900px)] text-center min-[1025px]:text-[clamp(1.25rem,2vw,1.75rem)] min-[1025px]:leading-relaxed min-[1025px]:max-w-[clamp(640px,50vw,900px)]",
            isLeft && 'text-left',
            isLeft && 'max-md:text-left'
          )}
        >
          {subtitle}
        </p>
      )}

      {(author || readTime) && (
        <div
          className={cn(
            "flex gap-md justify-center items-center mt-md font-['PT_Sans',Arial,sans-serif] text-[0.9rem] text-grey-400 max-w-[clamp(640px,50vw,900px)] min-[1025px]:mt-xl min-[1025px]:text-base max-md:justify-center max-md:flex-wrap",
            isLeft && 'justify-start ml-0 mr-auto',
            isLeft && 'max-md:justify-start'
          )}
        >
          {author && <span className="font-semibold">{author}</span>}
          {readTime && (
            <span className="before:content-['\\2022'] before:mr-xs">{readTime} Lesezeit</span>
          )}
        </div>
      )}

      {showDivider && (
        <hr
          className={cn(
            'w-[60px] h-[3px] bg-gradient-to-r from-secondary-600 to-primary-600 border-none my-md mx-auto rounded-[2px] relative self-center min-[1025px]:w-[80px] min-[1025px]:my-xl',
            isLeft && 'ml-0 mr-auto self-start',
            isLeft && 'max-md:self-start max-md:ml-0 max-md:mr-auto'
          )}
        />
      )}
    </header>
  );
};

export default PageHeader;
