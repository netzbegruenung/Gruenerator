import { getGreeting, isPrideMonth } from '@gruenerator/shared/utils';

import { useFirstName } from '../../../hooks/useFirstName';
import { useAuthStore } from '../../../stores/authStore';

// Time/locale-aware greeting hero, shared by the Workplace chat tab and the
// /chat empty state.
const WorkplaceGreeting = () => {
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
        {getGreeting(locale, firstName)}
      </h1>
    </div>
  );
};

export default WorkplaceGreeting;
