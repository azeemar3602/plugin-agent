export default function HandoffDownloadPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="font-heading text-2xl tracking-tight">Plugin Agent handoff</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Click the button to save <span className="font-mono text-foreground">Plugin_Agent_HANDOFF.md</span>{" "}
        to this computer&apos;s Downloads folder. Give that file to Claude.
      </p>
      <a
        href="/api/handoff"
        download="Plugin_Agent_HANDOFF.md"
        className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        Download HANDOFF.md
      </a>
    </main>
  );
}
