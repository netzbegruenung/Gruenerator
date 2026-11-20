/**
 * Was hier leise falsch werden könnte: eine fremde oder falsche Kennung landet
 * in einem Graph- oder Slack-Aufruf, Teams bekommt keinen Dateiordner, oder
 * Slack postet einen leeren Text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConnection = vi.fn();
vi.mock('./ConnectionService.js', () => ({ ConnectionService: { getConnection } }));

const graph = {
  listJoinedTeams: vi.fn(),
  listChannels: vi.fn(),
  getChannelFilesFolder: vi.fn(),
  uploadToFolder: vi.fn(),
};
vi.mock('../api-clients/microsoftGraphClient.js', () => graph);

const slack = { listMemberChannels: vi.fn(), postMarkdownMessage: vi.fn(), SLACK_MARKDOWN_MAX: 20 };
vi.mock('../api-clients/slackClient.js', () => slack);

const { InvalidTargetError, MissingPayloadError, listTargets, sendToTarget } =
  await import('./connectorTargets.js');
const { encodeTeamsRef } = await import('./teamsIds.js');

const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const channelRef = encodeTeamsRef({ kind: 'channel', teamId: 'T1', channelId: '19:c@thread' });

beforeEach(() => {
  vi.clearAllMocks();
  getConnection.mockResolvedValue({ accessToken: 'tok' });
});

describe('listTargets', () => {
  it('Teams: teams first, then their channels as selectable targets', async () => {
    graph.listJoinedTeams.mockResolvedValue([{ id: 'T1', displayName: 'LV Bayern' }]);
    graph.listChannels.mockResolvedValue([{ id: '19:c@thread', displayName: 'Presse' }]);

    const [team] = await listTargets('microsoft-teams', 'u1');
    expect(team).toMatchObject({ name: 'LV Bayern', hasChildren: true, selectable: false });

    const channels = await listTargets('microsoft-teams', 'u1', team.id);
    expect(graph.listChannels).toHaveBeenCalledWith('tok', 'T1');
    expect(channels).toEqual([
      { id: channelRef, name: 'Presse', hasChildren: false, selectable: true },
    ]);
  });

  it('Teams: a channel id as parent is not a level', async () => {
    await expect(listTargets('microsoft-teams', 'u1', channelRef)).rejects.toBeInstanceOf(
      InvalidTargetError
    );
  });

  it('Slack: one flat level of channels the bot is in', async () => {
    slack.listMemberChannels.mockResolvedValue([
      { id: 'C1', name: 'presse' },
      { id: 'G1', name: 'vorstand', is_private: true },
    ]);
    expect((await listTargets('slack', 'u1')).map((t) => t.name)).toEqual([
      '#presse',
      '🔒 vorstand',
    ]);
    await expect(listTargets('slack', 'u1', 'C1')).rejects.toBeInstanceOf(InvalidTargetError);
  });
});

describe('sendToTarget', () => {
  it('Teams: puts the Word file into the channel’s Files folder', async () => {
    graph.getChannelFilesFolder.mockResolvedValue({ driveId: 'b!d', itemId: 'F1', webUrl: null });
    graph.uploadToFolder.mockResolvedValue({ name: 'Antrag Radwege.docx', webUrl: 'https://sp/x' });

    const result = await sendToTarget('microsoft-teams', 'u1', {
      targetId: channelRef,
      title: 'Antrag: Radwege',
      docx: DOCX,
    });

    expect(graph.getChannelFilesFolder).toHaveBeenCalledWith('tok', 'T1', '19:c@thread');
    expect(graph.uploadToFolder).toHaveBeenCalledWith(
      'tok',
      'b!d',
      'F1',
      'Antrag Radwege.docx',
      DOCX
    );
    expect(result).toEqual({ name: 'Antrag Radwege.docx', webUrl: 'https://sp/x' });
  });

  it('Teams: refuses without a file and with a team instead of a channel', async () => {
    await expect(
      sendToTarget('microsoft-teams', 'u1', { targetId: channelRef, title: 'T' })
    ).rejects.toBeInstanceOf(MissingPayloadError);
    await expect(
      sendToTarget('microsoft-teams', 'u1', {
        targetId: encodeTeamsRef({ kind: 'team', teamId: 'T1' }),
        title: 'T',
        docx: DOCX,
      })
    ).rejects.toBeInstanceOf(InvalidTargetError);
    expect(graph.uploadToFolder).not.toHaveBeenCalled();
  });

  it('Slack: posts the markdown, cut to Slack’s limit, and keeps the title as is', async () => {
    slack.postMarkdownMessage.mockResolvedValue({ permalink: 'https://x.slack.com/p1' });

    const result = await sendToTarget('slack', 'u1', {
      targetId: 'C1',
      title: 'Antrag: Radwege',
      text: 'x'.repeat(50),
    });

    const [, channel, markdown, fallback] = slack.postMarkdownMessage.mock.calls[0] as string[];
    expect(channel).toBe('C1');
    expect(markdown).toHaveLength(20);
    expect(markdown.endsWith('(gekürzt)')).toBe(true);
    expect(fallback).toBe('Antrag: Radwege');
    expect(result).toEqual({ name: 'Antrag: Radwege', webUrl: 'https://x.slack.com/p1' });
  });

  it('Slack: refuses empty text and ids that are not Slack ids', async () => {
    await expect(
      sendToTarget('slack', 'u1', { targetId: 'C1', title: 'T', text: '  ' })
    ).rejects.toBeInstanceOf(MissingPayloadError);
    await expect(
      sendToTarget('slack', 'u1', { targetId: '../C1', title: 'T', text: 'x' })
    ).rejects.toBeInstanceOf(InvalidTargetError);
    expect(getConnection).not.toHaveBeenCalled();
  });
});
