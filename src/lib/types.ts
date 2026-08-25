export type SiteStatus =
  | "unknown"
  | "connected"
  | "helper-missing"
  | "auth-failed"
  | "not-wordpress"
  | "error";

export type Site = {
  id: string;
  url: string;
  username: string;
  password: string;
  label: string;
  status: SiteStatus;
  lastCheckedAt?: string;
  lastError?: string;
};

export type PublicSite = Omit<Site, "password"> & {
  hasPassword: boolean;
};

export type PluginRecord = {
  id: string;
  path: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  mainFile: string;
  fileCount: number;
  lastInspectedAt: string;
};

export type DeployAction = "install" | "update" | "pack";

export type DeployJob = {
  id: string;
  action: DeployAction;
  siteId?: string;
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  siteUrl?: string;
  status: "success" | "error";
  message: string;
  files: string[];
  remoteAction?: "installed" | "updated";
  active?: boolean;
  createdAt: string;
};

export type AgentStep = {
  tool: string;
  label: string;
  status: "done" | "error";
  detail?: string;
};

export type AgentCard =
  | { kind: "deploy"; job: DeployJob }
  | { kind: "plugin"; plugin: PluginRecord }
  | { kind: "site"; site: PublicSite }
  | {
      kind: "pack";
      pluginId: string;
      slug: string;
      name: string;
      version: string;
      files: string[];
    }
  | { kind: "helper" };

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  createdAt: string;
  steps?: AgentStep[];
  card?: AgentCard;
};

export type AgentGoal = "install" | "update" | "pack";

export type PendingAsk = "url" | "path" | "username" | "password";

export type PendingTask = {
  goal: AgentGoal;
  url?: string;
  path?: string;
  username?: string;
  password?: string;
  ask?: PendingAsk;
};

export type PublicPending = {
  goal: AgentGoal;
  url?: string;
  path?: string;
  username?: string;
  hasPassword: boolean;
  ask?: PendingAsk;
};

export type Store = {
  version: number;
  sites: Site[];
  plugins: PluginRecord[];
  jobs: DeployJob[];
  messages: ChatMessage[];
  lastSiteId?: string;
  lastPluginId?: string;
  pending?: PendingTask;
};

export type PublicStore = {
  sites: PublicSite[];
  plugins: PluginRecord[];
  jobs: DeployJob[];
  messages: ChatMessage[];
  lastSiteId?: string;
  lastPluginId?: string;
  pending?: PublicPending;
};
