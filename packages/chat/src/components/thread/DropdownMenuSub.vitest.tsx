/**
 * `DropdownMenuSub` from `@gruenerator/ui` holds a submenu's open state itself
 * (closing runs as a transition, so switching submenus does not block a frame).
 * That makes it state-carrying for every dropdown built on it, so the contract
 * is pinned here. `packages/ui` has no test lane; this one runs in the chat
 * package's jsdom lane, next to `PlusMenu`, the wrapper's main consumer.
 *
 * Pinned: an uncontrolled submenu still opens and closes, and a caller that
 * passes `open` keeps control while still being told about every change.
 * (`defaultOpen` is not pinned: inside an open root menu Radix moves focus to
 * the first entry on mount, which closes any submenu — unwrapped Radix too.)
 */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

function Menu({ sub }: { sub: React.ReactElement }) {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Menü</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Erster Eintrag</DropdownMenuItem>
        {sub}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubBody() {
  return (
    <>
      <DropdownMenuSubTrigger>Mehr</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem>Unterpunkt</DropdownMenuItem>
      </DropdownMenuSubContent>
    </>
  );
}

const subTrigger = () => screen.getByRole('menuitem', { name: 'Mehr' });

describe('DropdownMenuSub', () => {
  it('opens and closes on its own when uncontrolled', async () => {
    const user = userEvent.setup();
    render(
      <Menu
        sub={
          <DropdownMenuSub>
            <SubBody />
          </DropdownMenuSub>
        }
      />
    );
    expect(screen.queryByRole('menuitem', { name: 'Unterpunkt' })).toBeNull();

    subTrigger().focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Unterpunkt' })).toBeVisible();

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Unterpunkt' })).toBeNull();
    });
    expect(subTrigger()).toHaveAttribute('data-state', 'closed');
  });

  it('leaves a controlled submenu to its caller and reports every change', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Menu
        sub={
          <DropdownMenuSub open onOpenChange={onOpenChange}>
            <SubBody />
          </DropdownMenuSub>
        }
      />
    );
    expect(await screen.findByRole('menuitem', { name: 'Unterpunkt' })).toBeVisible();

    screen.getByRole('menuitem', { name: 'Unterpunkt' }).focus();
    onOpenChange.mockClear();
    await user.keyboard('{ArrowLeft}');

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    // The caller said `open`, so it stays open.
    expect(screen.getByRole('menuitem', { name: 'Unterpunkt' })).toBeVisible();
  });

  it('follows a controlled caller that does change its state', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <Menu
          sub={
            <DropdownMenuSub open={open} onOpenChange={setOpen}>
              <SubBody />
            </DropdownMenuSub>
          }
        />
      );
    }
    render(<Controlled />);
    subTrigger().focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('menuitem', { name: 'Unterpunkt' })).toBeVisible();

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Unterpunkt' })).toBeNull();
    });
  });
});
