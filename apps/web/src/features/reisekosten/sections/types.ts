import type { BelegMeta, ComputeResult, ReisekostenState } from '@gruenerator/contracts';

export interface SectionProps {
  state: ReisekostenState;
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
}

export interface SectionWithTotalsProps extends SectionProps {
  computed: ComputeResult;
  belege: BelegMeta[];
}
