import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "../../lib/api";
import { queryClient } from "../client";
import { projectQueryKeys } from "../keys";
import type { AgentSummary } from "../../lib/types";
import { refreshProjectSessions } from "./sessions";

const EMPTY_AGENTS: AgentSummary[] = [];

export function useProjectAgents(projectId: string, client: ApiClient | null) {
  const agentsQuery = useQuery({
    queryKey: projectQueryKeys.agents(projectId),
    queryFn: () => client!.listAgents(),
    enabled: Boolean(projectId && client),
  });
  return {
    agents: agentsQuery.data ?? EMPTY_AGENTS,
    loading: agentsQuery.isPending,
    error: agentsQuery.error,
  };
}

export function getCachedAgents(projectId: string): AgentSummary[] {
  return queryClient.getQueryData(projectQueryKeys.agents(projectId)) ?? EMPTY_AGENTS;
}

export function useAgentProfile(projectId: string, client: ApiClient | null, agentId: string) {
  const profileQuery = useQuery({
    queryKey: [...projectQueryKeys.agents(projectId), agentId, "profile"],
    queryFn: () => client!.getAgent(agentId),
    enabled: Boolean(projectId && client && agentId),
  });
  return {
    profile: profileQuery.data ?? null,
    loading: profileQuery.isPending,
    error: profileQuery.error,
  };
}

export async function refreshAgentProfile(projectId: string, agentId: string): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: [...projectQueryKeys.agents(projectId), agentId, "profile"],
  });
}

export async function ensureProjectAgents(projectId: string, client: ApiClient): Promise<AgentSummary[]> {
  return queryClient.ensureQueryData({
    queryKey: projectQueryKeys.agents(projectId),
    queryFn: () => client.listAgents(),
  });
}

export async function refreshProjectAgents(projectId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: projectQueryKeys.agents(projectId) });
}

export async function createProjectAgent(
  projectId: string,
  client: ApiClient,
  slug: string,
  content: string,
  themeContent?: string,
): Promise<void> {
  await client.createAgent(slug, content, themeContent);
  await refreshProjectAgents(projectId);
  await refreshProjectSessions(projectId);
}

export async function updateProjectAgent(
  projectId: string,
  client: ApiClient,
  agentId: string,
  content: string,
  themeContent?: string,
): Promise<void> {
  await client.updateAgent(agentId, content, themeContent);
  await refreshProjectAgents(projectId);
  await refreshAgentProfile(projectId, agentId);
}

export async function deleteProjectAgent(
  projectId: string,
  client: ApiClient,
  agentId: string,
): Promise<void> {
  await client.deleteAgent(agentId);
  await refreshProjectAgents(projectId);
  await refreshProjectSessions(projectId);
  await refreshAgentProfile(projectId, agentId);
}
