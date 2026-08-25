"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderPlus,
  LoaderCircle,
  Menu,
  Plug,
  RefreshCw,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { MessageCard, PressMark, QuickChip, StatusBadge } from "@/components/message-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { PublicStore } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: PublicStore = {
  sites: [],
  plugins: [],
  jobs: [],
  messages: [],
};

export function AgentApp() {
  const [store, setStore] = useState<PublicStore>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"chat" | "sites" | "log">("chat");
  const [siteForm, setSiteForm] = useState({
    url: "",
    username: "",
    applicationPassword: "",
  });
  const [pluginPath, setPluginPath] = useState("examples/hello-presspush");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/state");
        const data = (await response.json()) as PublicStore;
        if (!cancelled) setStore(data);
      } catch {
        if (!cancelled) setError("Could not load saved sites and plugins.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [store.messages.length, sending]);

  const lastSite = store.sites.find((site) => site.id === store.lastSiteId) ?? store.sites[0];
  const lastPlugin =
    store.plugins.find((plugin) => plugin.id === store.lastPluginId) ?? store.plugins[0];
  const jobsNewest = useMemo(() => [...store.jobs].reverse().slice(0, 8), [store.jobs]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setDraft("");
    setSending(true);
    setError(null);
    setStore((current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: `local-${Date.now()}`,
          role: "user",
          text: message,
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "The agent could not handle that.");
      }
      setStore(data.store);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  async function saveSite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the site.");
      setStore(data.store);
      setSiteForm({ url: "", username: "", applicationPassword: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the site.");
    }
  }

  async function addPlugin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pluginPath }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read that folder.");
      setStore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that folder.");
    }
  }

  async function pushUpdate() {
    if (!lastSite || !lastPlugin) {
      await sendMessage("update");
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginId: lastPlugin.id,
          siteId: lastSite.id,
          action: "update",
        }),
      });
      const data = await response.json();
      if (data.store) setStore(data.store);
      if (!response.ok) throw new Error(data.error || "Update failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setDeploying(false);
    }
  }

  async function removeSite(id: string) {
    const response = await fetch(`/api/sites?id=${id}`, { method: "DELETE" });
    setStore(await response.json());
  }

  async function removePlugin(id: string) {
    const response = await fetch(`/api/plugins?id=${id}`, { method: "DELETE" });
    setStore(await response.json());
  }

  async function probe(id: string) {
    const response = await fetch(`/api/probe?siteId=${id}`);
    const data = await response.json();
    if (response.ok) setStore(data);
    else setError(data.error || "Probe failed.");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border/80 px-4 py-3 lg:px-6">
        <PressMark className="text-primary size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg leading-none tracking-tight">PressPush</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Local plugin folder → WordPress site
          </p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Button size="sm" variant="outline" render={<a href="/api/bridge" />}>
            <Download />
            Bridge plugin
          </Button>
          <Button size="sm" onClick={pushUpdate} disabled={deploying || sending}>
            {deploying ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Update plugin
          </Button>
        </div>
        <Button
          size="icon"
          variant="outline"
          className="lg:hidden"
          onClick={() =>
            setMobilePanel((panel) => (panel === "chat" ? "sites" : "chat"))
          }
        >
          {mobilePanel === "sites" ? <X /> : <Menu />}
        </Button>
      </header>

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <aside
          className={cn(
            "border-border bg-sidebar/80 overflow-y-auto border-r p-4",
            mobilePanel === "sites" ? "block" : "hidden lg:block",
          )}
        >
          <SectionTitle>WordPress sites</SectionTitle>
          <form className="mt-3 space-y-2" onSubmit={saveSite}>
            <Field label="Site URL">
              <Input
                placeholder="https://mysite.com"
                value={siteForm.url}
                onChange={(event) =>
                  setSiteForm((form) => ({ ...form, url: event.target.value }))
                }
                required
              />
            </Field>
            <Field label="Admin username">
              <Input
                placeholder="admin"
                value={siteForm.username}
                onChange={(event) =>
                  setSiteForm((form) => ({ ...form, username: event.target.value }))
                }
              />
            </Field>
            <Field label="Application password">
              <Input
                type="password"
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                value={siteForm.applicationPassword}
                onChange={(event) =>
                  setSiteForm((form) => ({
                    ...form,
                    applicationPassword: event.target.value,
                  }))
                }
              />
            </Field>
            <Button type="submit" className="w-full" size="sm">
              Save site
            </Button>
          </form>

          <ul className="mt-4 space-y-2">
            {store.sites.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                No sites yet. Paste the domain, then an application password from Users →
                Profile.
              </li>
            ) : (
              store.sites.map((site) => (
                <li key={site.id} className="rounded-lg border border-border bg-card/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{site.label}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {site.url}
                      </p>
                    </div>
                    <StatusBadge status={site.status} />
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => probe(site.id)}>
                      Check
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => removeSite(site.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <SectionTitle className="mt-8">Local plugins</SectionTitle>
          <form className="mt-3 space-y-2" onSubmit={addPlugin}>
            <Field label="Plugin folder path">
              <Input
                placeholder="/path/to/my-plugin"
                value={pluginPath}
                onChange={(event) => setPluginPath(event.target.value)}
              />
            </Field>
            <Button type="submit" variant="outline" className="w-full" size="sm">
              <FolderPlus />
              Track folder
            </Button>
          </form>

          <ul className="mt-4 space-y-2">
            {store.plugins.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                Track the plugin you edit in Cursor. After each save, hit Update.
              </li>
            ) : (
              store.plugins.map((plugin) => (
                <li key={plugin.id} className="rounded-lg border border-border bg-card/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Plug className="size-3.5 text-primary" />
                        {plugin.name}
                      </p>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {plugin.path}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        v{plugin.version} · {plugin.fileCount} files
                      </p>
                    </div>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removePlugin(plugin.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main
          className={cn(
            "flex min-h-0 flex-col",
            mobilePanel === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading agent…</p>
              ) : (
                store.messages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap",
                      message.role === "user"
                        ? "chat-user ml-auto"
                        : "chat-agent mr-auto",
                    )}
                  >
                    {message.role === "agent" ? (
                      <p className="mb-2 font-heading text-[11px] tracking-wide text-primary uppercase">
                        PressPush
                      </p>
                    ) : null}
                    {message.text}
                    {message.card ? <MessageCard card={message.card} /> : null}
                  </article>
                ))
              )}
              {sending ? (
                <p className="text-sm text-muted-foreground">Reading files and talking to WordPress…</p>
              ) : null}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border/80 px-4 py-3">
            <div className="mx-auto flex max-w-2xl flex-wrap gap-2 pb-3">
              <QuickChip
                label="Install sample plugin"
                onClick={() =>
                  sendMessage(
                    lastSite
                      ? `install examples/hello-presspush on ${lastSite.url}`
                      : "install examples/hello-presspush",
                  )
                }
              />
              <QuickChip label="Update" onClick={() => sendMessage("update")} />
              <QuickChip label="Download bridge" onClick={() => sendMessage("download bridge")} />
              <QuickChip label="How it works" onClick={() => sendMessage("help")} />
            </div>
            <form
              className="mx-auto flex max-w-2xl items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(draft);
              }}
            >
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="install /path/to/plugin on https://yoursite.com"
                className="min-h-12 max-h-32 flex-1 resize-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(draft);
                  }
                }}
              />
              <Button type="submit" size="icon-lg" disabled={sending || !draft.trim()}>
                <SendHorizontal />
              </Button>
            </form>
            <p className="mx-auto mt-2 max-w-2xl text-xs text-muted-foreground">
              After Cursor or Claude saves the plugin, say <span className="text-foreground">update</span>.
              I zip the folder on disk and overwrite it on the site.
            </p>
          </div>
        </main>

        <aside className="border-border hidden overflow-y-auto border-l p-4 lg:block">
          <SectionTitle>Push log</SectionTitle>
          {lastPlugin && lastSite ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Next update sends <span className="text-foreground">{lastPlugin.name}</span> to{" "}
              <span className="text-foreground">{lastSite.label}</span>.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a site and a plugin folder to enable one-click updates.
            </p>
          )}
          <ul className="mt-4 space-y-2">
            {jobsNewest.length === 0 ? (
              <li className="text-sm text-muted-foreground">No deploys yet.</li>
            ) : (
              jobsNewest.map((job) => (
                <li key={job.id} className="rounded-lg border border-border bg-card/60 p-3">
                  <p className="text-sm font-medium">
                    {job.status === "success" ? "Pushed" : "Failed"} {job.pluginName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.pluginVersion}
                    {job.siteUrl ? ` · ${job.siteUrl.replace(/^https?:\/\//, "")}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{job.message}</p>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-heading text-[11px] tracking-[0.18em] text-primary uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </label>
  );
}
