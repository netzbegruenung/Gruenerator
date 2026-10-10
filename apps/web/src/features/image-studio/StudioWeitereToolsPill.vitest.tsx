import { HiOutlineSparkles, HiOutlineSquares2X2 } from 'react-icons/hi2';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { STUDIO_WERKZEUGE, filterWorkplaceTools } from '../../config/workplaceToolsConfig';
import { axe, render, screen, userEvent, within } from '../../test-utils';
import { OfficeActionPill, OfficeMenuPill } from '../workplace/components/ToolsSection';

const tools = filterWorkplaceTools(STUDIO_WERKZEUGE);

function renderRow() {
  return render(
    <MemoryRouter>
      <div>
        <OfficeActionPill
          styleKey="canvas"
          icon={HiOutlineSparkles}
          title="Anleitung"
          onClick={() => {}}
        />
        <OfficeMenuPill
          styleKey="canvas"
          icon={HiOutlineSquares2X2}
          title="Weitere Tools"
          tools={tools}
        />
      </div>
    </MemoryRouter>
  );
}

describe('OfficeMenuPill', () => {
  it('lists the studio tools with descriptions and hrefs, and has no axe violations', async () => {
    const user = userEvent.setup();
    renderRow();
    const trigger = screen.getByRole('button', { name: 'Weitere Tools' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(tools.length);
    tools.forEach((tool, i) => {
      expect(items[i]).toHaveAttribute('href', tool.path);
      expect(within(items[i]).getByText(tool.title)).toBeInTheDocument();
      expect(within(items[i]).getByText(tool.description!)).toBeInTheDocument();
    });
    expect(
      await axe(document.body, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });
});
