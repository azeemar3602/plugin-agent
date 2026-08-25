# Plugin Agent

A chat agent that installs WordPress plugins and imports Elementor templates. Drag a plugin zip and template JSON onto the window — it classifies each file and pushes it to the site.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43177](http://127.0.0.1:43177). Not `http://0.0.0.0`.

## What it needs

1. Site URL (`https://yoursite.com`)
2. WordPress username
3. Application password — Users → Profile → Application Passwords (not the login password)
4. Files: plugin zip/folder and/or Elementor `.json` templates (or a zip of those JSON files)

Then drag them in, or use **Install on WordPress**.

## Where things go

- Plugin zip/folder → **WP Admin → Plugins**
- Elementor JSON (Templates → Saved Templates → Export) → **Templates → Saved Templates**
- Elementor must be installed and active before templates can import

Later, **do update** re-zips the last plugin folder and overwrites it on WordPress.

## One-time helper

The first time, upload `plugin-agent-bridge.zip` (**Plugin Agent Helper**) under **Plugins → Add New → Upload Plugin** and activate it. If you already have an older helper, replace it with the current zip so template import is available.

## Notes

- The WordPress user must be an Administrator.
- To use a second website: click **Add site** (or paste its URL), enter that site’s username and application password, and install Plugin Agent Helper there too. The header dropdown switches which site drops go to.
- Credentials stay in `data/store.json` (gitignored).
