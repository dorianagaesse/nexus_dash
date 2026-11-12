export type AgentDeviceState = "Paired" | "Pending pairing" | "Expired" | "Revoked";
export type AgentIdentityState = "Active" | "Inactive" | "Expired";

// Mirrors the runtime service's alive(identity) check: launches are rejected
// once the identity is revoked or past its expiry.
export function agentIdentityState(
  identity: { revokedAt: string | null; expiresAt: string | null },
  now = Date.now()
): AgentIdentityState {
  if (identity.revokedAt) return "Inactive";
  if (identity.expiresAt && Date.parse(identity.expiresAt) <= now) return "Expired";
  return "Active";
}
export function agentDeviceState(device: {
  revokedAt: string | null;
  expiresAt: string;
  authorizedAt: string | null;
  pairingExpiresAt: string;
}, now = Date.now()): AgentDeviceState {
  if (device.revokedAt) return "Revoked";
  if (Date.parse(device.expiresAt) <= now) return "Expired";
  if (device.authorizedAt) return "Paired";
  return Date.parse(device.pairingExpiresAt) > now ? "Pending pairing" : "Expired";
}
