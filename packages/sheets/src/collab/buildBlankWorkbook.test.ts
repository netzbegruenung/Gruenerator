import { describe, expect, it } from 'vitest';

import { buildBlankWorkbook } from '../lib/blankWorkbook.js';

/**
 * Regression: a blank workbook MUST contain at least one worksheet. Univer
 * renders no grid for a workbook with `sheetOrder: []` / `sheets: {}`, which
 * made every newly-created sheet open as an empty (non-functional) editor.
 */
describe('buildBlankWorkbook', () => {
  it('seeds exactly one worksheet referenced by sheetOrder', () => {
    const wb = buildBlankWorkbook('doc-123');
    expect(wb.id).toBe('doc-123');
    expect(wb.sheetOrder?.length).toBe(1);
    const sheetId = wb.sheetOrder![0]!;
    expect(wb.sheets?.[sheetId]).toBeDefined();
    expect(wb.sheets![sheetId]!.id).toBe(sheetId);
    expect(wb.sheets![sheetId]!.name).toBeTruthy();
    expect(wb.sheets![sheetId]!.rowCount).toBeGreaterThan(0);
    expect(wb.sheets![sheetId]!.columnCount).toBeGreaterThan(0);
  });

  it('forces the workbook id to the documentId (shared unitId across clients)', () => {
    expect(buildBlankWorkbook('abc').id).toBe('abc');
  });
});
