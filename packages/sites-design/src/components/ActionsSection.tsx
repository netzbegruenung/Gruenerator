import type { ActionsSection as ActionsSectionType } from '../types/candidate';

interface ActionsSectionProps {
  data: ActionsSectionType;
}

export function ActionsSection({ data }: ActionsSectionProps) {
  return (
    <section className="bg-[var(--background-color-pure)] py-[var(--spacing-responsive-xxlarge)] px-[var(--spacing-responsive-medium)] md:py-16 md:px-[var(--spacing-responsive-large)]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-[var(--spacing-responsive-medium)] sm:grid-cols-2 lg:grid-cols-3 md:gap-[var(--spacing-responsive-large)]">
          {data.actions.map((action, index) => (
            <div
              key={index}
              className="relative overflow-hidden cursor-pointer aspect-[3/4] w-full rounded-[var(--radius-md)] shadow-[var(--shadow-md)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] bg-[var(--primary-600)] flex items-center justify-center text-white group"
            >
              <a
                href={action.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full"
              >
                {action.imageUrl && (
                  <img
                    src={action.imageUrl}
                    alt={action.text}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 z-[1] bg-black/20 pointer-events-none" />
                <h2 className="absolute inset-0 z-[2] flex items-center justify-center font-bold text-white text-center leading-snug m-0 p-[var(--spacing-md)] bg-black/10 pointer-events-none text-[length:var(--font-size-base)] md:text-[length:var(--font-size-lg)] lg:text-[length:var(--font-size-xl)] xl:text-[length:var(--font-size-2xl)]">
                  {action.text}
                </h2>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
