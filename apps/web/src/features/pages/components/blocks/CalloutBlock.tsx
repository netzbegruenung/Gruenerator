import { cn } from '../../../../utils/cn';

interface CalloutBlockProps {
  title?: string;
  text?: string;
  buttonText?: string;
  buttonHref?: string;
  onClick?: () => void;
  className?: string;
}

const calloutButtonClass =
  "bg-white text-secondary-600 py-md px-xl border-none rounded-lg font-['PT_Sans',Arial,sans-serif] text-base font-semibold cursor-pointer transition-all duration-200 no-underline inline-block hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]";

const CalloutBlock = ({
  title,
  text,
  buttonText,
  buttonHref,
  onClick,
  className = '',
}: CalloutBlockProps) => {
  return (
    <div
      className={cn(
        'bg-gradient-to-br from-secondary-600 to-primary-600 text-white p-2xl my-2xl rounded-xl text-center shadow-xl w-full max-w-none min-[1025px]:p-[calc(var(--spacing-2xl)*1.5)] min-[1025px]:my-[calc(var(--spacing-2xl)*1.5)] max-md:p-xl',
        className
      )}
    >
      {title && (
        <h3 className="text-[1.75rem] m-0 mb-md text-white min-[1025px]:text-[2rem] min-[1025px]:mb-lg max-md:text-[1.5rem]">
          {title}
        </h3>
      )}
      {text && (
        <p className="text-lg leading-relaxed m-0 mb-lg opacity-95 min-[1025px]:text-[1.25rem] min-[1025px]:mb-xl">
          {text}
        </p>
      )}
      {buttonText && (
        <>
          {buttonHref ? (
            <a
              href={buttonHref}
              className={calloutButtonClass}
              target="_blank"
              rel="noopener noreferrer"
            >
              {buttonText}
            </a>
          ) : (
            <button className={calloutButtonClass} onClick={onClick}>
              {buttonText}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default CalloutBlock;
