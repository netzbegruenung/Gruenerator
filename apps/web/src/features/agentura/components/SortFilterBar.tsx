import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@gruenerator/ui';
import { PiArrowsDownUp, PiFunnel } from 'react-icons/pi';

export type AgenturaSort = 'empfohlen' | 'az' | 'favoriten';
export type AgenturaFilter = 'alle' | 'agents' | 'skills';

export const SORT_VALUES: AgenturaSort[] = ['empfohlen', 'az', 'favoriten'];
export const FILTER_VALUES: AgenturaFilter[] = ['alle', 'agents', 'skills'];

const SORT_LABELS: Record<AgenturaSort, string> = {
  empfohlen: 'Empfohlen',
  az: 'A–Z',
  favoriten: 'Favoriten zuerst',
};

const FILTER_LABELS: Record<AgenturaFilter, string> = {
  alle: 'Alle',
  agents: 'Nur Agent*innen',
  skills: 'Nur Skills',
};

interface SortFilterBarProps {
  sort: AgenturaSort;
  filter: AgenturaFilter;
  onSortChange: (sort: AgenturaSort) => void;
  onFilterChange: (filter: AgenturaFilter) => void;
}

export function SortFilterBar({ sort, filter, onSortChange, onFilterChange }: SortFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-sm">
      <Select value={filter} onValueChange={(v) => onFilterChange(v as AgenturaFilter)}>
        <SelectTrigger className="h-9 w-auto gap-xs" aria-label="Filtern">
          <PiFunnel className="h-4 w-4 text-foreground-muted" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTER_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {FILTER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={(v) => onSortChange(v as AgenturaSort)}>
        <SelectTrigger className="h-9 w-auto gap-xs" aria-label="Sortieren">
          <PiArrowsDownUp className="h-4 w-4 text-foreground-muted" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {SORT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
