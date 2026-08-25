export type SiteStatus =
  | "unknown"
  | "reachable"
  | "bridge-ready"
  | "bridge-missing"
  | "auth-failed"
  | "not-wordpress"
  | "error";

export type Site = {
  id: string;
  url: string;
  username: string;
  applicationPassword: string;
  label: string;
  status: SiteStatus;
  wordpressVersion?: string;
  lastCheckedAt?: string;
  lastError?: string;
};

export type PublicSite = Omit<Site, "applicationPassword"> & {
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

export type AgentCard =
  | {
      kind: "deploy";
      job: DeployJob;
    }
  | {
      kind: "plugin";
      plugin: PluginRecord;
    }
  | {
      kind: "site";
      site: PublicSite;
    }
  | {
      kind: "bridge";
    }
  | {
      kind: "pack";
      pluginId: string;
      slug: string;
      name: string;
      version: string;
      files: string[];
    };

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  createdAt: string;
  card?: AgentCard;
};

export type Store = {
  sites: Site[];
  plugins: PluginRecord[];
  jobs: DeployJob[];
  messages: ChatMessage[];
  lastSiteId?: string;
  lastPluginId?: string;
};

export type PublicStore = {
  sites: PublicSite[];
  plugins: PluginRecord[];
  jobs: DeployJob[];
  messages: ChatMessage[];
  lastSiteId?: string;
  lastPluginId?: string;
};
