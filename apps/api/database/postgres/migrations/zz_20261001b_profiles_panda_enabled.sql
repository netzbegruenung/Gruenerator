-- Per-account decision on the „Panda" model lane (DeepSeek). NULL = no
-- decision, the instance default applies (`pandaTierDefault` in
-- packages/shared/src/instances). Only an instance admin writes it, after the
-- account has been trained — see services/user/pandaEntitlement.ts.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS panda_enabled BOOLEAN;
