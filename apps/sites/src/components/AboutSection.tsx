import { MarkdownContent } from '@/utils/markdown';
import type { AboutSection as AboutSectionType } from '@/types/candidate';

interface AboutSectionProps {
  data: AboutSectionType;
}

export function AboutSection({ data }: AboutSectionProps) {
  return (
    <section className="about-section">
      <div className="about-block-content">
        <h2 className="about-block-title">{data.title}</h2>
        <MarkdownContent content={data.content} className="about-block-text" />
      </div>
    </section>
  );
}
