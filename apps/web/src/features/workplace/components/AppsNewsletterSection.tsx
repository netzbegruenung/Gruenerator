import { cn } from '@gruenerator/ui';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useTreeBudget } from '../../../hooks/useTreeBudget';
import { isDesktopApp } from '../../../utils/platform';

import { AppsCard } from './AppsSection';
import { ArbeitenSection } from './ArbeitenSections';
import { NewsletterCard } from './NewsletterSection';

/**
 * „Apps & Newsletter" on the Arbeiten tab. The app card is left out in the desktop app,
 * the newsletter card for subscribers (tree bonus active).
 * Side by side from xl on (two thirds / one third); a card left alone takes the row.
 */
export function AppsNewsletterSection() {
  const budget = useTreeBudget();
  const [searchParams, setSearchParams] = useSearchParams();

  // Brevo's confirmation link lands here: thank once, then drop the parameter.
  useEffect(() => {
    if (searchParams.get('newsletter') !== 'bestaetigt') return;
    toast.success('Danke, du bekommst jetzt den Grünerator-Newsletter.');
    const next = new URLSearchParams(searchParams);
    next.delete('newsletter');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Wait for the budget: the row would otherwise jump when the newsletter card arrives.
  if (budget.isPending) return null;

  const showApps = !isDesktopApp();
  const showNewsletter = budget.data?.newsletterBonus === false;
  if (!showApps && !showNewsletter) return null;
  const both = showApps && showNewsletter;

  return (
    <ArbeitenSection title="Apps & Newsletter">
      <div
        className={cn(
          'dashboard-surface dashboard-neutral grid grid-cols-1 gap-4',
          both && 'xl:grid-cols-3'
        )}
      >
        {showApps && (
          <div className={cn(both && 'xl:col-span-2')}>
            <AppsCard />
          </div>
        )}
        {showNewsletter && <NewsletterCard />}
      </div>
    </ArbeitenSection>
  );
}
