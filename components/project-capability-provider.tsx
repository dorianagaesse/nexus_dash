"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ProjectCapability } from "@/lib/project-capabilities";
const CapabilityContext = createContext<readonly ProjectCapability[] | null>(null);
export function ProjectCapabilityProvider({ capabilities, children }: { capabilities: readonly ProjectCapability[]; children: ReactNode }) {
  return <CapabilityContext.Provider value={capabilities}>{children}</CapabilityContext.Provider>;
}
export function useProjectCapability(capability: ProjectCapability): boolean {
  const capabilities = useContext(CapabilityContext);
  return capabilities === null || capabilities.includes(capability);
}
