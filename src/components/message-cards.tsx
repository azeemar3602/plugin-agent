"use client";

import { CheckCircle2, Download, Globe, LoaderCircle, Plug, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentCard, AgentStep, DeployJob, PluginRecord, PublicSite } from "@/lib/types";

export function MessageCard({ card }: { card: AgentCard }) {
  if (card.kind === "deploy") return <DeployCard job={card.job} />;
  if (card.kind === "plugin") return <PluginCard plugin={card.plugin} />;
  if (card.kind === "site") return <SiteCard site={card.site} />;
  if (card.kind === "templates") return <TemplatesCard card={card} />;
  if (card.kind === "design") return <DesignCard card={card} />;
  if (card.kind === "helper") return <HelperCard />;
  if (card.kind === "pack") {
    return (
      <div className="mt-3 rounded-xl border border-border/80 bg-background/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {card.name} <span className="text-muted-foreground">{card.version}</span>
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
      </div>
    );
  }
  return null;
}

export function ToolSteps({ steps }: { steps: AgentStep[] }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {steps.map((step) => (
        <li key={`${step.tool}-${step.label}`} className="flex gap-2 text-xs">
          {step.status === "done" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          )}
          <span>
            <span className="font-medium text-foreground">{step.label}</span>
            {step.detail ? (
              <span className="block font-mono text-[11px] text-muted-foreground">{step.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TemplatesCard({
  card,
}: {
  card: Extract<AgentCard, { kind: "templates" }>;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-background/50 p-3">
      {card.imported.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {card.imported.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <span className="font-medium">{item.title}</span>
              {item.type ? (
                <span className="ml-2 text-xs text-muted-foreground">{item.type}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No templates imported.</p>
      )}
      {card.errors?.length ? (
        <p className="mt-2 text-xs text-destructive">{card.errors.join(" ")}</p>
      ) : null}
    </div>
  );
}

function DesignCard({ card }: { card: Extract<AgentCard, { kind: "design" }> }) {
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{card.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Layout: {card.sectionRoles.join(" → ") || "sections"}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Widgets: {card.widgetsUsed.join(", ") || "none"}
          </p>
          {card.emailHtml ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<a href={`/api/design/${card.designId}?format=email`} />}
            >
              <Download />
              Email HTML
            </Button>
          ) : null}
          {card.generatedRoles?.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Generated missing widgets: {card.generatedRoles.join(", ")}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {card.imported
              ? card.pageUrl
                ? "Published from the widgets detected on this site."
                : "Imported to Elementor Saved Templates."
              : "Download JSON and import in Elementor."}
          </p>
          {card.pageUrl ? (
            <a
              href={card.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-primary underline-offset-2 hover:underline"
            >
              Open live page
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button size="sm" nativeButton={false} render={<a href={`/api/design/${card.designId}`} />}>
            <Download />
            JSON
          </Button>
          {card.emailHtml ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<a href={`/api/design/${card.designId}?format=email`} />}
            >
              <Download />
              Email HTML
            </Button>
          ) : null}
          {card.generatedRoles?.length ? (
            <Button size="sm" nativeButton={false} render={<a href="/api/generated-plugin" />}>
              <Download />
              Widgets zip
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HelperCard() {
  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/8 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">One-time WordPress helper</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Application passwords can only talk to the REST API. Upload this zip once, activate it,
            then use <span className="font-medium text-foreground">Select plugin folder on this PC</span> for
            your real plugin. The helper is not that plugin.
          </p>
        </div>
        <Button size="sm" nativeButton={false} render={<a href="/api/bridge" />}>
          <Download />
          Zip
        </Button>
      </div>
    </div>
  );
}

function DeployCard({ job }: { job: DeployJob }) {
  const ok = job.status === "success";
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-background/50 p-3">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="size-4 text-emerald-400" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
        <p className="font-medium">
          {ok ? (job.remoteAction === "updated" ? "Updated on site" : "Installed on site") : "Push failed"}
        </p>
        <Badge variant={ok ? "secondary" : "destructive"}>{job.pluginVersion || "—"}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{job.message}</p>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginRecord }) {
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-background/50 p-3">
      <div className="flex items-center gap-2">
        <Plug className="size-4 text-primary" />
        <p className="font-medium">{plugin.name}</p>
        <Badge variant="secondary">{plugin.version}</Badge>
      </div>
      <p className="mt-2 font-mono text-[11px] break-all text-muted-foreground">{plugin.path}</p>
    </div>
  );
}

function SiteCard({ site }: { site: PublicSite }) {
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-background/50 p-3">
      <div className="flex items-center gap-2">
        <Globe className="size-4 text-primary" />
        <p className="font-medium">{site.label}</p>
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">{site.url}</p>
    </div>
  );
}

export function AgentText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function PressMark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <svg viewBox="0 0 32 32" className="size-full" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#2A221C" />
        <circle cx="16" cy="16" r="7" fill="currentColor" />
        <rect x="14.5" y="8" width="3" height="16" rx="1" fill="#2A221C" />
      </svg>
    </span>
  );
}

export { LoaderCircle };
