import { beforeEach, describe, expect, it, vi } from 'vitest';

const accountRows = vi.hoisted(() => ({ value: [] as { accountId: string }[] }));
const keycloakDeleteUser = vi.hoisted(() => vi.fn(async (_id: string) => true));
const deleteProfile = vi.hoisted(() => vi.fn(async () => ({ success: true })));

vi.mock('../../config/betterAuth.js', () => ({
  auth: { api: { signOut: vi.fn(), getSession: vi.fn() } },
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: async () => accountRows.value }) }),
  }),
}));
vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () => ({ deleteUserDocuments: vi.fn() }),
}));
vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: () => ({ deleteProfile }),
}));
vi.mock('../../services/localization/localeCache.js', () => ({ setUserLocale: vi.fn() }));
vi.mock('../../services/roles/instanceRoleAssignment.js', () => ({
  assignInstanceRole: vi.fn(),
}));
vi.mock('../../utils/betterAuthSessionUser.js', () => ({ refreshSessionUserSnapshot: vi.fn() }));
vi.mock('../../utils/contractValidationLogger.js', () => ({
  logContractValidationError: vi.fn(),
}));
vi.mock('../../utils/keycloak/index.js', () => ({
  KeycloakApiClient: class {
    deleteUser = keycloakDeleteUser;
  },
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { userProfileContractRouter } = await import('./userProfileContractRouter.js');

const ACCOUNT_SUBJECT = '0f8fad5b-d9cb-469f-a165-70867728950e';

type DeleteAccount = (args: unknown) => Promise<{ status: number }>;

function deleteAccount(profileKeycloakId: string): Promise<{ status: number }> {
  return (userProfileContractRouter.deleteAccount as unknown as DeleteAccount)({
    req: {
      user: { id: 'user-1', keycloak_id: profileKeycloakId },
      headers: {},
      query: {},
    },
    body: { confirm: 'löschen' },
  });
}

beforeEach(() => {
  accountRows.value = [];
  vi.clearAllMocks();
});

describe('deleteAccount Keycloak cleanup', () => {
  it('deletes the subject of the Keycloak login, not the profile column', async () => {
    accountRows.value = [{ accountId: ACCOUNT_SUBJECT }];

    const result = await deleteAccount('../profile-column');

    expect(result.status).toBe(200);
    expect(keycloakDeleteUser.mock.calls).toEqual([[ACCOUNT_SUBJECT]]);
  });

  it('skips Keycloak when the user has no Keycloak login', async () => {
    const result = await deleteAccount('11111111-2222-4333-8444-555555555555');

    expect(result.status).toBe(200);
    expect(keycloakDeleteUser).not.toHaveBeenCalled();
    expect(deleteProfile).toHaveBeenCalledWith('user-1');
  });

  it('never passes a subject that is not a UUID to Keycloak', async () => {
    accountRows.value = [{ accountId: '..' }, { accountId: ACCOUNT_SUBJECT }];

    await deleteAccount('');

    expect(keycloakDeleteUser.mock.calls).toEqual([[ACCOUNT_SUBJECT]]);
  });
});
