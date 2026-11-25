import { cn } from '@gruenerator/ui';

import { DASH_CARD } from '../../../components/dashboard/dashboardStyles';

/**
 * The cards of „Apps & Newsletter": the Briefing's neutral card (white, hairline border,
 * soft shadow from dashboardTokens.css), the same height side by side from xl on.
 */
export const SIDE_CARD = cn('rounded-2xl md:rounded-[20px] xl:h-[380px]', DASH_CARD);
