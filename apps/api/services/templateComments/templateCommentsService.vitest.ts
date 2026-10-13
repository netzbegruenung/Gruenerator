import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryOne = vi.fn();
const query = vi.fn();
const exec = vi.fn();
const templateExistsFor = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ queryOne, query, exec }),
}));
vi.mock('../templateInteractions/templateTarget.js', () => ({
  isUserTemplateId: (id: string) => /^[0-9a-f-]{36}$/i.test(id),
  templateExistsFor: (...args: unknown[]) => templateExistsFor(...args),
}));

const { createTemplateComment, deleteTemplateComment, listTemplateComments } =
  await import('./templateCommentsService.js');

const TEMPLATE = '11111111-1111-4111-8111-111111111111';
const COMMENT = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
  templateExistsFor.mockResolvedValue(true);
});

describe('templateComments', () => {
  it('hides comments of a Vorlage the viewer cannot see', async () => {
    templateExistsFor.mockResolvedValue(false);
    expect(await listTemplateComments(TEMPLATE, 'u1')).toMatchObject({ status: 404 });
    expect(query).not.toHaveBeenCalled();
    expect(
      await createTemplateComment({ templateId: TEMPLATE, userId: 'u1', body: 'Hi' })
    ).toMatchObject({
      status: 404,
    });
  });

  it('hangs a reply to a reply on the top-level comment', async () => {
    queryOne.mockResolvedValueOnce({ id: 'reply', parent_id: 'top' }).mockResolvedValueOnce({
      id: 'new',
      template_id: TEMPLATE,
      parent_id: 'top',
      user_id: 'u1',
      body: 'Antwort',
      created_at: new Date('2026-10-13T10:00:00Z'),
      author_name: 'Anna',
    });
    const out = await createTemplateComment({
      templateId: TEMPLATE,
      userId: 'u1',
      body: ' Antwort ',
      parentId: 'reply',
    });
    expect(queryOne.mock.calls[1]![1]).toEqual([TEMPLATE, 'u1', 'Antwort', 'top']);
    expect(out).toMatchObject({ status: 201, data: { parentId: 'top', authorName: 'Anna' } });
  });

  it('lets the author delete, refuses a stranger, allows the Vorlage owner', async () => {
    queryOne.mockResolvedValueOnce({ user_id: 'u1' });
    expect(
      await deleteTemplateComment({ templateId: TEMPLATE, commentId: COMMENT, userId: 'u1' })
    ).toMatchObject({
      status: 200,
    });

    queryOne.mockResolvedValueOnce({ user_id: 'u1' }).mockResolvedValueOnce({ user_id: 'owner' });
    expect(
      await deleteTemplateComment({ templateId: TEMPLATE, commentId: COMMENT, userId: 'u2' })
    ).toMatchObject({
      status: 403,
    });

    queryOne.mockResolvedValueOnce({ user_id: 'u1' }).mockResolvedValueOnce({ user_id: 'owner' });
    expect(
      await deleteTemplateComment({ templateId: TEMPLATE, commentId: COMMENT, userId: 'owner' })
    ).toMatchObject({
      status: 200,
    });
  });

  it('never grants moderation on catalogue Vorlagen', async () => {
    queryOne.mockResolvedValueOnce({ user_id: 'u1' });
    const out = await deleteTemplateComment({
      templateId: 'sharepic-abc',
      commentId: COMMENT,
      userId: 'u2',
    });
    expect(out).toMatchObject({ status: 403 });
    expect(queryOne).toHaveBeenCalledTimes(1);
  });
});
