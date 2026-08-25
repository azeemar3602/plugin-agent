"use client";

import { useEffect, useRef, useState } from "react";
import { FolderUp, LoaderCircle, RefreshCw, SendHorizontal } from "lucide-react";

import { AgentText, MessageCard, PressMark, ToolSteps } from "@/components/message-cards";
import { buttonVariants } from "@/components/ui/button";
import type { PluginRecord, PublicStore } from "@/lib/types";
import type { ProbeResult, RemotePlugin } from "@/lib/wordpress";
import { cn } from "@/lib/utils";

const EMPTY: PublicStore = {
  sites: [],
  plugins: [],
  jobs: [],
  messages: [],
};

function pickLivePlugin(store: PublicStore): PluginRecord | undefined {
  const byId = store.plugins.find((item) => item.id === store.lastPluginId);
  if (byId && !byId.path.includes("/examples/")) return byId;
  return undefined;
}

function bindDirectoryInput(el: HTMLInputElement | null) {
  if (!el) return;
  el.setAttribute("webkitdirectory", "true");
  el.setAttribute("directory", "true");
  el.multiple = true;
}

export function AgentApp() {
  const [store, setStore] = useState<PublicStore>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remotePlugins, setRemotePlugins] = useState<RemotePlugin[]>([]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  async function loadRemote() {
    try {
      const response = await fetch("/api/remote");
      const data = (await response.json()) as {
        probe?: ProbeResult;
        plugins?: RemotePlugin[];
      };
      if (data.probe) setProbe(data.probe);
      if (data.plugins) setRemotePlugins(data.plugins);
    } catch {
      /* shown from chat if needed */
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("ok");
    const formError = params.get("error");
    if (ok) setNotice("Upload reached the agent. Check the plugin list below — it should appear on WordPress if the push succeeded.");
    if (formError) setError(formError);
    if (ok || formError) window.history.replaceState({}, "", "/");

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/state");
        const data = (await response.json()) as PublicStore;
        if (!cancelled) setStore(data);
      } catch {
        if (!cancelled) setError("Could not reach the agent.");
      } finally {
        if (!cancelled) setLoading(false);
      }
      await loadRemote();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [store.messages.length, sending]);

  const site = store.sites.find((item) => item.id === store.lastSiteId) ?? store.sites[0];
  const plugin = pickLivePlugin(store);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || busy.current) return;
    busy.current = true;
    if (inputRef.current) inputRef.current.value = "";
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
      if (!response.ok) throw new Error(data.error || "The agent could not handle that.");
      setStore(data.store);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      busy.current = false;
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
        <PressMark className="text-primary size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg leading-none tracking-tight">Plugin Agent</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {site ? `Installing onto ${site.label}` : "WordPress plugin installer"}
          </p>
        </div>
        <button
          type="button"
          disabled={sending || !plugin}
          onClick={() => void sendMessage("do update")}
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          {sending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Do update
        </button>
      </header>

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
          <section className="rounded-2xl border border-border/80 bg-background/60 p-4">
            <p className="text-sm font-medium">Plugins currently on the WordPress site</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {probe?.status === "connected"
                ? `Helper is connected (WordPress ${probe.wordpressVersion || "ok"}). Plugin Agent Helper is the installer only.`
                : probe?.error || "Checking the site…"}
            </p>
            {remotePlugins.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {remotePlugins.map((item) => (
                  <li key={item.file} className="flex justify-between gap-3">
                    <span>
                      {item.name}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {item.version}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{item.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No plugin list yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-dashed border-primary/50 bg-primary/8 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FolderUp className="size-4 text-primary" />
              Install your plugin (zip)
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              On your PC, zip the folder <span className="font-mono text-foreground">Downloads\Plug</span>{" "}
              (the one with the main .php file). Then choose that zip and click Install. A typed C:\
              path cannot be read from this server.
            </p>
            <form
              action="/api/upload"
              method="post"
              encType="multipart/form-data"
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input
                type="file"
                name="file"
                required
                accept=".zip,application/zip"
                className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              />
              <button type="submit" className={cn(buttonVariants({ size: "lg" }), "h-11 px-4")}>
                Install on WordPress
              </button>
            </form>
            <form
              action="/api/upload"
              method="post"
              encType="multipart/form-data"
              className="mt-4 border-t border-border/60 pt-4"
            >
              <p className="text-xs text-muted-foreground">Or pick the plugin folder itself:</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={bindDirectoryInput}
                  type="file"
                  name="files"
                  className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                />
                <button
                  type="submit"
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-4")}
                >
                  Install folder
                </button>
              </div>
            </form>
          </section>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading chat…</p>
          ) : (
            store.messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  "max-w-[min(92%,42rem)] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap",
                  message.role === "user" ? "chat-user ml-auto" : "chat-agent mr-auto",
                )}
              >
                {message.role === "agent" ? (
                  <p className="mb-2 font-heading text-[11px] tracking-[0.16em] text-primary uppercase">
                    Agent
                  </p>
                ) : null}
                <AgentText text={message.text} />
                {message.steps ? <ToolSteps steps={message.steps} /> : null}
                {message.card ? <MessageCard card={message.card} /> : null}
              </article>
            ))
          )}
          {sending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Working — reading files and talking to WordPress…
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background/95 px-4 py-4">
        <form
          className="mx-auto flex max-w-2xl items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const field = form.elements.namedItem("message");
            const value = field instanceof HTMLInputElement ? field.value : "";
            void sendMessage(value);
          }}
        >
          <input
            ref={inputRef}
            name="message"
            type="text"
            autoComplete="off"
            disabled={sending}
            placeholder="Message the agent"
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-input/30 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending}
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-4")}
          >
            {sending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
