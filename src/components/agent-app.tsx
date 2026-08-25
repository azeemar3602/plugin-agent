"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, SendHorizontal } from "lucide-react";

import { AgentText, MessageCard, PressMark, ToolSteps } from "@/components/message-cards";
import { buttonVariants } from "@/components/ui/button";
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
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const plugin =
    store.plugins.find((item) => item.id === store.lastPluginId) ?? store.plugins[0];

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || sending) return;
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
              : "I'll ask for username, app password, then the plugin folder"}
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
        <div className="mx-auto flex max-w-2xl flex-wrap gap-2 pb-3">
          <Chip label="Connect WordPress" onClick={() => sendMessage("connect wordpress")} />
          <Chip label="Do update" onClick={() => sendMessage("do update")} />
          <Chip label="How you work" onClick={() => sendMessage("help")} />
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
            placeholder="Type here, then press Enter or Send"
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

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      {label}
    </button>
  );
}
