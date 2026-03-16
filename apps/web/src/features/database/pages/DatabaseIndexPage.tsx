import { useNavigate } from 'react-router-dom';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import IndexCard from '../../../components/common/IndexCard';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { getOrderedSections } from '../config/databaseConfig';

const DatabaseIndexPage = () => {
  const navigate = useNavigate();
  const sections = getOrderedSections();

  return (
    <ErrorBoundary>
      <div className="mx-auto mt-[60px] max-w-[1200px] flex-col px-lg box-border max-md:mt-0 max-md:px-md max-md:py-lg">
        <div className="text-center">
          <h1 className="mb-4 text-[2.5rem] font-semibold text-foreground-heading max-md:text-[1.75rem]">
            Datenbank
          </h1>
          <p className="mx-auto mb-xl max-w-[800px] text-center text-[1.1rem] leading-relaxed text-foreground">
            Durchsuche Vorlagen, Prompts und Anträge für deine grüne Arbeit.
          </p>
        </div>

        <EarlyAccessBanner />

        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl max-lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] max-md:gap-4">
          {sections.map((section) => (
            <IndexCard
              key={section.id}
              title={section.title}
              description={section.description}
              meta={section.meta}
              tags={section.tags}
              onClick={() => navigate(section.path)}
              variant={section.id === 'vorlagen' ? 'elevated' : 'default'}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(DatabaseIndexPage, {
  title: 'Datenbank',
});
