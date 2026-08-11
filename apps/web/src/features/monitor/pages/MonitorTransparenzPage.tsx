import { cn } from '@gruenerator/ui';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import { MONITOR_MUTED } from '../components/theme';
import { RangeSwitcher, TransparenzView, useDaysParam } from '../components/TransparenzView';

/**
 * "Transparenz" — the platform's own consumption, as the third monitor sibling.
 *
 * The range switcher lives here rather than inside the view so the header row
 * stays one flex line with the title, matching Themen/Umfragen.
 */
function MonitorTransparenzPage() {
  const { days, setDays } = useDaysParam();

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="transparenz"
        title="Transparenz"
        right={
          <div className="flex flex-col items-end gap-2">
            <RangeSwitcher days={days} onChange={setDays} />
            <p className={cn('m-0 max-w-[300px] text-right text-[0.9rem]', MONITOR_MUTED)}>
              Was der Grünerator insgesamt verbraucht — mit den Konstanten, mit denen gerechnet
              wurde.
            </p>
          </div>
        }
      />
      <TransparenzView days={days} />
    </PageContainer>
  );
}

export default withAuthRequired(MonitorTransparenzPage, { title: 'Transparenz' });
