import { cn } from '@gruenerator/ui';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MONITOR_HEADING, MONITOR_MUTED } from '../components/theme';
import {
  LocaleSwitcher,
  RangeSwitcher,
  TransparenzView,
  useDaysParam,
  useExpertParam,
  useTransparencyLocaleParam,
  ViewSwitcher,
} from '../components/TransparenzView';

/**
 * "Transparenz" — the platform's own consumption. Deliberately NOT part of the
 * monitor family header anymore: this page answers "was verbraucht das hier?",
 * not "was ist politisch los?", and the cross-nav suggested otherwise.
 *
 * The switchers live here rather than inside the view so the header row stays
 * one flex line with the title.
 *
 * The country split is an expert-view affordance: the simple view answers
 * "was verbraucht das hier?" for the whole platform, and a `?locale=` left in
 * the URL must not quietly narrow that answer.
 */
function MonitorTransparenzPage() {
  const { days, setDays } = useDaysParam();
  const { expert, setExpert } = useExpertParam();
  const { locale, setLocale, available: localeAvailable } = useTransparencyLocaleParam();
  const effectiveLocale = expert ? locale : null;

  return (
    <PageContainer maxWidth="lg">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <h1
          className={cn(
            'm-0 text-[2.4rem] font-semibold leading-[1.1] tracking-[-0.02em]',
            MONITOR_HEADING
          )}
        >
          Transparenz
        </h1>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <ViewSwitcher expert={expert} onChange={setExpert} />
            {expert && localeAvailable && <LocaleSwitcher locale={locale} onChange={setLocale} />}
            <RangeSwitcher days={days} onChange={setDays} />
          </div>
          <p className={cn('m-0 max-w-[340px] text-right text-[0.9rem]', MONITOR_MUTED)}>
            {effectiveLocale
              ? 'Nur Konten, deren Sprache auf dieses Land eingestellt ist. Konten ohne Angabe zählen allein unter „Alle“.'
              : expert
                ? 'Was der Grünerator insgesamt verbraucht — mit den Konstanten, mit denen gerechnet wurde.'
                : 'Was der Grünerator insgesamt verbraucht.'}
          </p>
        </div>
      </div>
      <TransparenzView days={days} expert={expert} locale={effectiveLocale} />
    </PageContainer>
  );
}

export default withAuthRequired(MonitorTransparenzPage, { title: 'Transparenz' });
