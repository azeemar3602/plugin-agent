"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileText, FolderUp, LoaderCircle, RefreshCw, SendHorizontal } from "lucide-react";

import { AgentText, MessageCard, PressMark, ToolSteps } from "@/components/message-cards";
import { buttonVariants } from "@/components/ui/button";
import type { PluginRecord, PublicStore } from "@/lib/types";
import type { ProbeResult, RemotePlugin, RemoteTemplate } from "@/lib/wordpress";
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

function lastDesignCard(store: PublicStore) {
  const messages = store.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const card = messages[index]?.card;
    if (card?.kind === "design") return card;
  }
  return undefined;
}

function isDesignUpload(file: File): boolean {
  return /\.(pdf|jpe?g|png|webp|json)$/i.test(file.name) || file.type === "application/pdf";
}

function fileNames(list: FileList | File[]): string {
  return [...list].map((file) => file.name).join(", ");
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
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remotePlugins, setRemotePlugins] = useState<RemotePlugin[]>([]);
  const [remoteTemplates, setRemoteTemplates] = useState<RemoteTemplate[]>([]);
  const [remoteWidgets, setRemoteWidgets] = useState<Array<{ type: string; title: string; custom?: boolean }>>([]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [windowsInstaller, setWindowsInstaller] = useState(false);
  const [workingOn, setWorkingOn] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  async function loadRemote() {
    try {
      const response = await fetch("/api/remote");
      const data = (await response.json()) as {
        probe?: ProbeResult;
        plugins?: RemotePlugin[];
        templates?: RemoteTemplate[];
        widgets?: Array<{ type: string; title: string; custom?: boolean }>;
      };
      if (data.probe) setProbe(data.probe);
      if (data.plugins) setRemotePlugins(data.plugins);
      setRemoteTemplates(data.templates ?? data.probe?.templates ?? []);
      setRemoteWidgets(data.widgets ?? []);
    } catch {
      /* shown from chat if needed */
    }
  }

  async function uploadFileList(list: FileList | File[]) {
    const files = [...list];
    if (files.length === 0 || busy.current) return;
    busy.current = true;
    setSending(true);
    setLoading(false);
    setError(null);
    setNotice(null);
    const names = fileNames(files);
    const pdf = files.some((file) => /\.pdf$/i.test(file.name) || file.type === "application/pdf");
    setWorkingOn(names);
    setNotice(
      pdf
        ? `Reading ${names}. Rasterizing the PDF, then publishing to WordPress — leave this tab open.`
        : `Reading ${names}. Converting and publishing to WordPress — leave this tab open.`,
    );
    try {
      const body = new FormData();
      if (files.length === 1 && !files[0].webkitRelativePath) {
        body.set("file", files[0]);
      } else {
        for (const file of files) {
          body.append("files", file);
          body.append("relpaths", file.webkitRelativePath || file.name);
        }
      }
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
      const data = (await response.json()) as PublicStore & { error?: string };
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      setStore(data);
      const design = lastDesignCard(data);
      setNotice(
        design?.pageUrl
          ? `Published ${design.title}. Open the live page from the card below.`
          : "Done. Check Plugins, Elementor templates, or download the generated JSON.",
      );
      await loadRemote();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setNotice(null);
    } finally {
      busy.current = false;
      setSending(false);
      setWorkingOn(null);
    }
  }

  const uploadFileListRef = useRef(uploadFileList);
  uploadFileListRef.current = uploadFileList;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("ok");
    const formError = params.get("error");
    if (ok) setNotice("Upload reached the agent. Check Plugins and Elementor templates below.");
    if (formError) setError(formError);
    if (ok || formError) window.history.replaceState({}, "", "/");

    fetch("/api/installer", { method: "HEAD" })
      .then((response) => setWindowsInstaller(response.ok))
      .catch(() => setWindowsInstaller(false));

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/state", {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`state ${response.status}`);
        const data = (await response.json()) as PublicStore;
        if (!cancelled) setStore(data);
      } catch {
        if (!cancelled) setError("Could not load chat history. You can still drop a JPEG or PDF.");
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
    function onDragOver(event: DragEvent) {
      event.preventDefault();
      if (event.dataTransfer?.types?.includes("Files")) setDragging(true);
    }
    function onDragLeave(event: DragEvent) {
      if (!event.relatedTarget) setDragging(false);
    }
    function onDrop(event: DragEvent) {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer?.files?.length) void uploadFileListRef.current(event.dataTransfer.files);
    }
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [store.messages.length, sending]);

  const site = store.sites.find((item) => item.id === store.lastSiteId) ?? store.sites[0];
  const plugin = pickLivePlugin(store);
  const lastDesign = lastDesignCard(store);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input[type="file"]');
    if (input instanceof HTMLInputElement && input.files?.length) {
      await uploadFileList(input.files);
    }
  }

  async function switchSite(id: string) {
    if (!id || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not switch site.");
      setStore(data);
      setNotice(`Now installing onto ${data.sites?.find((item: { id: string }) => item.id === id)?.label || "that site"}.`);
      await loadRemote();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch site.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

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
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <p className="rounded-2xl border border-dashed border-primary px-6 py-4 text-sm font-medium">
            Drop a JPEG, PNG, or PDF of the page design — or a plugin zip / Elementor JSON
          </p>
        </div>
      ) : null}

      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
        <PressMark className="text-primary size-8 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-heading text-lg leading-none tracking-tight">Plugin Agent</p>
          {store.sites.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              <select
                value={site?.id ?? ""}
                disabled={sending}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__add__") {
                    event.target.value = site?.id ?? "";
                    void sendMessage("add site");
                    return;
                  }
                  void switchSite(value);
                }}
                className="h-7 max-w-[min(100%,16rem)] truncate rounded-md border border-input bg-input/30 px-2 text-xs outline-none focus-visible:border-ring"
              >
                {store.sites.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
                <option value="__add__">Add site…</option>
              </select>
            </div>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              WordPress plugin and Elementor installer
            </p>
          )}
        </div>
        {windowsInstaller ? (
          <a
            href="/api/installer"
            className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
          >
            <Download />
            <span className="hidden sm:inline">Windows installer</span>
            <span className="sm:hidden">EXE</span>
          </a>
        ) : null}
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
            <p className="text-sm font-medium">On the WordPress site</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {probe?.status === "connected"
                ? `Helper ${probe.helperVersion || ""} · WordPress ${probe.wordpressVersion || "ok"} · Elementor ${probe.elementor ? probe.elementorVersion || "active" : "not installed"}`
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
            {probe?.elementor === false ? (
              <p className="mt-3 text-xs text-amber-200">
                Elementor is not active, so template JSON cannot be imported yet. Install Elementor,
                then drop templates again.
              </p>
            ) : null}
            {lastDesign ? (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-muted-foreground">Last converted page</p>
                <p className="mt-1 text-sm font-medium">{lastDesign.title}</p>
                {lastDesign.pageUrl ? (
                  <a
                    href={lastDesign.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {lastDesign.pageUrl}
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    JSON is ready — import it in Elementor Saved Templates.
                  </p>
                )}
              </div>
            ) : null}
            {remoteWidgets.length > 0 ? (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Detected {remoteWidgets.length} Elementor widgets
                  {remoteWidgets.some((item) => item.custom)
                    ? ` · ${remoteWidgets.filter((item) => item.custom).length} from addons (designs use these first)`
                    : ""}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {remoteWidgets
                    .filter((item) => item.custom)
                    .map((item) => (
                      <li
                        key={item.type}
                        className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                        title={item.type}
                      >
                        {item.title}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            {remoteTemplates.length > 0 ? (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Elementor saved templates
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {remoteTemplates.slice(0, 12).map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>{item.title}</span>
                      <span className="text-xs text-muted-foreground">{item.type || "template"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-dashed border-primary/50 bg-primary/8 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FolderUp className="size-4 text-primary" />
              Drag a plugin, templates, JPEG, or PDF
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Drop a plugin zip, Elementor JSON, a JPEG/PNG, or a PDF of the page. Plugin Agent
              rasterizes PDFs, maps sections then columns, and builds Elementor containers. Tablet
              keeps 2-up where needed; mobile stacks to one column. If a needed widget is missing, it
              generates a real Elementor widget plugin and uses that — not an HTML block.
            </p>
            <form
              action="/api/upload"
              method="post"
              encType="multipart/form-data"
              onSubmit={(event) => void submitUpload(event)}
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input
                type="file"
                name="files"
                multiple
                accept=".zip,.json,.php,.jpg,.jpeg,.png,.webp,.pdf,application/zip,application/json,image/jpeg,image/png,application/pdf"
                onChange={(event) => {
                  const files = event.currentTarget.files;
                  if (!files?.length) return;
                  if ([...files].some((file) => isDesignUpload(file))) {
                    void uploadFileList(files);
                  }
                }}
                className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
              />
              <button
                type="submit"
                disabled={sending}
                className={cn(buttonVariants({ size: "lg" }), "h-11 px-4")}
              >
                Install on WordPress
              </button>
            </form>
            <form
              action="/api/upload"
              method="post"
              encType="multipart/form-data"
              onSubmit={(event) => {
                event.preventDefault();
                const input = pdfInputRef.current;
                if (input?.files?.length) void uploadFileList(input.files);
                else input?.click();
              }}
              className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <input
                ref={pdfInputRef}
                id="plugin-agent-pdf"
                type="file"
                name="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  if (event.currentTarget.files?.length) {
                    void uploadFileList(event.currentTarget.files);
                  }
                }}
                className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
              />
              <button
                type="submit"
                disabled={sending}
                className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-4")}
              >
                <FileText />
                Convert PDF
              </button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              Pick the PDF here — conversion starts as soon as you choose the file. Multi-page PDFs
              are stacked into one page, then converted like a JPEG. The filename stays visible;
              wait for the green notice (about a minute).
            </p>
            <form
              action="/api/upload"
              method="post"
              encType="multipart/form-data"
              onSubmit={(event) => void submitUpload(event)}
              className="mt-4 border-t border-border/60 pt-4"
            >
              <p className="text-xs text-muted-foreground">Or pick a plugin folder:</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={bindDirectoryInput}
                  type="file"
                  name="files"
                  className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-4")}
                >
                  Install folder
                </button>
              </div>
            </form>
          </section>

          {workingOn ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Converting {workingOn} — rasterizing, mapping widgets, and publishing…
            </p>
          ) : null}
          {loading && store.messages.length === 0 ? (
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
              {workingOn
                ? `Working on ${workingOn} — leave this tab open.`
                : "Working — reading files and talking to WordPress…"}
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
            placeholder="Ask about the last page, or drop a JPEG or PDF"
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
