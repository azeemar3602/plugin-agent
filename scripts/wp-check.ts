/**
 * Read-only probe of the connected WordPress site.
 *   WP_URL=... WP_USER=... WP_APP_PASSWORD="..." npx tsx scripts/wp-check.ts
 * Credentials come from the environment — never hardcode them here.
 */
import { listElementorWidgets, listPlugins, probeSite } from "../src/lib/wordpress";
import type { Site } from "../src/lib/types";

const site: Site = {
  id: "ff47a2b6-8172-4188-adf0-423e18bb3253",
  url: process.env.WP_URL ?? "",
  username: process.env.WP_USER ?? "",
  password: process.env.WP_APP_PASSWORD ?? "",
  label: "wp.azbuilds.xyz",
  status: "unknown",
};

async function main() {
  if (!site.url || !site.username || !site.password) {
    console.error("set WP_URL, WP_USER and WP_APP_PASSWORD");
    process.exit(1);
  }

  const probe = await probeSite(site);
  console.log("probe:", JSON.stringify({
    status: probe.status,
    elementor: probe.elementor,
    templates: probe.templates?.length,
    error: probe.error,
  }, null, 2));

  if (probe.status === "auth-failed" || probe.status === "not-wordpress") process.exit(1);

  const plugins = await listPlugins(site);
  console.log(`\nplugins (${plugins.length}):`);
  for (const p of plugins) console.log(`  ${p.status.padEnd(8)} ${p.name} ${p.version} [${p.file}]`);

  const widgets = await listElementorWidgets(site);
  console.log(`\nelementor widgets (${widgets.length}):`);
  const custom = widgets.filter((w) => w.custom);
  const core = widgets.filter((w) => !w.custom);
  console.log(`  core (${core.length}): ${core.map((w) => w.type).join(", ")}`);
  console.log(`\n  addon (${custom.length}): ${custom.map((w) => w.type).join(", ")}`);

  const fs = await import("node:fs/promises");
  await fs.writeFile("/tmp/convert/wp-widgets.json", JSON.stringify({ plugins, widgets }, null, 2));
  console.log("\nsaved /tmp/convert/wp-widgets.json");

}

main().catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
