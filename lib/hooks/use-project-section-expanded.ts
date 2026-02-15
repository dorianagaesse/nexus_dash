"use client";

import { useEffect, useState } from "react";

interface UseProjectSectionExpandedOptions {
  projectId: string;
  sectionKey: string;
  defaultExpanded: boolean;
  logLabel: string;
}

export function useProjectSectionExpanded(
  options: UseProjectSectionExpandedOptions
) {
  const { projectId, sectionKey, defaultExpanded, logLabel } = options;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:${sectionKey}-expanded`;
      const storedValue = window.localStorage.getItem(storageKey);

      if (storedValue === "1" || storedValue === "0") {
        setIsExpanded(storedValue === "1");
      }
    } catch (error) {
      console.error(`[${logLabel}.loadExpandedState]`, error);
    }
  }, [logLabel, projectId, sectionKey]);

  useEffect(() => {
    try {
      const storageKey = `nexusdash:project:${projectId}:${sectionKey}-expanded`;
      window.localStorage.setItem(storageKey, isExpanded ? "1" : "0");
    } catch (error) {
      console.error(`[${logLabel}.persistExpandedState]`, error);
    }
  }, [isExpanded, logLabel, projectId, sectionKey]);

  return { isExpanded, setIsExpanded };
}
