import type { ActionsSection as ActionsSectionType } from '@/types/candidate';

interface ActionsSectionProps {
  data: ActionsSectionType;
}

export function ActionsSection({ data }: ActionsSectionProps) {
  return (
    <section className="actions-section">
      <div className="section-container">
        <div className="image-grid">
          {data.actions.map((action, index) => (
            <div key={index} className="grid-item">
              <a href={action.link} target="_blank" rel="noopener noreferrer">
                {action.imageUrl && <img src={action.imageUrl} alt={action.text} loading="lazy" />}
                <h2>{action.text}</h2>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
