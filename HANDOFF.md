# Plugin Agent — complete handoff

Read this file before changing anything. This is the project brief, the conversion pipeline, the WordPress test site, the widget rules, and the open work. Do not invent a new architecture.

**Product name:** Plugin Agent  
**Branch:** `main` (keep working here unless asked for a separate branch)  
**Stack:** Next.js 16.3.3, React 19, TypeScript, Tailwind 4, shadcn/ui  
**Dev server:** `http://127.0.0.1:43177` (bind `0.0.0.0`, never tell the user to open `http://0.0.0.0`)  
**Chat:** scripted slot-filling agent in `src/lib/agent.ts` — **not** an LLM  
**Auth / DB:** none. Credentials live in gitignored `data/store.json`

---

## What it is

A chat + drop zone that:

1. Installs WordPress plugins (zip / folder / single PHP)
2. Imports Elementor JSON templates
3. Converts a **JPEG / PNG / PDF mockup** into Elementor JSON, imports it, and **publishes a live page** on the connected WordPress site

Conversion is in-app. Do **not** sidecar Python/JSON to WordPress except for PDF rasterization. Do **not** use the Elementor HTML widget as a layout substitute.

---

## How to run

```bash
npm install
pip3 install -r requirements.txt   # pillow + pypdfium2, required for PDF
npm run dev                        # 0.0.0.0:43177
```

Open **http://127.0.0.1:43177**.

Windows desktop EXE (no Node on the laptop):

```bash
npm run desktop:win   # writes release/PluginAgentSetup.exe
```

Passwords on Windows live under `%APPDATA%\plugin-agent\data`.

---

## Tests (run before considering convert work done)

```bash
npx next typegen     # fresh clone only: tsc needs the generated LayoutProps/PageProps
npx tsc --noEmit
npx tsx scripts/test-widget-convert.ts
npx tsx scripts/test-agent.ts
```

Landing tests expect title **Never Miss Another Client Call**, copy like Book a Demo / Front desk slammed / Never miss a call / Handle after-hours / Intelligent call routing / Increase Revenue / HUNDREDS OF / Watch Axion Highlight Video / Jeff Falkners / 90 days / See Axion In Action / Always Answers., an `icon-list` containing `avimark`, **no** `html` widget, **no** `arcadia_axion_header` / `footer` / `blog_hero` / `blog_faq` on the landing.

Homepage filename `Axion_Industry Page (Veterinarian) V4_NEW CONTENT COPY.pdf` must classify as **landing**, not the blog article.

---

## Hard rules (user-confirmed)

- Pipeline stays in-app: drop → `src/lib/ingest.ts` (`ingestUpload`) → `listElementorWidgets` + `buildDesignTemplate` → import template + `createElementorPage`.
- Prefer **core** Elementor types: `heading`, `text-editor`, `button`, `image`, `icon`, `icon-list`, `accordion`, plus **`icon-box`** for title+subtitle checks.
- **No HTML widget as a layout substitute.**
- Skip Axion `arcadia_axion_header` / `arcadia_axion_footer` on `wp-page` (they blank the page).
- Landing FAQ uses core `accordion`. Article may still use `arcadia_axion_blog_faq`.
- Custom SVG data-URI icons **do not render** in Icon / Icon List / Button. Use Font Awesome from `src/lib/icons.ts` (`FA.*`, `library: "fa-solid"`). `svgIcon()` / data-URIs are for `<img>` in Text Editor only (e.g. hours row).
- Desktop rows: `flex_wrap: nowrap` so percent columns stay one row.
- On azbuilds, `missingLayoutRoles` is `[]` → **do not generate** Plugin Agent Widgets. `ensureGeneratedWidgets` already **skips generation when page kind is landing**.
- Do **not** switch `lastSiteId` to bralim.org (no Elementor). Keep **wp.azbuilds.xyz**.
- Do **not** overwrite article page **id 23**.
- Do **not** commit `data/store.json` (application passwords).
- Do **not** deploy to a public host with `PLUGIN_AGENT_PASSWORD` unset — the app holds a
  WordPress application password that can publish and overwrite pages.
- Do **not** create pull requests unless the user explicitly asks.
- `widget-repair.ts`: rewrite Text Editor → Heading / Icon List when that is what the block is. **Do not** rewrite the hours row (`<img>` + “Mon – Fri…”) into Icon Box.

---

## WordPress test site

| | |
|---|---|
| URL | https://wp.azbuilds.xyz |
| User | `admin@azbuilds.xyz` |
| Auth | Application password in gitignored `data/store.json` — never commit, never paste into git |
| Site id | `ff47a2b6-8172-4188-adf0-423e18bb3253` — **this must stay `lastSiteId`** |
| WP | 7.1, Hello Elementor, Elementor 4.2.3 |
| Axion | `arcadia-elementor-addons` 1.1.19 |
| Helper | Plugin Agent Helper (`bridge/plugin-agent-bridge`) |

Second stored site **bralim.org** (`f6a4271a-8d23-4a5a-94c4-e1ef1c0a4732`) has no Elementor. Ignore it for design converts.

Helper REST is used to list widgets, import templates, create pages, upload media. If helper is missing, template import fails.

---

## Two designs (do not mix them up)

### 1. Blog article — do not overwrite page 23

- Live: https://wp.azbuilds.xyz/how-can-vets-reduce-no-shows-at-their-clinic-effectively/
- Page id **23**
- JPEG ~2160×6185, filenames like `vets-reduce-no-shows.jpg` / `vets-reduce` / `clinic-effectively` / `no-show` / `article` / `blog-post`
- Title comes from Axion blog-hero defaults: **How Can Vets Reduce No-Shows…**
- May use Axion blog widgets (hero, takeaways, article CTA, blog FAQ, related posts)

### 2. Veterinarian industry landing / homepage

- Live: https://wp.azbuilds.xyz/never-miss-another-client-call/
- Title **must** be **Never Miss Another Client Call** (`landingPageTitle()`)
- JPEG ~1441×5519 and PDF ~1440×5518, same mockup
- Filenames: `Axion_Industry Page (Veterinarian) V4_NEW CONTENT COPY.pdf`, `industry-page`, `veterinar`, `never-miss`, `client-call`, `home-page`, `homepage`, `landing`, `index`
- Widgets used on last convert: `text-editor, heading, icon-list, button, icon-box, image, icon, accordion`
- Re-dropping this file **updates the same slug** (find page by slug, then `createElementorPage` with existing id). That is OK. Do **not** point that slug at the article.

User may also have an older generated JSON locally (`1787772823523-f05438.json`). That is **not** a gold-standard Elementor export. Prefer converting through Plugin Agent.

---

## Conversion pipeline (keep this order)

```
UI drop / Convert PDF / Choose Files
  → POST /api/upload
  → ingestUpload (src/lib/ingest.ts)
      classify files: design | elementor json | plugin
      if PDF: rasterizePdfToJpeg (Python scripts/pdf_to_jpeg.py)
      analyzeDesignFile (src/lib/design.ts + analyze-image.ts + optional scripts/analyze_design.py)
      ensureGeneratedWidgets  ← skipped for landing
      buildDesignTemplate
          planPageLayout (landing | article | primitive)
          buildElementorDocument (section → column → widget)
          repairElementorDocument (Text Editor → Heading / Icon List)
      cropLandingImages + uploadMediaFile + rewrite image URLs
      importElementorFiles
      findPageIdBySlug + createElementorPage
  → chat card with live URL
```

PDF path:

1. `src/lib/pdf-raster.ts` tries `python3` / `python` / `py`
2. `scripts/pdf_to_jpeg.py` — pypdfium2 + Pillow, scale 1.5, stack pages vertically, cap height 12000
3. Raster is written as `.jpg` so WP media is not a PDF named jpeg
4. Industry PDF filename still routes to landing because classification uses the **original** filename

Without Python + those packages, PDF convert fails. There is **no Node-only pdf.js rasterizer** yet. Tell the user to `pip3 install -r requirements.txt` or export JPEG.

---

## Page classification (easy to break)

`src/lib/layout-plan.ts` — `classifyPageKind` / `looksLikeLanding` / `looksLikeArticle` / `pageTitle`.

**Bug that was already fixed:** `hasDetectedLayout(widgets)` used to force the **article** plan whenever Axion blog widgets existed on the site. Empty analysis + generated widgets still became the blog. Homepage JPEGs published the article URL.

**Current rule:**

1. Landing filename (and not article filename) → landing
2. Article filename (and not landing filename) → article
3. Else compare `landingScore` vs `articleScore`
4. If analysis has no sections and the site has blog widgets → still prefer landing unless article score wins
5. **Never** use `hasDetectedLayout` alone to force article
6. Landing title is always `landingPageTitle()` — never blog-hero defaults

Landing filenames: `home-page|homepage|landing|never-miss|client-call|index|industry-page|veterinar`  
Article filenames: `no-show|article|blog-post|vets-reduce|clinic-effectively`

---

## Landing plan (pixel-perfect is incomplete)

`planLandingPage` in `src/lib/layout-plan.ts` is a **hand-authored** Elementor plan that matches the mockup copy, not a pixel clone. Crops from the JPEG/PDF live in `src/lib/design-crops.ts` and are mapped onto `LANDING_STOCK` URLs in `hostDesignImages`.

Shipped landing content (keep these strings unless the mockup changes):

- Nav: **AXION COMMUNICATIONS**, dropdown chevrons
- Hero: 15-min note in accent blue; device crop from the design
- Trust: people/star icons, **HUNDREDS OF**, logo strip crop + inline icon-list (`otto`, `covetrus`, `avimark`, `pulse`, `ascend`, `impromed`)
- Pain/gain: centered number badges, centered icons/copy; gain 3 navy/gold; **Watch Axion Highlight Video** ghost button
- Proof: Jeff **Falkners** / Vetcor; 312 missed calls / **90 days**
- Compare: Feature | Axion Communications | Others
- Demo: **See Axion In Action** / Book your personalized demo
- FAQ: 7 questions; first is still **What does Axion cost?** (tests assert this)
- CTA: **Be The Clinic That / Always Answers.** + phone

Elementor cannot clone every glow, wave, overlapping badge, circular demo photo, or navy-first FAQ accordion. Next fidelity work should stay on **core widgets + crops**, not HTML.

---

## UI (PDF looked “empty” — already fixed)

`src/components/agent-app.tsx`

- Visible PDF file input next to **Convert PDF** (not `sr-only`)
- Conversion **starts on file choose** (PDF/JPEG/PNG/JSON); filename stays visible
- Green notice + spinner while rasterizing/publishing (~1 minute)
- Chat is **not** gated on infinite `Loading chat…` (`loading && messages.length === 0` only)
- `/api/state` times out at 12s
- **Last converted page** is pinned under the WordPress status box
- Drop overlay and placeholder both say JPEG **or** PDF
- Native `<form action="/api/upload">` fallback if JS fails
- Upload body limit: `experimental.proxyClientMaxBodySize: "50mb"`; route `maxDuration = 300`

If the user says “I dropped a PDF and nothing is there”: they likely used the old hidden picker, or refreshed while convert was still running. Point them at the visible PDF input and the last-page link.

---

## File map

| Path | Role |
|---|---|
| `src/components/agent-app.tsx` | Whole UI |
| `src/lib/agent.ts` | Scripted chat |
| `src/lib/ingest.ts` | Upload → plugin / template / design |
| `src/lib/design.ts` | Analyze + build Elementor JSON |
| `src/lib/layout-plan.ts` | Classify + landing/article/primitive plans |
| `src/lib/elementor-builder.ts` | Flatten plan to section → column → widget |
| `src/lib/elementor-widgets.ts` | Catalog, roles, pickWidget, missingLayoutRoles |
| `src/lib/widget-repair.ts` | Text Editor → Heading / Icon List |
| `src/lib/icons.ts` | Font Awesome + leftover SVG helpers |
| `src/lib/pdf-raster.ts` + `scripts/pdf_to_jpeg.py` | PDF → JPEG |
| `src/lib/design-crops.ts` | Landing JPEG crops (hero / dash / logos) |
| `src/lib/generate-widgets.ts` | Plugin Agent Widgets (skip on landing) |
| `src/proxy.ts` | Password gate (Next 16 proxy, formerly middleware) |
| `scripts/prepare-standalone.mjs` | Makes `.next/standalone` self-contained after a build |
| `scripts/start.mjs` | Production start on `$PORT` via the standalone server |
| `src/lib/gate.ts` | Gate token, cookie name, safe redirect target |
| `src/app/login/page.tsx` + `src/app/api/login/route.ts` | Sign-in form and handler |
| `src/lib/wordpress.ts` | REST: probe, plugins, import, page, media, widgets |
| `src/lib/store.ts` | `data/store.json`, trim to last 80 messages |
| `bridge/plugin-agent-bridge/` | WP helper plugin |
| `scripts/test-widget-convert.ts` | Routing + landing copy + repair tests |
| `scripts/test-agent.ts` | Chat: URL, help mentions PDF, no extra site prompt |

API routes: `/api/upload`, `/api/chat`, `/api/state`, `/api/remote`, `/api/site`, `/api/design/[id]`, `/api/pack`, `/api/installer`, `/api/bridge`, `/api/generated-plugin`, `/api/handoff`, `/api/login`.

---

## Deployment — agent.azbuilds.xyz

Plugin Agent itself runs as a Hostinger **Web App** (Node) on `agent.azbuilds.xyz`, on the
Business Web Hosting plan owned by `alirshadislamicinstitute@gmail.com` — the same plan that
hosts `wp.azbuilds.xyz`. Do not confuse the two:

| Host | What it is |
|---|---|
| `agent.azbuilds.xyz` | the Plugin Agent app (this repo) |
| `wp.azbuilds.xyz` | the WordPress site it publishes pages to — unchanged |

Env vars on the deployment:

| Var | Value |
|---|---|
| `PLUGIN_AGENT_PASSWORD` | shared password for the gate. **Unset = no gate.** Never leave it unset on public hosting. |
| `PLUGIN_AGENT_DATA` | absolute path **outside** the deploy directory, so `store.json`, uploads and generated designs survive a redeploy |

Build and start:

- `npm run build` = `next build` + `scripts/prepare-standalone.mjs`, which copies `.next/static`,
  `public/`, `bridge/`, `scripts/`, `templates/` and `HANDOFF.md` into `.next/standalone` so the
  bundle actually runs from a clean checkout. `next build` alone leaves it without static assets.
- `npm start` = `scripts/start.mjs`, which runs `.next/standalone/server.js` on `PORT` (falls back
  to 43177) and `HOSTNAME` (falls back to `0.0.0.0`), and pins `PLUGIN_AGENT_ROOT` to the checkout
  so `/api/bridge`, `/api/handoff` and `data/` do not resolve inside `.next/standalone`. If the
  standalone bundle is missing it falls back to `next start`.

Do **not** put a fixed `--port` back in `start`: the host assigns the port through `PORT`.
The build pulls Geist / Fraunces from Google Fonts, so the build host needs outbound internet.

### Password gate

`src/proxy.ts` — Next 16 renamed `middleware.ts` to `proxy.ts` — blocks every route except
`/login` and `/api/login` unless the `pa_session` cookie equals
`sha256("plugin-agent-v1:" + PLUGIN_AGENT_PASSWORD)`. API routes get a `401` JSON body, pages
redirect to `/login`.

Two things that look like style but are not:

- Redirects out of `/api/login` are **relative**. An absolute URL built from `request.url`
  resolves to the internal origin behind Hostinger's proxy and bounces a signed-in user to
  `localhost`.
- `?next=` is filtered to same-origin paths (`safeNextPath`), so `//evil.com` cannot be used
  as an open redirect.

With `PLUGIN_AGENT_PASSWORD` unset the gate is a no-op — local dev and the Windows EXE are
unchanged.

---

## Git / process

- Current HEAD should include: landing routing, landing copy, PDF raster, visible Convert PDF + progress
- Commit and push on `main` as you go
- Do not create PRs unless asked
- Do not commit `data/`, `.next/`, `release/`, `pack/`

---

## Open work (likely next)

1. **Landing still not pixel-perfect** vs the industry PDF: glows, waves, overlapping badges, real compare table, circular demo photo + orbiting pills, first FAQ item navy accordion, tighter logo crops.
2. **Article page** was not the pixel-perfect pass. If the user says “vet page,” they usually mean the **industry landing**, not the blog. Page **id 23** is protected: a blog convert publishes a new slug (`…-convert`) instead of overwriting it. Filenames with a whole-word `blog` (e.g. `Axion_Blog Template_V4.jpg`) route to the article plan, not the landing.
3. **PDF on Windows without Python** — still a gap. Desktop EXE users need `pip3 install -r requirements.txt` or a Node rasterizer.
4. Classification is filename-heavy. A nameless `upload.pdf` of the homepage can still route via scores; keep tests if you change scoring.
5. Chat history is truncated to 80 messages; welcome text may have scrolled off. Last-page pin is the safety net.

---

## First actions for the next agent

1. Confirm `lastSiteId` is `ff47a2b6-8172-4188-adf0-423e18bb3253` (wp.azbuilds.xyz).
2. Run the three test commands above.
3. If changing landing layout/copy, convert through Plugin Agent (drop JPEG or PDF), do **not** hand-edit WordPress or import a sidecar JSON.
4. After convert, check https://wp.azbuilds.xyz/never-miss-another-client-call/ and confirm the article at `/how-can-vets-reduce-no-shows-at-their-clinic-effectively/` is still page 23.
5. Keep using core widgets + Font Awesome. Do not add HTML layout widgets. Do not generate Plugin Agent Widgets for this landing site.

---

## User prompt you can paste to Claude

```
You are taking over Plugin Agent. Read HANDOFF.md first and follow it exactly.

This is a Next.js app that converts JPEG/PNG/PDF designs into Elementor pages and publishes them on https://wp.azbuilds.xyz. Conversion must stay in-app (ingest → layout-plan → elementor-builder → WP import). Do not use HTML widgets as layout. Do not generate Plugin Agent Widgets on azbuilds. Do not switch lastSiteId off wp.azbuilds.xyz. Do not overwrite WordPress page id 23 (the blog article).

Landing page: https://wp.azbuilds.xyz/never-miss-another-client-call/  title “Never Miss Another Client Call”
Article (leave it): https://wp.azbuilds.xyz/how-can-vets-reduce-no-shows-at-their-clinic-effectively/

Dev server: npm run dev → http://127.0.0.1:43177
Tests: npx tsc --noEmit && npx tsx scripts/test-widget-convert.ts && npx tsx scripts/test-agent.ts

PDF support exists (Convert PDF + Python rasterize). Visible file input; convert starts on select.

Continue from HANDOFF.md “Open work”.
```
