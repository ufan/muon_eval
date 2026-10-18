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

### Serving a release directory (recommended for a server behind a router)

Stock nginx serves an extracted release; no image is built on the server. Layout (example `/srv/muon_dam_eval`):

```text
/srv/muon_dam_eval/
  docker-compose.yml   deploy/docker-compose.dist.yml (nginx:alpine, port 5177, dist/ and nginx.conf mounted read-only)
  nginx.conf           the repository's nginx.conf
  dist/                a release from scripts/package-deploy.sh
```

The repository's `nginx.conf` is what makes the first load fast. Without it, stock nginx sends about 7 MB uncompressed and no cache instructions. With it:
- **Compression:** the release's ready-made `.gz` copies (gzip level 9) are sent with no work per request, and other files are compressed on the fly. A first visit is about 1.6 MB.
- **Caching:** versioned dataset files are cached for a year, so repeat visits skip the 2.6 MB mesh. Pages, modules and the registry are revalidated with ETags, so updates show at once and unchanged files cost a 304.
- **Security headers** on every response.

Measured on HTTP/1.1 with 100 ms latency and 1 MB/s, the time until the scene and its first result are ready drops from 9.4 s to 5.2 s.

Update, keeping the previous release for rollback:

```bash
bash scripts/package-deploy.sh /tmp/muon-release.tar.gz        # on a build machine with Node 22 and Python
# copy the archive and the repository's nginx.conf to the server, then:
cd /srv/muon_dam_eval
mkdir dist.new && tar -xzf /tmp/muon-release.tar.gz -C dist.new --strip-components=1
mv dist dist.prev && mv dist.new dist
docker compose up -d --force-recreate                           # the bind mount follows the new dist/
```

Roll back with `mv dist dist.bad && mv dist.prev dist && docker compose up -d --force-recreate`. After changing only `nginx.conf`, run `docker compose exec muon-dam-eval nginx -s reload`. A browser behind plain `http://address:port` uses HTTP/1.1 (six parallel requests). HTTPS on a domain name would add HTTP/2 or HTTP/3 and remove that queue.

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

**First-load speed.** A first visit downloads about 7 MB uncompressed (the scene mesh alone is 2.6 MB), so enable compression on the host: gzip or Brotli for `.js`, `.css`, `.json` and the binary `.glb` / `.f32` files (`application/octet-stream`). That brings it to about 1.5 MB, and the mesh compresses to about 0.8 MB. `nginx.conf` does this. Dataset release directories are versioned and immutable (ADR-018), so their files may be cached long (`nginx.conf`: `max-age=31536000, immutable`); keep `datasets/registry.json` revalidated. The page itself preloads every module (`<link rel="modulepreload">`) and the registry, so high-latency hosts do not pay one round trip per import level.

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
- Local Three.js: `dist/vendor/three/` (version `0.186.0`; addons used: `controls/OrbitControls.js`, `lines/LineSegments2.js`, `lines/LineSegmentsGeometry.js`, `lines/LineMaterial.js`, copied unchanged from the npm package)
