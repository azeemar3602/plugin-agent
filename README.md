# Plugin Agent

A chat agent that installs WordPress plugins and imports Elementor templates. Drag a plugin zip and template JSON onto the window — it classifies each file and pushes it to the site.

## Run

```bash
npm install
pip3 install -r requirements.txt
npm run dev
```

Open [http://127.0.0.1:43177](http://127.0.0.1:43177). Not `http://0.0.0.0`.

## Windows installer (any laptop)

Build a setup EXE that does **not** need Node.js:

```bash
npm install
npm run desktop:win
```

That writes `release/PluginAgentSetup.exe`. Copy that file to a Windows PC, double-click it, and open **Plugin Agent** from the Start menu or desktop shortcut. Site passwords stay on that PC under `%APPDATA%\plugin-agent\data`.

If Windows SmartScreen appears, choose **More info → Run anyway**. The portable folder `release/PluginAgent-win32-x64` also works: unzip and run `PluginAgent.exe`.

## What it needs

1. Site URL (`https://yoursite.com`)
2. WordPress username
3. Application password — Users → Profile → Application Passwords (not the login password)
4. Files: plugin zip/folder, Elementor `.json`, and/or a JPEG, PNG, or PDF of a page design

Then drag them in, or use **Install on WordPress**.

A design file is turned into Elementor JSON from the layout in the mockup, using **widgets actually registered on the connected site**:

1. The helper lists every Elementor widget (core + addons).
2. Plugin Agent classifies them (header, hero, FAQ, CTA, footer, …).
3. Dropping a JPEG/PNG maps the design onto those widgets. Addon widgets win over Elementor core.
4. If the design needs a widget the site does not have, Plugin Agent **generates** a real Elementor widget plugin (`Plugin Agent Widgets`), installs it, and converts with those widgets. It does not drop HTML blocks as a substitute.

Images and icons stay as placeholders unless the widget already has default media.

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
