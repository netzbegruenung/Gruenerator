import { describe, expect, it } from 'vitest';

import {
  applyBoardAssigneeChange,
  boardAssigneeUserIds,
  parseBoardAssignees,
  serializeBoardAssignees,
  type BoardAssignee,
} from './boardCards.js';

const anna: BoardAssignee = { id: 'a1', name: 'Anna', avatarRobotId: 2 };
const ben: BoardAssignee = { id: 'b1', name: 'Ben', avatarRobotId: 1 };

describe('parseBoardAssignees', () => {
  it('liest das JSON-Array des Web-Boards', () => {
    expect(parseBoardAssignees(JSON.stringify([anna, ben]))).toEqual([anna, ben]);
  });

  it('macht aus einem nackten Namen (alter Chat-Schreibweg) einen Eintrag ohne Id', () => {
    expect(parseBoardAssignees('Mia')).toEqual([{ id: '', name: 'Mia', avatarRobotId: 1 }]);
  });

  it('leere Zelle → keine Zuständigen', () => {
    expect(parseBoardAssignees('')).toEqual([]);
    expect(parseBoardAssignees(null)).toEqual([]);
  });
});

describe('applyBoardAssigneeChange', () => {
  it('add hängt an und doppelt nicht', () => {
    expect(applyBoardAssigneeChange([anna], { mode: 'add', person: ben })).toEqual([anna, ben]);
    expect(applyBoardAssigneeChange([anna], { mode: 'add', person: anna })).toEqual([anna]);
  });

  it('replace ersetzt alle, null leert', () => {
    expect(applyBoardAssigneeChange([anna, ben], { mode: 'replace', person: ben })).toEqual([ben]);
    expect(applyBoardAssigneeChange([anna], { mode: 'replace', person: null })).toEqual([]);
  });

  it('remove nimmt über die Id heraus, einen Alt-Eintrag über den Namen', () => {
    expect(applyBoardAssigneeChange([anna, ben], { mode: 'remove', person: anna })).toEqual([ben]);
    const legacy = parseBoardAssignees('Mia');
    expect(
      applyBoardAssigneeChange(legacy, {
        mode: 'remove',
        person: { id: '', name: 'mia', avatarRobotId: 1 },
      })
    ).toEqual([]);
  });

  it('das Ergebnis zählt fürs Tagesbriefing (Profil-Ids lesbar)', () => {
    const cell = serializeBoardAssignees(
      applyBoardAssigneeChange(parseBoardAssignees('Mia'), { mode: 'add', person: anna })
    );
    expect(boardAssigneeUserIds(cell)).toEqual(['a1']);
    expect(serializeBoardAssignees([])).toBe('');
  });
});
