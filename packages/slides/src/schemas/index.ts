/**
 * Schema-only export path for @gruenerator/slides.
 * No React imports — safe to use in backend/Node.js contexts.
 */
import * as z from 'zod/v4';

// ── General ──────────────────────────────────────────────────────────────────
import {
  Schema as GeneralIntroSchema,
  layoutId as GeneralIntroId,
} from '../components/layouts/general/IntroSlideLayout.js';
import {
  Schema as BasicInfoSchema,
  layoutId as BasicInfoId,
} from '../components/layouts/general/BasicInfoSlideLayout.js';
import {
  Schema as BulletIconsOnlySchema,
  layoutId as BulletIconsOnlyId,
} from '../components/layouts/general/BulletIconsOnlySlideLayout.js';
import {
  Schema as BulletWithIconsSchema,
  layoutId as BulletWithIconsId,
} from '../components/layouts/general/BulletWithIconsSlideLayout.js';
import {
  Schema as ChartWithBulletsSchema,
  layoutId as ChartWithBulletsId,
} from '../components/layouts/general/ChartWithBulletsSlideLayout.js';
import {
  Schema as MetricsSchema,
  layoutId as MetricsId,
} from '../components/layouts/general/MetricsSlideLayout.js';
import {
  Schema as MetricsWithImageSchema,
  layoutId as MetricsWithImageId,
} from '../components/layouts/general/MetricsWithImageSlideLayout.js';
import {
  Schema as NumberedBulletsSchema,
  layoutId as NumberedBulletsId,
} from '../components/layouts/general/NumberedBulletsSlideLayout.js';
import {
  Schema as QuoteSchema,
  layoutId as QuoteId,
} from '../components/layouts/general/QuoteSlideLayout.js';
import {
  Schema as TableInfoSchema,
  layoutId as TableInfoId,
} from '../components/layouts/general/TableInfoSlideLayout.js';
import {
  Schema as TableOfContentsSchema,
  layoutId as TableOfContentsId,
} from '../components/layouts/general/TableOfContentsSlideLayout.js';
import {
  Schema as TeamSchema,
  layoutId as TeamId,
} from '../components/layouts/general/TeamSlideLayout.js';

// ── Neo General ──────────────────────────────────────────────────────────────
import {
  Schema as HeadlineTextWithBulletsAndStatsSchema,
  layoutId as HeadlineTextWithBulletsAndStatsId,
} from '../components/layouts/neo-general/HeadlineTextWithBulletsAndStats.js';
import {
  Schema as HeadlineDescriptionWithImageSchema,
  layoutId as HeadlineDescriptionWithImageId,
} from '../components/layouts/neo-general/HeadlineDescriptionWithImage.js';
import {
  Schema as HeadlineDescriptionWithDoubleImageSchema,
  layoutId as HeadlineDescriptionWithDoubleImageId,
} from '../components/layouts/neo-general/HeadlineDescriptionWithDoubleImage.js';
import {
  Schema as IndexedThreeColumnListSchema,
  layoutId as IndexedThreeColumnListId,
} from '../components/layouts/neo-general/IndexedThreeColumnList.js';
import {
  Schema as LayoutTextBlockWithMetricCardsSchema,
  layoutId as LayoutTextBlockWithMetricCardsId,
} from '../components/layouts/neo-general/LayoutTextBlockWithMetricCards.js';
import {
  Schema as LeftAlignQuotesSchema,
  layoutId as LeftAlignQuotesId,
} from '../components/layouts/neo-general/LeftAlignQuote.js';
import {
  Schema as TitleDescriptionWithTableSchema,
  layoutId as TitleDescriptionWithTableId,
} from '../components/layouts/neo-general/TitleDescriptionWithTable.js';
import {
  Schema as ChallengeAndOutcomeWithOneStatSchema,
  layoutId as ChallengeAndOutcomeWithOneStatId,
} from '../components/layouts/neo-general/ChallengeAndOutcomeWithOneStat.js';
import {
  Schema as GridBasedEightMetricsSnapshotsSchema,
  layoutId as GridBasedEightMetricsSnapshotsId,
} from '../components/layouts/neo-general/GridBasedEightMetricsSnapshots.js';
import {
  Schema as TitleTopDescriptionFourTeamMembersGridSchema,
  layoutId as TitleTopDescriptionFourTeamMembersGridId,
} from '../components/layouts/neo-general/TitleTopDescriptionFourTeamMembersGrid.js';
import {
  Schema as TitleThreeColumnRiskConstraintsSchema,
  layoutId as TitleThreeColumnRiskConstraintsId,
} from '../components/layouts/neo-general/TitleThreeColumnRiskConstraints.js';
import {
  Schema as ThankYouContactInfoFooterImageSlideSchema,
  layoutId as ThankYouContactInfoFooterImageSlideId,
} from '../components/layouts/neo-general/ThankYouContactInfoFooterImageSlide.js';
import {
  Schema as TimelineLayoutSchema,
  layoutId as TimelineLayoutId,
} from '../components/layouts/neo-general/Timeline.js';
import {
  Schema as TitleWithFullWidthChartSchema,
  layoutId as TitleWithFullWidthChartId,
} from '../components/layouts/neo-general/TitleWithFullWidthChart.js';
import {
  Schema as TitleMetricsWithChartSchema,
  layoutId as TitleMetricsWithChartId,
} from '../components/layouts/neo-general/TitleMetricsWithChart.js';
import {
  Schema as TitleWithGridBasedHeadingAndDescriptionSchema,
  layoutId as TitleWithGridBasedHeadingAndDescriptionId,
} from '../components/layouts/neo-general/TitleWithGridBasedHeadingAndDescription.js';
import {
  Schema as TextSplitWithEmphasisBlockSchema,
  layoutId as TextSplitWithEmphasisBlockId,
} from '../components/layouts/neo-general/TextSplitWithEmphasisBlock.js';
import {
  Schema as BulletIconsOnlyNeoGeneralSchema,
  layoutId as BulletIconsOnlyNeoGeneralId,
} from '../components/layouts/neo-general/BulletIconsOnlySlideLayout.js';
import {
  Schema as BulletWithIconsNeoGeneralSchema,
  layoutId as BulletWithIconsNeoGeneralId,
} from '../components/layouts/neo-general/BulletWithIconsSlideLayout.js';
import {
  Schema as ChartWithBulletsNeoGeneralSchema,
  layoutId as ChartWithBulletsNeoGeneralId,
} from '../components/layouts/neo-general/ChartWithBulletsSlideLayout.js';
import {
  Schema as MetricsWithImageNeoGeneralSchema,
  layoutId as MetricsWithImageNeoGeneralId,
} from '../components/layouts/neo-general/MetricsWithImageSlideLayout.js';
import {
  Schema as NumberedBulletsNeoGeneralSchema,
  layoutId as NumberedBulletsNeoGeneralId,
} from '../components/layouts/neo-general/NumberedBulletsSlideLayout.js';
import {
  Schema as QuoteNeoGeneralSchema,
  layoutId as QuoteNeoGeneralId,
} from '../components/layouts/neo-general/QuoteSlideLayout.js';
import {
  Schema as TeamNeoGeneralSchema,
  layoutId as TeamNeoGeneralId,
} from '../components/layouts/neo-general/TeamSlideLayout.js';
import {
  Schema as TableOfContentWithoutPageNumberSchema,
  layoutId as TableOfContentWithoutPageNumberId,
} from '../components/layouts/neo-general/TableOfContentWithoutPageNumber.js';
import {
  Schema as TitleMetricValueMetricLabelFunnelStagesSchema,
  layoutId as TitleMetricValueMetricLabelFunnelStagesId,
} from '../components/layouts/neo-general/TitleMetricValueMetricLabelFunnelStages.js';
import {
  Schema as MultiChartGridSlideSchema,
  layoutId as MultiChartGridSlideId,
} from '../components/layouts/neo-general/MultiChartGridSlideLayout.js';
import {
  Schema as TitleDescriptionMultiChartGridWithMetricsSchema,
  layoutId as TitleDescriptionMultiChartGridWithMetricsId,
} from '../components/layouts/neo-general/TitleDescriptionMultiChartGridWithMetrics.js';
import {
  Schema as TitleDescriptionMultiChartGridWithBulletsSchema,
  layoutId as TitleDescriptionMultiChartGridWithBulletsId,
} from '../components/layouts/neo-general/TitleDescriptionMultiChartGridWithBullets.js';

// ── Modern ───────────────────────────────────────────────────────────────────
import {
  Schema as ModernIntroSchema,
  layoutId as ModernIntroId,
} from '../components/layouts/modern/IntroSlideLayout.js';
import {
  Schema as BulletsIconsGridSchema,
  layoutId as BulletsIconsGridId,
} from '../components/layouts/modern/BulletsWithIconsDescriptionGrid.js';
import {
  Schema as ModernBulletIconsSchema,
  layoutId as ModernBulletIconsId,
} from '../components/layouts/modern/BulletWithIconsSlideLayout.js';
import {
  Schema as ChartTableDescSchema,
  layoutId as ChartTableDescId,
} from '../components/layouts/modern/ChartOrTableWithDescription.js';
import {
  Schema as ChartMetricsSchema,
  layoutId as ChartMetricsId,
} from '../components/layouts/modern/ChartOrTableWithMetricsDescription.js';
import {
  Schema as ImageDescSchema,
  layoutId as ImageDescId,
} from '../components/layouts/modern/ImageAndDescriptionLayout.js';
import {
  Schema as ImageListDescSchema,
  layoutId as ImageListDescId,
} from '../components/layouts/modern/ImageListWithDescriptionSlideLayout.js';
import {
  Schema as ImagesDescSchema,
  layoutId as ImagesDescId,
} from '../components/layouts/modern/ImagesWithDescriptionLayout.js';
import {
  Schema as MetricsDescSchema,
  layoutId as MetricsDescId,
} from '../components/layouts/modern/MetricsWithDescription.js';
import {
  Schema as ModernTocSchema,
  layoutId as ModernTocId,
} from '../components/layouts/modern/TableOfContentsLayout.js';

// ── Neo Modern ───────────────────────────────────────────────────────────────
import {
  Schema as TitleDescriptionBulletListModernSchema,
  layoutId as TitleDescriptionBulletListModernId,
} from '../components/layouts/neo-modern/TitleDescriptionBulletList.js';
import {
  Schema as TitleDescriptionContactListSchema,
  layoutId as TitleDescriptionContactListId,
} from '../components/layouts/neo-modern/TitleDescriptionContactList.js';
import {
  Schema as TitleDescriptionDualMetricsGridSchema,
  layoutId as TitleDescriptionDualMetricsGridId,
} from '../components/layouts/neo-modern/TitleDescriptionDualMetricsGrid.js';
import {
  Schema as TitleDescriptionIconTimelineSchema,
  layoutId as TitleDescriptionIconTimelineId,
} from '../components/layouts/neo-modern/TitleDescriptionIconTimeline.js';
import {
  Schema as TitleDescriptionImageRightModernSchema,
  layoutId as TitleDescriptionImageRightModernId,
} from '../components/layouts/neo-modern/TitleDescriptionImageRight.js';
import {
  Schema as TitleDescriptionMetricsChartSchema,
  layoutId as TitleDescriptionMetricsChartId,
} from '../components/layouts/neo-modern/TitleDescriptionMetricsChart.js';
import {
  Schema as TitleDescriptionMetricsImageSchema,
  layoutId as TitleDescriptionMetricsImageId,
} from '../components/layouts/neo-modern/TitleDescriptionMetricsImage.js';
import {
  Schema as TitleDescriptionMetricsTableSchema,
  layoutId as TitleDescriptionMetricsTableId,
} from '../components/layouts/neo-modern/TitleDescriptionTable.js';
import {
  Schema as TitleDualComparisonChartsSchema,
  layoutId as TitleDualComparisonChartsId,
} from '../components/layouts/neo-modern/TitleDualComparisonCharts.js';
import {
  Schema as TitleDualComparisonCardsModernSchema,
  layoutId as TitleDualComparisonCardsModernId,
} from '../components/layouts/neo-modern/TitleDualComparisonCards.js';
import {
  Schema as TitleHorizontalAltenenatingTimelineSchema,
  layoutId as TitleHorizontalAltenenatingTimelineId,
} from '../components/layouts/neo-modern/TitleHorizontalAlternatingTimeline.js';
import {
  Schema as TitleKpiSnapshotGridSchema,
  layoutId as TitleKpiSnapshotGridId,
} from '../components/layouts/neo-modern/TitleKpiSnapshotGrid.js';
import {
  Schema as TitleSubtitlesChartSchema,
  layoutId as TitleSubtitlesChartId,
} from '../components/layouts/neo-modern/TitleSubtitlesChart.js';
import {
  Schema as TitleTwoColumnNumberListSchema,
  layoutId as TitleTwoColumnNumberListId,
} from '../components/layouts/neo-modern/TitleTwoColumnNumberedList.js';
import {
  Schema as TitleDescriptionMultiChartGridSchema,
  layoutId as TitleDescriptionMultiChartGridId,
} from '../components/layouts/neo-modern/TitleDescriptionMultiChartGrid.js';
import {
  Schema as TitleDescriptionMultiChartGridWithMetricsModernSchema,
  layoutId as TitleDescriptionMultiChartGridWithMetricsModernId,
} from '../components/layouts/neo-modern/TitleDescriptionMultiChartGridWithMetrics.js';
import {
  Schema as TitleDescriptionMultiChartGridWithBulletsModernSchema,
  layoutId as TitleDescriptionMultiChartGridWithBulletsModernId,
} from '../components/layouts/neo-modern/TitleDescriptionMultiChartGridWithBullets.js';

// ── Standard ─────────────────────────────────────────────────────────────────
import {
  Schema as StandardIntroSchema,
  layoutId as StandardIntroId,
} from '../components/layouts/standard/IntroSlideLayout.js';
import {
  Schema as ChartLeftSchema,
  layoutId as ChartLeftId,
} from '../components/layouts/standard/ChartLeftTextRightLayout.js';
import {
  Schema as ContactSchema,
  layoutId as ContactId,
} from '../components/layouts/standard/ContactLayout.js';
import {
  Schema as HeadingBulletSchema,
  layoutId as HeadingBulletId,
} from '../components/layouts/standard/HeadingBulletImageDescriptionLayout.js';
import {
  Schema as IconBulletSchema,
  layoutId as IconBulletId,
} from '../components/layouts/standard/IconBulletDescriptionLayout.js';
import {
  Schema as IconImageSchema,
  layoutId as IconImageId,
} from '../components/layouts/standard/IconImageDescriptionLayout.js';
import {
  Schema as StdImageListSchema,
  layoutId as StdImageListId,
} from '../components/layouts/standard/ImageListWithDescriptionLayout.js';
import {
  Schema as MetricsDescLayoutSchema,
  layoutId as MetricsDescLayoutId,
} from '../components/layouts/standard/MetricsDescriptionLayout.js';
import {
  Schema as NumBulletImgSchema,
  layoutId as NumBulletImgId,
} from '../components/layouts/standard/NumberedBulletSingleImageLayout.js';
import {
  Schema as StdTocSchema,
  layoutId as StdTocId,
} from '../components/layouts/standard/TableOfContentsLayout.js';
import {
  Schema as VisualMetricsSchema,
  layoutId as VisualMetricsId,
} from '../components/layouts/standard/VisualMetricsSlideLayout.js';

// ── Neo Standard ─────────────────────────────────────────────────────────────
import {
  Schema as TitleBadgeChartSchema,
  layoutId as TitleBadgeChartId,
} from '../components/layouts/neo-standard/TitleBadgeChart.js';
import {
  Schema as TitleDescriptionBulletListStandardSchema,
  layoutId as TitleDescriptionBulletListStandardId,
} from '../components/layouts/neo-standard/TitleDescriptionBulletList.js';
import {
  Schema as TitleDescriptionContactCardsSchema,
  layoutId as TitleDescriptionContactCardsId,
} from '../components/layouts/neo-standard/TitleDescriptionContactCards.js';
import {
  Schema as TitleDescriptionIconListSchema,
  layoutId as TitleDescriptionIconListId,
} from '../components/layouts/neo-standard/TitleDescriptionIconList.js';
import {
  Schema as TitleDescriptionImageRightSchema,
  layoutId as TitleDescriptionImageRightId,
} from '../components/layouts/neo-standard/TitleDescriptionImageRight.js';
import {
  Schema as TitleDescriptionRadialCardsSchema,
  layoutId as TitleDescriptionRadialCardsId,
} from '../components/layouts/neo-standard/TitleDescriptionRadialCards.js';
import {
  Schema as TitleDescriptionTableSchema,
  layoutId as TitleDescriptionTableId,
} from '../components/layouts/neo-standard/TitleDescriptionTable.js';
import {
  Schema as TitleDescriptionTimelineSchema,
  layoutId as TitleDescriptionTimelineId,
} from '../components/layouts/neo-standard/TitleDescriptionTimeline.js';
import {
  Schema as TitleDualChartsComparisonSchema,
  layoutId as TitleDualChartsComparisonId,
} from '../components/layouts/neo-standard/TitleDualChartsComparison.js';
import {
  Schema as TitleDualComparisonCardsSchema,
  layoutId as TitleDualComparisonCardsId,
} from '../components/layouts/neo-standard/TitleDualComparisonCards.js';
import {
  Schema as TitleKpiGridSchema,
  layoutId as TitleKpiGridId,
} from '../components/layouts/neo-standard/TitleKpiGrid.js';
import {
  Schema as TitleMetricsChartSchema,
  layoutId as TitleMetricsChartId,
} from '../components/layouts/neo-standard/TitleMetricsChart.js';
import {
  Schema as TitleMetricsImageSchema,
  layoutId as TitleMetricsImageId,
} from '../components/layouts/neo-standard/TitleMetricsImage.js';
import {
  Schema as TitlePointsDonutGridSchema,
  layoutId as TitlePointsDonutGridId,
} from '../components/layouts/neo-standard/TitlePointsDonutGrid.js';
import {
  Schema as TitleDescriptionMultiChartGridStandardSchema,
  layoutId as TitleDescriptionMultiChartGridStandardId,
} from '../components/layouts/neo-standard/TitleDescriptionMultiChartGrid.js';
import {
  Schema as TitleDescriptionMultiChartGridWithMetricsStandardSchema,
  layoutId as TitleDescriptionMultiChartGridWithMetricsStandardId,
} from '../components/layouts/neo-standard/TitleDescriptionMultiChartGridWithMetrics.js';
import {
  Schema as TitleDescriptionMultiChartGridWithBulletsStandardSchema,
  layoutId as TitleDescriptionMultiChartGridWithBulletsStandardId,
} from '../components/layouts/neo-standard/TitleDescriptionMultiChartGridWithBullets.js';

// ── Swift ────────────────────────────────────────────────────────────────────
import {
  Schema as SwiftIntroSchema,
  layoutId as SwiftIntroId,
} from '../components/layouts/swift/IntroSlideLayout.js';
import {
  Schema as BulletsIconsTitleSchema,
  layoutId as BulletsIconsTitleId,
} from '../components/layouts/swift/BulletsWithIconsTitleDescription.js';
import {
  Schema as IconBulletListSchema,
  layoutId as IconBulletListId,
} from '../components/layouts/swift/IconBulletListDescription.js';
import {
  Schema as ImageListSchema,
  layoutId as ImageListId,
} from '../components/layouts/swift/ImageListDescription.js';
import {
  Schema as MetricsNumbersSchema,
  layoutId as MetricsNumbersId,
} from '../components/layouts/swift/MetricsNumbers.js';
import {
  Schema as SimpleBulletSchema,
  layoutId as SimpleBulletId,
} from '../components/layouts/swift/SimpleBulletPointsLayout.js';
import {
  Schema as SwiftTocSchema,
  layoutId as SwiftTocId,
} from '../components/layouts/swift/TableOfContents.js';
import {
  Schema as TableChartSchema,
  layoutId as TableChartId,
} from '../components/layouts/swift/TableorChart.js';
import {
  Schema as TimelineSchema,
  layoutId as TimelineId,
} from '../components/layouts/swift/Timeline.js';

// ── Neo Swift ────────────────────────────────────────────────────────────────
import {
  Schema as TitleCenteredChartSchema,
  layoutId as TitleCenteredChartId,
} from '../components/layouts/neo-swift/TitleCenteredChart.js';
import {
  Schema as TitleChartMetricsSidebarSchema,
  layoutId as TitleChartMetricsSidebarId,
} from '../components/layouts/neo-swift/TitleChartMetricsSidebar.js';
import {
  Schema as TitleDescriptionBulletListSchema,
  layoutId as TitleDescriptionBulletListId,
} from '../components/layouts/neo-swift/TitleDescriptionBulletList.js';
import {
  Schema as TitleDescriptionDataTableSchema,
  layoutId as TitleDescriptionDataTableId,
} from '../components/layouts/neo-swift/TitleDescriptionDataTable.js';
import {
  Schema as TitleDescriptionImageRightSwiftSchema,
  layoutId as TitleDescriptionImageRightSwiftId,
} from '../components/layouts/neo-swift/TitleDescriptionImageRight.js';
import {
  Schema as TitleDescriptionMetricsGridSchema,
  layoutId as TitleDescriptionMetricsGridId,
} from '../components/layouts/neo-swift/TitleDescriptionMetricsGrid.js';
import {
  Schema as TitleDescriptionMetricsGridImageSchema,
  layoutId as TitleDescriptionMetricsGridImageId,
} from '../components/layouts/neo-swift/TitleDescriptionMetricsGridImage.js';
import {
  Schema as TitleDualComparisionBlockSchema,
  layoutId as TitleDualComparisionBlockId,
} from '../components/layouts/neo-swift/TitleDualComparisonBlocks.js';
import {
  Schema as TitleLabelDescriptionStatCardsSchema,
  layoutId as TitleLabelDescriptionStatCardsId,
} from '../components/layouts/neo-swift/TitleLabelDescriptionStatCards.js';
import {
  Schema as TitleSubtitleTeamMemberCardsSchema,
  layoutId as TitleSubtitleTeamMemberCardsId,
} from '../components/layouts/neo-swift/TitleSubtitleTeamMemberCards.js';
import {
  Schema as TitleTaglineDescriptionNumberedStepsSchema,
  layoutId as TitleTaglineDescriptionNumberedStepsId,
} from '../components/layouts/neo-swift/TitleTaglineDescriptionNumberedSteps.js';
import {
  Schema as TitleThreeByThreeMetricsGridSchema,
  layoutId as TitleThreeByThreeMetricsGridId,
} from '../components/layouts/neo-swift/TitleThreeByThreeMetricsGrid.js';
import {
  Schema as TitleDescriptionSixChartsGridSchema,
  layoutId as TitleDescriptionSixChartsGridId,
} from '../components/layouts/neo-swift/TitleDescriptionSixChartsGrid.js';
import {
  Schema as TitleDescriptionSixChartsFourMetricsSchema,
  layoutId as TitleDescriptionSixChartsFourMetricsId,
} from '../components/layouts/neo-swift/TitleDescriptionSixChartsFourMetrics.js';
import {
  Schema as TitleDescriptionFourChartsSixBulletsSchema,
  layoutId as TitleDescriptionFourChartsSixBulletsId,
} from '../components/layouts/neo-swift/TitleDescriptionFourChartsSixBullets.js';

// ── Build the schema map ─────────────────────────────────────────────────────

type SchemaEntry = [group: string, layoutId: string, schema: z.ZodTypeAny];

const entries: SchemaEntry[] = [
  // General
  ['general', GeneralIntroId, GeneralIntroSchema],
  ['general', BasicInfoId, BasicInfoSchema],
  ['general', BulletIconsOnlyId, BulletIconsOnlySchema],
  ['general', BulletWithIconsId, BulletWithIconsSchema],
  ['general', ChartWithBulletsId, ChartWithBulletsSchema],
  ['general', MetricsId, MetricsSchema],
  ['general', MetricsWithImageId, MetricsWithImageSchema],
  ['general', NumberedBulletsId, NumberedBulletsSchema],
  ['general', QuoteId, QuoteSchema],
  ['general', TableInfoId, TableInfoSchema],
  ['general', TableOfContentsId, TableOfContentsSchema],
  ['general', TeamId, TeamSchema],

  // Neo General
  ['neo-general', HeadlineTextWithBulletsAndStatsId, HeadlineTextWithBulletsAndStatsSchema],
  ['neo-general', HeadlineDescriptionWithImageId, HeadlineDescriptionWithImageSchema],
  ['neo-general', HeadlineDescriptionWithDoubleImageId, HeadlineDescriptionWithDoubleImageSchema],
  ['neo-general', IndexedThreeColumnListId, IndexedThreeColumnListSchema],
  ['neo-general', LayoutTextBlockWithMetricCardsId, LayoutTextBlockWithMetricCardsSchema],
  ['neo-general', LeftAlignQuotesId, LeftAlignQuotesSchema],
  ['neo-general', TitleDescriptionWithTableId, TitleDescriptionWithTableSchema],
  ['neo-general', ChallengeAndOutcomeWithOneStatId, ChallengeAndOutcomeWithOneStatSchema],
  ['neo-general', GridBasedEightMetricsSnapshotsId, GridBasedEightMetricsSnapshotsSchema],
  [
    'neo-general',
    TitleTopDescriptionFourTeamMembersGridId,
    TitleTopDescriptionFourTeamMembersGridSchema,
  ],
  ['neo-general', TitleThreeColumnRiskConstraintsId, TitleThreeColumnRiskConstraintsSchema],
  ['neo-general', ThankYouContactInfoFooterImageSlideId, ThankYouContactInfoFooterImageSlideSchema],
  ['neo-general', TimelineLayoutId, TimelineLayoutSchema],
  ['neo-general', TitleWithFullWidthChartId, TitleWithFullWidthChartSchema],
  ['neo-general', TitleMetricsWithChartId, TitleMetricsWithChartSchema],
  [
    'neo-general',
    TitleWithGridBasedHeadingAndDescriptionId,
    TitleWithGridBasedHeadingAndDescriptionSchema,
  ],
  ['neo-general', TextSplitWithEmphasisBlockId, TextSplitWithEmphasisBlockSchema],
  ['neo-general', BulletIconsOnlyNeoGeneralId, BulletIconsOnlyNeoGeneralSchema],
  ['neo-general', BulletWithIconsNeoGeneralId, BulletWithIconsNeoGeneralSchema],
  ['neo-general', ChartWithBulletsNeoGeneralId, ChartWithBulletsNeoGeneralSchema],
  ['neo-general', MetricsWithImageNeoGeneralId, MetricsWithImageNeoGeneralSchema],
  ['neo-general', NumberedBulletsNeoGeneralId, NumberedBulletsNeoGeneralSchema],
  ['neo-general', QuoteNeoGeneralId, QuoteNeoGeneralSchema],
  ['neo-general', TeamNeoGeneralId, TeamNeoGeneralSchema],
  ['neo-general', TableOfContentWithoutPageNumberId, TableOfContentWithoutPageNumberSchema],
  [
    'neo-general',
    TitleMetricValueMetricLabelFunnelStagesId,
    TitleMetricValueMetricLabelFunnelStagesSchema,
  ],
  ['neo-general', MultiChartGridSlideId, MultiChartGridSlideSchema],
  [
    'neo-general',
    TitleDescriptionMultiChartGridWithMetricsId,
    TitleDescriptionMultiChartGridWithMetricsSchema,
  ],
  [
    'neo-general',
    TitleDescriptionMultiChartGridWithBulletsId,
    TitleDescriptionMultiChartGridWithBulletsSchema,
  ],

  // Modern
  ['modern', ModernIntroId, ModernIntroSchema],
  ['modern', BulletsIconsGridId, BulletsIconsGridSchema],
  ['modern', ModernBulletIconsId, ModernBulletIconsSchema],
  ['modern', ChartTableDescId, ChartTableDescSchema],
  ['modern', ChartMetricsId, ChartMetricsSchema],
  ['modern', ImageDescId, ImageDescSchema],
  ['modern', ImageListDescId, ImageListDescSchema],
  ['modern', ImagesDescId, ImagesDescSchema],
  ['modern', MetricsDescId, MetricsDescSchema],
  ['modern', ModernTocId, ModernTocSchema],

  // Neo Modern
  ['neo-modern', TitleDescriptionBulletListModernId, TitleDescriptionBulletListModernSchema],
  ['neo-modern', TitleDescriptionContactListId, TitleDescriptionContactListSchema],
  ['neo-modern', TitleDescriptionDualMetricsGridId, TitleDescriptionDualMetricsGridSchema],
  ['neo-modern', TitleDescriptionIconTimelineId, TitleDescriptionIconTimelineSchema],
  ['neo-modern', TitleDescriptionImageRightModernId, TitleDescriptionImageRightModernSchema],
  ['neo-modern', TitleDescriptionMetricsChartId, TitleDescriptionMetricsChartSchema],
  ['neo-modern', TitleDescriptionMetricsImageId, TitleDescriptionMetricsImageSchema],
  ['neo-modern', TitleDescriptionMetricsTableId, TitleDescriptionMetricsTableSchema],
  ['neo-modern', TitleDualComparisonChartsId, TitleDualComparisonChartsSchema],
  ['neo-modern', TitleDualComparisonCardsModernId, TitleDualComparisonCardsModernSchema],
  ['neo-modern', TitleHorizontalAltenenatingTimelineId, TitleHorizontalAltenenatingTimelineSchema],
  ['neo-modern', TitleKpiSnapshotGridId, TitleKpiSnapshotGridSchema],
  ['neo-modern', TitleSubtitlesChartId, TitleSubtitlesChartSchema],
  ['neo-modern', TitleTwoColumnNumberListId, TitleTwoColumnNumberListSchema],
  ['neo-modern', TitleDescriptionMultiChartGridId, TitleDescriptionMultiChartGridSchema],
  [
    'neo-modern',
    TitleDescriptionMultiChartGridWithMetricsModernId,
    TitleDescriptionMultiChartGridWithMetricsModernSchema,
  ],
  [
    'neo-modern',
    TitleDescriptionMultiChartGridWithBulletsModernId,
    TitleDescriptionMultiChartGridWithBulletsModernSchema,
  ],

  // Standard
  ['standard', StandardIntroId, StandardIntroSchema],
  ['standard', ChartLeftId, ChartLeftSchema],
  ['standard', ContactId, ContactSchema],
  ['standard', HeadingBulletId, HeadingBulletSchema],
  ['standard', IconBulletId, IconBulletSchema],
  ['standard', IconImageId, IconImageSchema],
  ['standard', StdImageListId, StdImageListSchema],
  ['standard', MetricsDescLayoutId, MetricsDescLayoutSchema],
  ['standard', NumBulletImgId, NumBulletImgSchema],
  ['standard', StdTocId, StdTocSchema],
  ['standard', VisualMetricsId, VisualMetricsSchema],

  // Neo Standard
  ['neo-standard', TitleBadgeChartId, TitleBadgeChartSchema],
  ['neo-standard', TitleDescriptionBulletListStandardId, TitleDescriptionBulletListStandardSchema],
  ['neo-standard', TitleDescriptionContactCardsId, TitleDescriptionContactCardsSchema],
  ['neo-standard', TitleDescriptionIconListId, TitleDescriptionIconListSchema],
  ['neo-standard', TitleDescriptionImageRightId, TitleDescriptionImageRightSchema],
  ['neo-standard', TitleDescriptionRadialCardsId, TitleDescriptionRadialCardsSchema],
  ['neo-standard', TitleDescriptionTableId, TitleDescriptionTableSchema],
  ['neo-standard', TitleDescriptionTimelineId, TitleDescriptionTimelineSchema],
  ['neo-standard', TitleDualChartsComparisonId, TitleDualChartsComparisonSchema],
  ['neo-standard', TitleDualComparisonCardsId, TitleDualComparisonCardsSchema],
  ['neo-standard', TitleKpiGridId, TitleKpiGridSchema],
  ['neo-standard', TitleMetricsChartId, TitleMetricsChartSchema],
  ['neo-standard', TitleMetricsImageId, TitleMetricsImageSchema],
  ['neo-standard', TitlePointsDonutGridId, TitlePointsDonutGridSchema],
  [
    'neo-standard',
    TitleDescriptionMultiChartGridStandardId,
    TitleDescriptionMultiChartGridStandardSchema,
  ],
  [
    'neo-standard',
    TitleDescriptionMultiChartGridWithMetricsStandardId,
    TitleDescriptionMultiChartGridWithMetricsStandardSchema,
  ],
  [
    'neo-standard',
    TitleDescriptionMultiChartGridWithBulletsStandardId,
    TitleDescriptionMultiChartGridWithBulletsStandardSchema,
  ],

  // Swift
  ['swift', SwiftIntroId, SwiftIntroSchema],
  ['swift', BulletsIconsTitleId, BulletsIconsTitleSchema],
  ['swift', IconBulletListId, IconBulletListSchema],
  ['swift', ImageListId, ImageListSchema],
  ['swift', MetricsNumbersId, MetricsNumbersSchema],
  ['swift', SimpleBulletId, SimpleBulletSchema],
  ['swift', SwiftTocId, SwiftTocSchema],
  ['swift', TableChartId, TableChartSchema],
  ['swift', TimelineId, TimelineSchema],

  // Neo Swift
  ['neo-swift', TitleCenteredChartId, TitleCenteredChartSchema],
  ['neo-swift', TitleChartMetricsSidebarId, TitleChartMetricsSidebarSchema],
  ['neo-swift', TitleDescriptionBulletListId, TitleDescriptionBulletListSchema],
  ['neo-swift', TitleDescriptionDataTableId, TitleDescriptionDataTableSchema],
  ['neo-swift', TitleDescriptionImageRightSwiftId, TitleDescriptionImageRightSwiftSchema],
  ['neo-swift', TitleDescriptionMetricsGridId, TitleDescriptionMetricsGridSchema],
  ['neo-swift', TitleDescriptionMetricsGridImageId, TitleDescriptionMetricsGridImageSchema],
  ['neo-swift', TitleDualComparisionBlockId, TitleDualComparisionBlockSchema],
  ['neo-swift', TitleLabelDescriptionStatCardsId, TitleLabelDescriptionStatCardsSchema],
  ['neo-swift', TitleSubtitleTeamMemberCardsId, TitleSubtitleTeamMemberCardsSchema],
  ['neo-swift', TitleTaglineDescriptionNumberedStepsId, TitleTaglineDescriptionNumberedStepsSchema],
  ['neo-swift', TitleThreeByThreeMetricsGridId, TitleThreeByThreeMetricsGridSchema],
  ['neo-swift', TitleDescriptionSixChartsGridId, TitleDescriptionSixChartsGridSchema],
  ['neo-swift', TitleDescriptionSixChartsFourMetricsId, TitleDescriptionSixChartsFourMetricsSchema],
  ['neo-swift', TitleDescriptionFourChartsSixBulletsId, TitleDescriptionFourChartsSixBulletsSchema],
];

/**
 * Map from full layout ID (`"group:layoutId"`) to Zod schema.
 * Mirrors the IDs produced by `createTemplateEntry` in the layouts registry.
 */
export const layoutSchemaMap: Map<string, z.ZodTypeAny> = new Map(
  entries.map(([group, layoutId, schema]) => [`${group}:${layoutId}`, schema])
);

/**
 * Look up the Zod schema for a given full layout ID (e.g. `"general:basic-info-slide"`).
 * Returns `undefined` if the layout ID is not found.
 */
export function getLayoutSchema(layoutId: string): z.ZodTypeAny | undefined {
  return layoutSchemaMap.get(layoutId);
}

/**
 * Get all registered layout IDs.
 */
export function getAllLayoutIds(): string[] {
  return [...layoutSchemaMap.keys()];
}
