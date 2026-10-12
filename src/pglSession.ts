// pglSession.ts
// Replaces Firebase auth. gnomledger authenticates via x-api-key, not user tokens.
// This bootstraps (or reuses) an account/api_key and persists it locally so the
// PGL Studio shell can operate as a standalone product without a login screen,
// while still being ready to accept a real multi-user login layer later.

import { bootstrapAccount } from "./gnomledgerApi";
import type { SessionState } from "./gnomledgerTypes";

const STORAGE_KEY = "pgl_session_v1";

function readStoredSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

function writeStoredSession(session: SessionState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * Returns an active session, bootstrapping a new account on first run.
 * On repeat visits, reuses the persisted api_key so the same account/agents
 * are visible across page reloads.
 */
export async function getOrCreateSession(): Promise<SessionState> {
  const existing = readStoredSession();
  if (existing?.apiKey) {
    return existing;
  }

  // Deployed mode: the Studio server adds PGL_STUDIO_API_KEY to every Genome Ledger
  // request, so the browser holds no key and does not bootstrap. A production
  // gnomledger already has its runtime account, so /admin/bootstrap would answer 409.
  const bootstrapToken = import.meta.env.VITE_PGL_BOOTSTRAP_TOKEN as string | undefined;
  if (!bootstrapToken) {
    return { apiKey: "", accountId: 0, role: "owner" };
  }

  // Local dev against an empty database: bootstrap a fresh PGL account.
  // NOTE: BOOTSTRAP_ADMIN_TOKEN must match the value configured on the
  // gnomledger backend (see gnomledger/.env.example -> BOOTSTRAP_ADMIN_TOKEN).
  // For a standalone-product launch this should be replaced by a real
  // signup/login flow that issues per-customer keys instead of a shared
  // bootstrap token.

  const result = await bootstrapAccount({
    bootstrap_token: bootstrapToken,
    account_name: "PGL Studio Workspace",
    // "free" requires the backend schema+quota patch in schemas.py/billing_service.py
    // to be deployed to pgl-jade.vercel.app. Until that ships, this call will 422
    // against production — fall back to "launch" if you haven't deployed yet.
    account_tier: "free",
    admin_name: "studio-user"
  });

  const session: SessionState = {
    apiKey: result.api_key,
    accountId: result.account_id,
    role: result.role
  };

  writeStoredSession(session);
  return session;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
