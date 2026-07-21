-- Backfill locale for existing users who sign in through the Austrian IdP.
-- Better Auth's mapProfileToUser only sets locale at account CREATION, so users
-- created before the de-AT mapping (or via another IdP first) were stuck on the
-- 'de-DE' default even though they authenticate via keycloak-gruene-at. Going
-- forward this is kept in sync on every login (syncLocaleFromProvider); this
-- one-off backfill fixes existing rows so they don't need to re-login.
DO $$
BEGIN
  IF to_regclass('public.ba_accounts') IS NOT NULL THEN
    UPDATE profiles p
    SET locale = 'de-AT'
    FROM ba_accounts a
    WHERE a.user_id = p.id
      AND a.provider_id = 'keycloak-gruene-at'
      AND p.locale IS DISTINCT FROM 'de-AT';
  END IF;
END $$;
