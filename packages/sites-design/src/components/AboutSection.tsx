import type { AboutSection as AboutSectionType } from '../types/candidate';
import { MarkdownContent } from '../utils/markdown';

interface AboutSectionProps {
  data: AboutSectionType;
}

export function AboutSection({ data }: AboutSectionProps) {
  return (
    <section className="relative bg-white">
      <div className="max-w-[var(--container-max-width)] mx-auto flex flex-col items-start gap-[var(--spacing-lg-r)] p-[var(--spacing-xl-r)_var(--spacing-md-r)] md:flex-row md:items-center md:gap-[var(--spacing-xl-r)] md:p-[var(--spacing-xxl-r)_var(--spacing-lg-r)]">
        <h2 className="text-[var(--font-size-2xl)] md:text-[var(--font-size-3xl)] font-bold text-[var(--primary-600)] leading-tight m-0 md:flex-[0_0_30%]">
          {data.title}
        </h2>
        <MarkdownContent
          content={data.content}
          className="flex-1 [&_p]:text-[var(--grey-800)] [&_p]:text-[var(--font-size-base)] [&_p]:leading-relaxed [&_p]:mb-[var(--spacing-md)] [&_p:last-child]:mb-0"
        />
      </div>
    </section>
  );
}
