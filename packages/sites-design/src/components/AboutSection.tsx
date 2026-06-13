import type { AboutSection as AboutSectionType } from '../types/candidate';
import { RichTextContent } from './RichTextContent';

interface AboutSectionProps {
  data: AboutSectionType;
}

export function AboutSection({ data }: AboutSectionProps) {
  return (
    <section className="relative bg-[var(--background-color-pure)] py-[var(--spacing-responsive-xlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)]">
      <div className="max-w-7xl mx-auto flex flex-col items-start gap-[var(--spacing-responsive-large)] md:flex-row md:items-center md:gap-[var(--spacing-responsive-xlarge)]">
        <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] md:text-[length:var(--font-size-3xl)] font-bold text-[var(--link-color)] leading-tight m-0 md:flex-[0_0_30%]">
          {data.title}
        </h2>
        <RichTextContent
          content={data.content}
          className="flex-1 max-w-[65ch] [&_p]:text-[var(--font-color)] [&_p]:text-[length:var(--font-size-lg)] [&_p]:leading-relaxed [&_p]:mb-[var(--spacing-md)] [&_p:last-child]:mb-0 [&_h2]:text-[length:var(--font-size-xl)] [&_h2]:font-bold [&_h2]:text-[var(--font-color)] [&_h2]:mb-[var(--spacing-sm)] [&_h3]:text-[length:var(--font-size-lg)] [&_h3]:font-semibold [&_h3]:text-[var(--font-color)] [&_h3]:mb-[var(--spacing-sm)] [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[1.5em] [&_ol]:pl-[1.5em] [&_li]:text-[var(--font-color)] [&_li]:text-[length:var(--font-size-lg)] [&_li]:leading-relaxed [&_ul]:mb-[var(--spacing-md)] [&_ol]:mb-[var(--spacing-md)]"
        />
      </div>
    </section>
  );
}
