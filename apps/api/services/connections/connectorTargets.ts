/**
 * Export an ein gewähltes Ziel: ein Teams-Kanal (Word-Datei in den
 * Dateiordner) oder ein Slack-Kanal (Nachricht).
 *
 * Eine Form für beide: `listTargets` liefert eine Ebene der Zielwahl,
 * `sendToTarget` schickt dorthin. Die Kennungen sind für den Client opak; hier
 * werden sie geprüft, bevor sie in einen Pfad gelangen.
 */
import { type ConnectorTarget, type ConnectorTargetProvider } from '@gruenerator/contracts';

import * as microsoftGraphClient from '../api-clients/microsoftGraphClient.js';
import * as slackClient from '../api-clients/slackClient.js';

import { ConnectionService } from './ConnectionService.js';
import { exportTitle } from './driveUpload.js';
import { decodeTeamsRef, encodeTeamsRef } from './teamsIds.js';

/** Die Kennung passt nicht zum Anbieter oder zur Ebene. */
export class InvalidTargetError extends Error {
  constructor(message = 'Ziel nicht gefunden.') {
    super(message);
    this.name = 'InvalidTargetError';
  }
}

/** Was mitgeschickt wurde, passt nicht zum Ziel (Datei fehlt, Text fehlt). */
export class MissingPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingPayloadError';
  }
}

export interface SendPayload {
  targetId: string;
  title: string;
  text?: string;
  docx?: Buffer;
}

export interface SendResult {
  name: string;
  webUrl: string;
}

const truncate = (text: string, max: number, note: string) =>
  text.length <= max ? text : `${text.slice(0, max - note.length)}${note}`;

export async function listTargets(
  provider: ConnectorTargetProvider,
  userId: string,
  parent?: string
): Promise<ConnectorTarget[]> {
  switch (provider) {
    case 'microsoft-teams': {
      const { accessToken } = await ConnectionService.getConnection(userId, provider);
      if (!parent) {
        const teams = await microsoftGraphClient.listJoinedTeams(accessToken);
        return teams.map((t) => ({
          id: encodeTeamsRef({ kind: 'team', teamId: t.id }),
          name: t.displayName,
          hasChildren: true,
          selectable: false,
        }));
      }
      const ref = decodeTeamsRef(parent);
      if (ref?.kind !== 'team') throw new InvalidTargetError();
      const channels = await microsoftGraphClient.listChannels(accessToken, ref.teamId);
      return channels.map((c) => ({
        id: encodeTeamsRef({ kind: 'channel', teamId: ref.teamId, channelId: c.id }),
        name: c.displayName,
        hasChildren: false,
        selectable: true,
      }));
    }
    case 'slack': {
      if (parent) throw new InvalidTargetError();
      const { accessToken } = await ConnectionService.getConnection(userId, provider);
      const channels = await slackClient.listMemberChannels(accessToken);
      return channels.map((c) => ({
        id: c.id,
        name: `${c.is_private ? '🔒 ' : '#'}${c.name}`,
        hasChildren: false,
        selectable: true,
      }));
    }
  }
}

export async function sendToTarget(
  provider: ConnectorTargetProvider,
  userId: string,
  payload: SendPayload
): Promise<SendResult> {
  // A file name loses what OneDrive rejects (`:`, `?` …); a message keeps it.
  const title = payload.title.replace(/\s+/g, ' ').trim() || 'Grünerator';
  switch (provider) {
    case 'microsoft-teams': {
      if (!payload.docx) throw new MissingPayloadError('Für Teams fehlt die Word-Datei.');
      const ref = decodeTeamsRef(payload.targetId);
      if (ref?.kind !== 'channel') throw new InvalidTargetError();
      const { accessToken } = await ConnectionService.getConnection(userId, provider);
      const folder = await microsoftGraphClient.getChannelFilesFolder(
        accessToken,
        ref.teamId,
        ref.channelId
      );
      const item = await microsoftGraphClient.uploadToFolder(
        accessToken,
        folder.driveId,
        folder.itemId,
        `${exportTitle(title)}.docx`,
        payload.docx
      );
      if (!item.webUrl) throw new Error('Graph returned no webUrl');
      return { name: item.name, webUrl: item.webUrl };
    }
    case 'slack': {
      const text = payload.text?.trim();
      if (!text) throw new MissingPayloadError('Für Slack fehlt der Text.');
      if (!/^[A-Z0-9]+$/.test(payload.targetId)) throw new InvalidTargetError();
      const { accessToken } = await ConnectionService.getConnection(userId, provider);
      const { permalink } = await slackClient.postMarkdownMessage(
        accessToken,
        payload.targetId,
        truncate(text, slackClient.SLACK_MARKDOWN_MAX, '\n\n… (gekürzt)'),
        title
      );
      return { name: title, webUrl: permalink };
    }
  }
}
