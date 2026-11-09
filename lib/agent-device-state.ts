export type AgentDeviceState = "Paired" | "Pending pairing" | "Expired" | "Revoked";
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
