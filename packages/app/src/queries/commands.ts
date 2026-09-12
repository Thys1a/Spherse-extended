import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "../lib/api";
import { queryClient } from "./client";
import { projectQueryKeys } from "./keys";

export function useProjectCommands(projectId: string, client: ApiClient | null) {
  return useQuery({
    queryKey: projectQueryKeys.commands(projectId),
    queryFn: () => client!.listCommands(),
    enabled: Boolean(projectId && client),
  });
}

export async function invalidateProjectCommandQueries(projectId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: projectQueryKeys.commands(projectId) });
}
