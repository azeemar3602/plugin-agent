"use client";

import { useEffect, useRef, useState } from "react";
import { FolderUp, LoaderCircle, RefreshCw, SendHorizontal } from "lucide-react";

import { AgentText, MessageCard, PressMark, ToolSteps } from "@/components/message-cards";
import { buttonVariants } from "@/components/ui/button";
import type { PluginRecord, PublicStore } from "@/lib/types";
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

export function AgentApp() {
  const [store, setStore] = useState<PublicStore>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  useEffect(() => {
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
  const pushed = store.jobs.some((job) => job.status === "success");

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

  async function uploadPluginFiles(fileList: FileList) {
    const files = [...fileList];
    if (files.length === 0 || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const body = new FormData();
      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
        body.set("file", files[0]);
      } else {
        for (const file of files) {
          body.append("files", file);
          body.append("relpaths", file.webkitRelativePath || file.name);
        }
      }
      const response = await fetch("/api/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setStore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
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
            {plugin && site
              ? `${plugin.name} → ${site.label}`
              : "Select your plugin folder on this PC — a C:\\ path cannot be opened from here"}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
          {loading ? (
            <p className="text-sm text-muted-foreground">Starting agent…</p>
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
        <div className="mx-auto max-w-2xl pb-3">
          {!pushed ? (
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
              Plugin Agent Helper is only the installer. Your plugin from{" "}
              <span className="font-mono">Downloads\Plug</span> is not on WordPress until you select
              that folder here (or upload a zip of it).
            </p>
          ) : null}
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-primary/50 bg-primary/8 px-4 py-4 text-center hover:bg-primary/12">
            <FolderUp className="size-6 text-primary" />
            <span className="text-sm font-medium">Select plugin folder on this PC</span>
            <span className="text-xs text-muted-foreground">
              Pick the folder with the main .php file. I will upload it and push it to WordPress.
            </span>
            <input
              type="file"
              className="sr-only"
              disabled={sending}
              multiple
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(event) => {
                const list = event.target.files;
                event.target.value = "";
                if (list && list.length > 0) void uploadPluginFiles(list);
              }}
            />
          </label>
        </div>
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
            autoFocus
            disabled={sending}
            placeholder="Or type a message — use the folder button for the plugin"
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-input/30 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <label
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "h-11 cursor-pointer px-3",
            )}
          >
            Zip
            <input
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              disabled={sending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  const list = new DataTransfer();
                  list.items.add(file);
                  void uploadPluginFiles(list.files);
                }
              }}
            />
          </label>
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
