import { decodeSiteDraft, setSiteField } from '@gruenerator/contracts/site-ydoc';
import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithDraft } from '../../../test/renderWithDraft';

import { ContactSectionEditor } from './ContactSectionEditor';

vi.mock('../common/ImageUpload', () => ({ ImageUpload: () => null }));

describe('ContactSectionEditor', () => {
  it('typing a phone number writes contact_phone (#5801)', async () => {
    const { user, ydoc } = renderWithDraft(<ContactSectionEditor />);
    const phone = screen.getByLabelText('Telefon');
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).toHaveAttribute('maxlength', '40');
    await user.type(phone, '030 123');
    expect(decodeSiteDraft(ydoc).contact_phone).toBe('030 123');
  });

  it('shows a stored phone number and follows remote changes', () => {
    const { ydoc } = renderWithDraft(<ContactSectionEditor />, { contact_phone: '040 99' });
    expect(screen.getByLabelText('Telefon')).toHaveValue('040 99');
    act(() => setSiteField(ydoc, 'contact_phone', '050 1'));
    expect(screen.getByLabelText('Telefon')).toHaveValue('050 1');
  });

  it('has no address field', () => {
    renderWithDraft(<ContactSectionEditor />);
    expect(screen.queryByLabelText('Adresse')).toBeNull();
  });
});
