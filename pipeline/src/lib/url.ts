const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

/**
 * Canonical form used for dedupe: https, lowercase host, no fragment,
 * no tracking params, no trailing slash (except the root).
 */
export function normalizeUrl(input: string, base?: string): string {
  const url = new URL(input, base);
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}
