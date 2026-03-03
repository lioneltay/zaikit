/**
 * Detect the mount prefix at runtime by inspecting script tags.
 * Returns e.g. "/sandbox" when mounted at that subpath, or "" when at root.
 */
export function getBasePath(): string {
  const scripts = document.querySelectorAll('script[src*="assets/"]');
  if (scripts.length > 0) {
    const src = (scripts[0] as HTMLScriptElement).src;
    const url = new URL(src);
    const assetsIdx = url.pathname.indexOf("/assets/");
    if (assetsIdx > 0) {
      return url.pathname.slice(0, assetsIdx); // e.g. "/sandbox"
    }
  }
  return "";
}
