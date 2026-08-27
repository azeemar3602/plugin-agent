import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gateEnabled, safeNextPath } from "@/lib/gate";

export const metadata: Metadata = {
  title: "Sign in · Plugin Agent",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(rawNext);
  const failed = Boolean(params.error);

  return (
    <main className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-lg">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-card-foreground">
          Plugin Agent
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {gateEnabled()
            ? "This instance is password protected."
            : "No password is set on this instance — you can continue."}
        </p>

        <form action="/api/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required={gateEnabled()}
            />
          </div>
          {failed ? (
            <p className="text-sm text-destructive" role="alert">
              Wrong password. Try again.
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
