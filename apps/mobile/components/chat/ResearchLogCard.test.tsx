import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { lightTheme } from '../../theme/colors';

import { ResearchLogCard } from './ResearchLogCard';

import type { ResearchLogArtifact } from '@gruenerator/chat';

let mockActive: ResearchLogArtifact | null = null;

jest.mock('@gruenerator/chat', () => ({
  useArtifactLiveStore: (select: (s: { activeArtifact: unknown }) => unknown) =>
    select({ activeArtifact: mockActive }),
}));

const log = (patch: Partial<ResearchLogArtifact>): ResearchLogArtifact => ({
  id: 'r1',
  type: 'research_log',
  title: 'Recherche: X',
  plan: [],
  steps: [],
  status: 'running',
  ...patch,
});

beforeEach(() => {
  mockActive = null;
});

describe('ResearchLogCard', () => {
  it('shows plan progress and steps of a running log', () => {
    mockActive = log({
      plan: [
        { id: 'p1', label: 'Quellen sammeln', status: 'done' },
        { id: 'p2', label: 'Bericht schreiben', status: 'running' },
      ],
      steps: [{ id: 's1', label: 'Websuche „Klimageld"', status: 'running' }],
    });
    render(<ResearchLogCard theme={lightTheme} />);

    expect(screen.getByText('Plan (1/2)')).toBeTruthy();
    expect(screen.getByText('Bericht schreiben')).toBeTruthy();
    expect(screen.getByLabelText('Websuche „Klimageld" — läuft')).toBeTruthy();
  });

  it('says the agent is planning before the first update', () => {
    mockActive = log({});
    render(<ResearchLogCard theme={lightTheme} />);
    expect(screen.getByText('Der Agent plant die Recherche…')).toBeTruthy();
  });

  it.each(['done', 'failed'] as const)(
    'renders nothing for a %s log from an earlier turn',
    (status) => {
      mockActive = log({ status, plan: [{ id: 'p1', label: 'Quellen sammeln', status: 'done' }] });
      render(<ResearchLogCard theme={lightTheme} />);
      expect(screen.queryByTestId('research-log-card')).toBeNull();
    }
  );

  it('renders nothing without a research log', () => {
    render(<ResearchLogCard theme={lightTheme} />);
    expect(screen.queryByTestId('research-log-card')).toBeNull();
  });
});
