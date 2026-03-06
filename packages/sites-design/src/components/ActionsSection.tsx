import type { ActionsSection as ActionsSectionType } from '../types/candidate';

interface ActionsSectionProps {
  data: ActionsSectionType;
}

export function ActionsSection({ data }: ActionsSectionProps) {
  return (
    <section className="bg-white py-[var(--spacing-xxl-r)] px-[var(--spacing-md-r)] md:py-[var(--spacing-xxxl-r)] md:px-[var(--spacing-lg-r)]">
      <div className="max-w-[var(--container-max-width)] mx-auto">
        <div className="grid grid-cols-1 gap-[var(--spacing-lg-r)] justify-items-center md:grid-cols-[repeat(auto-fit,minmax(250px,350px))] md:gap-[var(--spacing-xl-r)] md:justify-center lg:grid-cols-[repeat(auto-fit,minmax(280px,350px))]">
          {data.actions.map((action, index) => (
            <div
              key={index}
              className="relative overflow-hidden cursor-pointer aspect-[3/4] min-h-[200px] md:min-h-[250px] w-full max-w-[350px] bg-[var(--primary-600)] flex items-center justify-center text-white group"
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
                <h2 className="absolute inset-0 z-[2] flex items-center justify-center font-bold text-white text-center leading-snug m-0 p-[var(--spacing-md)] bg-black/10 pointer-events-none text-[var(--font-size-base)] md:text-[var(--font-size-lg)] lg:text-[var(--font-size-xl)] xl:text-[var(--font-size-2xl)]">
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
