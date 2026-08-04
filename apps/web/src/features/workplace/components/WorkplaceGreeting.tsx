import { getGreeting, isPrideMonth } from '@gruenerator/shared/utils';

import { CURRENT_INSTANCE } from '../../../config/instance';
import { useFirstName } from '../../../hooks/useFirstName';
import { useAuthStore } from '../../../stores/authStore';

interface WorkplaceGreetingProps {
  // Name of the Projekt this new chat will be filed into (from `/chat?projekt=<groupId>`).
  // When set, a subtitle makes the project scope visible on the empty state.
  projectName?: string | null;
}

// Time/locale-aware greeting hero, shared by the Workplace chat tab and the
// /chat empty state.
const WorkplaceGreeting = ({ projectName }: WorkplaceGreetingProps = {}) => {
  const firstName = useFirstName();
  const locale = useAuthStore((state) => state.locale);

  const pride = isPrideMonth();

  return (
    <div className="text-center mb-lg">
      <h1
        className={`text-4xl max-md:text-2xl font-extrabold tracking-tight text-balance mb-xs ${
          pride ? 'inline-block w-fit bg-clip-text text-transparent' : 'text-foreground-heading'
        }`}
        style={
          pride
            ? {
                backgroundImage:
                  'linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)',
              }
            : undefined
        }
      >
        {getGreeting(locale, firstName, { instanceId: CURRENT_INSTANCE })}
      </h1>
      {projectName && (
        <p className="text-sm text-muted-foreground">
          Du chattest, evaluierst und prüfst im Projekt „{projectName}“
        </p>
      )}
    </div>
  );
};

export default WorkplaceGreeting;
