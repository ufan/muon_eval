# Deployment guide

The project is a pure static web application. Three.js, dataset releases, geometry and ray calculation are all included locally; at runtime it contacts no CDN and needs no cloud computing service.

The application lives in `dist/`; dataset releases live in the top-level `datasets/` directory and are served at `/datasets/` (ADR-018). Every deployment method below makes both available.

## 1. Local offline use on Windows

1. Extract the complete release package (it must contain both `dist/` and `datasets/`).
2. Double-click `启动本机离线版.cmd` (start local offline version).
3. The browser opens `http://127.0.0.1:8765/`.
4. Keep the command window open; closing it or pressing `Ctrl+C` stops the server.

Do not double-click `dist/index.html`. Browsers restrict JSON and ES modules on `file://` pages, so the page must be served by a local HTTP server. `serve.ps1` serves `dist/` and maps `/datasets/` to the `datasets/` directory.

## 2. LAN sharing on Windows

1. Double-click `启动局域网共享.cmd` (start LAN sharing).
2. The window lists addresses such as `http://192.168.1.20:8765/`.
3. Computers or tablets on the same LAN open that address in a browser.
4. If Windows Firewall asks, allow only the private or domain networks you actually need.

A port can also be set manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -BindAddress 0.0.0.0 -Port 9000
```

## 3. Docker / Linux server

With Docker installed, run in the repository root:

```bash
docker compose up -d --build
```

Then open `http://<server address>:8080/`. The image copies `dist/` into the web root and `datasets/` into `/datasets/`. Stop the service with:

```bash
docker compose down
```

In production, put an existing HTTPS reverse proxy (Nginx, Caddy, Traefik or a cloud load balancer) in front of `127.0.0.1:8080`, with a domain, TLS certificate, access logs and authentication.

## 4. Existing static web server or static hosting

Static hosts that publish only `dist/` need the datasets copied in first:

```bash
node scripts/sync-datasets.mjs   # copies the registry and all registered releases into dist/datasets/
```

Then copy the whole of `dist/` to any static site directory. `dist/datasets/` is generated and gitignored. The server must return these MIME types:

- `.js`: `text/javascript`
- `.json`: `application/json`
- `.wasm`: `application/wasm` (reserved for later)
- `.glb`, `.f32`: served as binary (`application/octet-stream` or `model/gltf-binary`)

The root path must serve `index.html`. The application needs no server API and can run on an intranet, VPN, object-storage static website or ordinary Nginx/Apache.

## 5. External customer access

- Enforce HTTPS.
- Set authentication and access periods per customer or project.
- Do not put engineering data that has not been cleared for release on a public anonymous site. (The current Zhouning data is not considered sensitive; re-check for each new dataset.)
- Fix a version before external release and keep the corresponding dataset release.
- Set a CSP, access logs, backups and an update/rollback plan.

Application data (stations, device settings) is stored in each browser's `localStorage` and is not synchronized to the server or other devices. Export JSON to exchange plans between devices.

## 6. Contents and versions

- Page: `dist/index.html`
- Application entry: `dist/app.js`, modules in `dist/modules/`
- Dataset registry and releases: `datasets/registry.json`, `datasets/<dataset-id>/<release>/`
- Local Three.js: `dist/vendor/three/` (version `0.186.0`)
