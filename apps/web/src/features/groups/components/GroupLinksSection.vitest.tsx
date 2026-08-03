import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import GroupLinksSection from './GroupLinksSection';

import type { GroupLink } from '../hooks/useGroups';

const links: GroupLink[] = [
  { id: 'link-1', title: 'Signal-Gruppe', url: 'https://signal.group/x', icon: 'signal' },
  { id: 'link-2', title: 'Webseite', url: 'https://example.com', icon: 'globe' },
];

describe('GroupLinksSection', () => {
  it('renders nothing when there are no links', () => {
    const { container } = render(
      <GroupLinksSection
        links={[]}
        isAdmin={false}
        onUpdateLink={vi.fn()}
        onDeleteLink={vi.fn()}
        isUpdatingLink={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each link as an anchor pointing at its URL', () => {
    render(
      <GroupLinksSection
        links={links}
        isAdmin={false}
        onUpdateLink={vi.fn()}
        onDeleteLink={vi.fn()}
        isUpdatingLink={false}
      />
    );
    expect(screen.getByRole('link', { name: /Signal-Gruppe/ })).toHaveAttribute(
      'href',
      'https://signal.group/x'
    );
  });

  it('hides edit/delete controls for non-admins', () => {
    render(
      <GroupLinksSection
        links={links}
        isAdmin={false}
        onUpdateLink={vi.fn()}
        onDeleteLink={vi.fn()}
        isUpdatingLink={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'Link löschen' })).not.toBeInTheDocument();
  });

  it('calls onDeleteLink with the link id when an admin deletes a link', async () => {
    const onDeleteLink = vi.fn();
    const user = userEvent.setup();
    render(
      <GroupLinksSection
        links={links}
        isAdmin
        onUpdateLink={vi.fn()}
        onDeleteLink={onDeleteLink}
        isUpdatingLink={false}
      />
    );
    const deleteButtons = screen.getAllByRole('button', { name: 'Link löschen' });
    await user.click(deleteButtons[0]);
    expect(onDeleteLink).toHaveBeenCalledWith('link-1');
  });

  it('renders an edit button per link for admins', () => {
    render(
      <GroupLinksSection
        links={links}
        isAdmin
        onUpdateLink={vi.fn()}
        onDeleteLink={vi.fn()}
        isUpdatingLink={false}
      />
    );
    expect(screen.getAllByRole('button', { name: 'Link bearbeiten' })).toHaveLength(links.length);
  });

  it('has no axe violations (regression: link icons must be aria-hidden)', async () => {
    // The link-type icons (react-icons, e.g. SiSignal) render with role="img" and no
    // accessible name — an svg-img-alt violation — until marked aria-hidden.
    const { container } = render(
      <GroupLinksSection
        links={links}
        isAdmin={false}
        onUpdateLink={vi.fn()}
        onDeleteLink={vi.fn()}
        isUpdatingLink={false}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
