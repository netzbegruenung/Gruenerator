import { cn } from '../../../../utils/cn';

interface QuoteBlockProps {
  text: string;
  author?: string;
  title?: string;
  className?: string;
}

const QuoteBlock = ({ text, author, title, className = '' }: QuoteBlockProps) => {
  return (
    <blockquote
      className={cn(
        'bg-transparent border-none py-xl px-0 my-2xl relative w-full max-w-none min-[1025px]:py-2xl min-[1025px]:px-xl min-[1025px]:my-[calc(var(--spacing-2xl)*1.5)] max-md:py-lg max-md:my-xl',
        "before:content-['\\201E'] before:text-[clamp(6rem,15vw,12rem)] before:text-[#FDE047] before:absolute before:top-[-2rem] before:left-0 before:leading-none before:z-0 before:font-bold",
        className
      )}
    >
      <p className="text-[clamp(1.5rem,4vw,2.5rem)] not-italic font-normal text-foreground-heading m-0 mb-lg pl-[clamp(3rem,10vw,9rem)] pt-lg relative z-[1] leading-[1.3] min-[1025px]:pl-[clamp(6rem,12vw,10rem)] min-[1025px]:pt-xl max-md:text-[1.25rem]">
        {text}
      </p>
      {(author || title) && (
        <footer className="font-['PT_Sans',Arial,sans-serif] text-[clamp(0.75rem,2vw,1rem)] not-italic text-grey-400 text-right mt-md border-none p-0 bg-transparent">
          {author && <cite className="font-semibold">{author}</cite>}
          {author && title && ', '}
          {title && <span className="font-normal opacity-70">{title}</span>}
        </footer>
      )}
    </blockquote>
  );
};

export default QuoteBlock;
