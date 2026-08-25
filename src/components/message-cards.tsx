"use client";

import { CheckCircle2, Download, Globe, Plug, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentCard, DeployJob, PluginRecord, PublicSite } from "@/lib/types";

export function MessageCard({ card }: { card: AgentCard }) {
  if (card.kind === "deploy") return <DeployCard job={card.job} />;
  if (card.kind === "plugin") return <PluginCard plugin={card.plugin} />;
  if (card.kind === "site") return <SiteCard site={card.site} />;
  if (card.kind === "bridge") return <BridgeCard />;
  if (card.kind === "pack") {
    return (
      <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {card.name}{" "}
              <span className="text-muted-foreground">{card.version}</span>
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {card.slug}.zip · {card.files.length} files
            </p>
          </div>
          <Button size="sm" render={<a href={`/api/pack?pluginId=${card.pluginId}`} />}>
            <Download />
            Zip
          </Button>
        </div>
        {card.files.length > 0 ? (
          <ul className="mt-3 max-h-28 space-y-1 overflow-auto font-mono text-[11px] text-muted-foreground">
            {card.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  return null;
}

function DeployCard({ job }: { job: DeployJob }) {
  const ok = job.status === "success";
  return (
    <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="size-4 text-emerald-400" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
        <p className="font-medium">
          {ok ? (job.remoteAction === "updated" ? "Updated" : "Installed") : "Deploy failed"}
        </p>
        <Badge variant={ok ? "secondary" : "destructive"}>{job.pluginVersion || "—"}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{job.message}</p>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {job.pluginName}
        {job.siteUrl ? ` → ${job.siteUrl}` : ""} · {job.files.length} files
      </p>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginRecord }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <Plug className="size-4 text-primary" />
        <p className="font-medium">{plugin.name}</p>
        <Badge variant="secondary">{plugin.version}</Badge>
      </div>
      <p className="mt-2 font-mono text-[11px] break-all text-muted-foreground">{plugin.path}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {plugin.fileCount} files · {plugin.mainFile}
      </p>
    </div>
  );
}

function SiteCard({ site }: { site: PublicSite }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <Globe className="size-4 text-primary" />
        <p className="font-medium">{site.label}</p>
        <StatusBadge status={site.status} />
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">{site.url}</p>
      {site.lastError ? (
        <p className="mt-2 text-xs text-destructive">{site.lastError}</p>
      ) : null}
    </div>
  );
}

function BridgeCard() {
  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/8 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">PressPush Bridge</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Install once: Plugins → Add New → Upload Plugin → Activate. Then this agent can
            push updates over the REST API.
          </p>
        </div>
        <Button size="sm" render={<a href="/api/bridge" />}>
          <Download />
          Zip
        </Button>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: PublicSite["status"] }) {
  const label =
    status === "bridge-ready"
      ? "ready"
      : status === "bridge-missing"
        ? "needs bridge"
        : status === "auth-failed"
          ? "bad login"
          : status === "not-wordpress"
            ? "not WP"
            : status === "reachable"
              ? "needs password"
              : status === "error"
                ? "error"
                : "unchecked";

  const variant =
    status === "bridge-ready"
      ? "secondary"
      : status === "auth-failed" || status === "error" || status === "not-wordpress"
        ? "destructive"
        : "outline";

  return <Badge variant={variant}>{label}</Badge>;
}

export function PressMark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <svg viewBox="0 0 32 32" className="size-full" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#2A221C" />
        <rect x="6" y="7" width="20" height="18" rx="2" fill="currentColor" />
        <rect x="9" y="11" width="14" height="3" rx="1" fill="#2A221C" />
        <rect x="9" y="17" width="9" height="3" rx="1" fill="#2A221C" />
      </svg>
    </span>
  );
}

export function QuickChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      {label}
    </button>
  );
}

