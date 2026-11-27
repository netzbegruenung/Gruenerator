import {
  type TableRepairRepairResponse,
  type TableRepairScanResponse,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

export async function scanTablePage(
  cursor: string | null,
  limit: number
): Promise<TableRepairScanResponse> {
  const result = await getContractsClient().tableRepair.scan({ body: { cursor, limit } });
  if (result.status === 200) return result.body;
  if (result.status === 403) throw new Error('Kein Zugriff (Instanz-Admin erforderlich)');
  throw new ApiError(result.status, `Prüfung fehlgeschlagen (HTTP ${result.status})`);
}

export async function repairTableSources(
  documentIds: string[]
): Promise<TableRepairRepairResponse['results']> {
  const result = await getContractsClient().tableRepair.repair({ body: { documentIds } });
  if (result.status === 200) return result.body.results;
  if (result.status === 403) throw new Error('Kein Zugriff (Instanz-Admin erforderlich)');
  throw new ApiError(result.status, `Neu indexieren fehlgeschlagen (HTTP ${result.status})`);
}
