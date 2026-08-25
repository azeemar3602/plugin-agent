# Plugin Agent

A chat agent that asks for WordPress credentials, then uploads a plugin folder from your PC and installs or updates it on the site.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43177](http://127.0.0.1:43177).

## What the agent asks

1. Site URL (`https://yoursite.com`)
2. WordPress username
3. Application password — Users → Profile → Application Passwords (not the login password)
4. Your plugin folder — click **Select plugin folder on this PC** (or **Zip** that folder)

A typed `C:\...` path will not work if the agent is not running on that Windows PC. The files have to be uploaded here first.

It remembers the site. Later:

```
do update
```

That re-reads the last uploaded folder, zips it, and overwrites the plugin on WordPress.

## One-time on WordPress

Application passwords only work with the REST API, and WordPress core cannot install a custom zip that way. The first time, the agent gives you `plugin-agent-bridge.zip` (**Plugin Agent Helper**). Upload it once under **Plugins → Add New → Upload Plugin** and activate it.

The helper is only the installer. Your real plugin appears under **Plugins** after you select its folder in this app and the agent reports a successful install.

## Notes

- The WordPress user must be an Administrator.
- Credentials stay in `data/store.json` (gitignored).
- If folder pick is unavailable, zip the plugin folder (the directory with the main `.php` file) and use **Zip**.
