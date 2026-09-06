import { useCallback, useEffect, useState } from "react";

import { readApiError } from "@/components/kanban-board-utils";

export function useKanbanTaskSearch(input: {
  projectId: string;
  query: string;
  searchableTaskRevision: string;
}) {
  const normalizedQuery = input.query.trim();
  const [searchTaskIds, setSearchTaskIds] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!normalizedQuery) {
      setSearchTaskIds(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    const debounceTimer = window.setTimeout(() => {
      const runSearch = async () => {
        setIsLoading(true);
        setError(null);

        try {
          const response = await fetch(
            `/api/projects/${input.projectId}/tasks/search?q=${encodeURIComponent(normalizedQuery)}`,
            { signal: abortController.signal }
          );
          if (!response.ok) {
            throw new Error(await readApiError(response, "Could not search tasks."));
          }

          const payload = (await response.json()) as { taskIds: string[] };
          if (!abortController.signal.aborted) {
            setSearchTaskIds(new Set(payload.taskIds));
          }
        } catch (searchError) {
          if (abortController.signal.aborted) {
            return;
          }

          console.error("[useKanbanTaskSearch]", searchError);
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Could not search tasks."
          );
        } finally {
          if (!abortController.signal.aborted) {
            setIsLoading(false);
          }
        }
      };

      void runSearch();
    }, 200);

    return () => {
      window.clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [
    input.projectId,
    input.searchableTaskRevision,
    normalizedQuery,
    retryVersion,
  ]);

  const retry = useCallback(() => {
    setRetryVersion((version) => version + 1);
  }, []);

  return {
    normalizedQuery,
    searchTaskIds: normalizedQuery ? searchTaskIds : null,
    isLoading,
    error,
    retry,
  };
}
