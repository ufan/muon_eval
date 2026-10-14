# Deployment guide

The project is a pure static web application. Three.js, dataset releases, geometry and ray calculation are all included locally; at runtime it contacts no CDN and needs no cloud computing service.

The application lives in `dist/`; dataset releases live in the top-level `datasets/` directory and are served at `/datasets/` (ADR-018). Every deployment method below makes both available.

## 1. Local use

Use the bundled server (Node.js 22, no packages). It serves `dist/` and the dataset releases from `datasets/` directly (no sync needed) and sends `Cache-Control: no-cache`, so browsers revalidate each file and always load updated modules:

```bash
npm run serve                                  # this machine only (127.0.0.1:8765)
node scripts/serve.mjs --host 0.0.0.0          # share on a LAN
```

Open `http://127.0.0.1:8765/`, or `http://<machine address>:8765/` from other devices when shared; allow the port only on the networks you need.

Any other static HTTP server also works after copying the datasets into `dist/` (`node scripts/sync-datasets.mjs`, then for example `python3 -m http.server 8765 --directory dist`; rerun the sync after changing `datasets/`). Such servers send no cache instructions, so browsers may keep old modules after an update: hard-reload (Ctrl+Shift+R) once.

Do not double-click `dist/index.html`. Browsers restrict JSON and ES modules on `file://` pages, so the page must be served over HTTP. (Windows launcher scripts were removed on 2026-10-10 and can be added back when needed.)

## 2. Docker / Linux server

With Docker installed, run in the repository root:

```bash
docker compose up -d --build
```

Then open `http://<server address>:8080/`. The image copies `dist/` into the web root and `datasets/` into `/datasets/`. Stop the service with:

```bash
docker compose down
```

In production, put an existing HTTPS reverse proxy (Nginx, Caddy, Traefik or a cloud load balancer) in front of `127.0.0.1:8080`, with a domain, TLS certificate, access logs and authentication.

## 3. Existing static web server or static hosting

Static hosts that publish only `dist/` need the datasets copied in first:

```bash
node scripts/sync-datasets.mjs   # copies the registry and all registered releases into dist/datasets/
```

Then copy the whole of `dist/` to any static site directory. `dist/datasets/` is generated and gitignored. File names carry no content hash (there is no build step), so configure the host to send `Cache-Control: no-cache` for `.js`, `.css`, `.html` and `.json` where it allows (as `nginx.conf` does); otherwise browsers may run old modules after an update until a hard reload. The server must return these MIME types:

- `.js`: `text/javascript`
- `.json`: `application/json`
- `.wasm`: `application/wasm` (reserved for later)
- `.glb`, `.f32`: served as binary (`application/octet-stream` or `model/gltf-binary`)

The root path must serve `index.html`. The application needs no server API and can run on an intranet, VPN, object-storage static website or ordinary Nginx/Apache.

## 4. External customer access

- Enforce HTTPS.
- Set authentication and access periods per customer or project.
- Do not put engineering data that has not been cleared for release on a public anonymous site. (The current Zhouning data is not considered sensitive; re-check for each new dataset.)
- Fix a version before external release and keep the corresponding dataset release.
- Set a CSP, access logs, backups and an update/rollback plan.

Application data is stored in each browser's `localStorage` and is not synchronized to the server or other devices: one plan per dataset release (stations, poses, detector settings, active station; `muography-plan` 1.0.0, see [plan format](../specs/PLAN_FORMAT.md)) and view preferences. "导出部署方案" downloads the plan as a file and "导入方案" loads one, so plans are shared as files (for example in git or a shared folder).

## 5. Contents and versions

- Page: `dist/index.html`
- Application entry: `dist/app.js`, modules in `dist/modules/`
- Dataset registry and releases: `datasets/registry.json`, `datasets/<dataset-id>/<release>/`
- Local Three.js: `dist/vendor/three/` (version `0.186.0`)
