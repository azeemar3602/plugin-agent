# PressPush

A local agent that installs and updates WordPress plugins from a folder on your machine.

You give it:

1. The WordPress site URL
2. The path to the plugin you are editing in Cursor or Claude

It zips that folder and installs it on the site. After you save local changes, tell it to **update** and it overwrites the plugin with the latest files.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43177](http://127.0.0.1:43177).

## One-time WordPress setup

PressPush talks to WordPress over the REST API. Core WordPress cannot install a custom zip that way, so you install a tiny helper plugin once.

1. In PressPush, download **Bridge plugin** (or open `/api/bridge`).
2. On the site: **Plugins → Add New → Upload Plugin** → select `presspush-bridge.zip` → Activate.
3. In WordPress, open **Users → Profile → Application Passwords**. Create one named `PressPush`. Copy it.
4. In PressPush, save the site URL, your admin username, and that application password. Do not use your login password.

Application passwords are stored in `data/store.json` on this machine. That file is gitignored.

## Daily loop

1. Build or edit the plugin locally (Cursor, Claude, or any editor).
2. Tell the agent:

   `install /absolute/path/to/my-plugin on https://yoursite.com`

3. When the plugin is saved again, say `update`. PressPush re-reads the folder, zips it, and pushes it.

You can also use **Track folder** in the sidebar and the **Update plugin** button.

A sample plugin lives at `examples/hello-presspush`. Install that first if you want to see an admin notice change after you bump the version and update.

## Chat examples

```
connect https://yoursite.com user admin password xxxx xxxx xxxx xxxx xxxx xxxx
install examples/hello-presspush on https://yoursite.com
update
pack examples/hello-presspush
check site
download bridge
```

If the bridge is not installed yet, **pack** still builds a zip you can upload yourself from WP Admin.

## How a deploy works

1. PressPush inspects the folder for a PHP file with a `Plugin Name` header.
2. It zips the folder (skips `node_modules`, `.git`, and other junk).
3. It POSTs the zip to `/wp-json/presspush/v1/deploy` as the WordPress user.
4. The bridge uses WordPress `Plugin_Upgrader` with overwrite, then activates the plugin.

## Notes

- This app must run on the same computer that has the plugin files (or a machine that can read that path).
- The WordPress site must be reachable from that computer.
- The site user needs `install_plugins` and `activate_plugins` (Administrator).
- HTTPS on the site is strongly recommended because application passwords are sent as HTTP Basic auth.
