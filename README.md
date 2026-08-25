# Plugin Agent

A chat agent you run locally. It asks for WordPress credentials, then a plugin folder. After that, you say **do update** whenever Cursor or Claude saves the plugin.

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
4. Local plugin folder path

It remembers that. Later:

```
do update
```

It re-reads the folder, zips it, and overwrites the plugin on the site.

## One-time on WordPress

Application passwords only work with the REST API, and WordPress core cannot install a custom zip that way. The first time, the agent gives you `plugin-agent-bridge.zip`. Upload it once under **Plugins → Add New → Upload Plugin** and activate it. After that, the agent is just chat.

## Notes

- Run this on a machine that can read the plugin folder and reach the WordPress site.
- If the agent is not on that PC, zip the plugin folder and upload it with the paperclip.
- Credentials stay in `data/store.json` (gitignored).
- The WordPress user must be an Administrator.
