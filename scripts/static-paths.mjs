// Development servers serve the application from dist/ and dataset releases
// from the top-level datasets/ directory under /datasets/ (ADR-018).
export const distRoot = new URL('../dist/', import.meta.url);
export const datasetsRoot = new URL('../datasets/', import.meta.url);
export const registryUrl = new URL('registry.json', datasetsRoot);

// Returns the file URL for a request path, or null when it escapes its root.
export function resolveStaticPath(pathname) {
  const [root, relative] = pathname.startsWith('/datasets/')
    ? [datasetsRoot, pathname.slice('/datasets/'.length)]
    : [distRoot, (pathname === '/' ? '/index.html' : pathname).slice(1)];
  const file = new URL(relative, root);
  return file.href.startsWith(root.href) ? file : null;
}
