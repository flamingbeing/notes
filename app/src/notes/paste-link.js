// A pasted web address becomes a titled Markdown link with the tracking parts of the address taken off. Pure functions
// (no DOM), so app/test can run them in Node. The title comes from the address itself (the page is not fetched: the
// browser can't read other sites' pages, and the app has no server route for it): "Example Domain" for
// https://example.com/example-domain, the site's name when the path says nothing.

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|igshid|igsh|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|vero_id|oly_.*|s_kwcid|ref_src|ref_url|spm|si|feature|share_id|ocid|cvid|sr_share)$/i;

/** one address on its own (no spaces, http or https) -> the URL, or null @param {string} text */
export function asUrl(text) {
  const t = String(text || '').trim();
  if (!/^https?:\/\/[^\s<>]+$/i.test(t)) return null;
  try { return new URL(t); } catch { return null; }
}

/** the address without tracking parameters (and the empty "?" or "#" they leave) @param {URL} url */
export function cleanUrl(url) {
  const u = new URL(url.href);
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let s = u.toString();
  if (!u.search && s.endsWith('?')) s = s.slice(0, -1);
  return s;
}

/** a readable title from the address @param {URL} url */
export function titleOf(url) {
  const host = url.hostname.replace(/^(www|m|mobile)\./i, '');
  let seg = '';
  try { seg = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || ''); } catch { seg = ''; }
  seg = seg.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  // an id, a number or a bare file name says nothing: use the site
  if (seg.length < 3 || /^[\d\s]+$/.test(seg) || (!/\s/.test(seg) && /\d/.test(seg) && seg.length > 10)) return host;
  const words = seg.charAt(0).toUpperCase() + seg.slice(1);
  return `${words} (${host})`.replace(/[[\]]/g, '');
}

/** Markdown-safe address: spaces and brackets escaped @param {string} href */
const safe = href => href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

/** the Markdown for a pasted address; label (a selected text) replaces the title -> string, or null if not an address
 * @param {string} text @param {string} [label] */
export function linkFor(text, label) {
  const url = asUrl(text);
  if (!url) return null;
  const title = (label || '').trim() || titleOf(url);
  return `[${title.replace(/[[\]]/g, '')}](${safe(cleanUrl(url))})`;
}
