'use strict';
// Fetches a user-supplied web page for AI analysis without letting the URL
// reach private infrastructure (SSRF): only http(s), only public IPs, every
// redirect re-checked, short timeout, size-capped, text extracted from HTML.
const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 400 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19));
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIPv4(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8')
    || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

async function assertPublic(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) links can be read');
  if (url.username || url.password) throw new Error('Links with credentials are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private address');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIP(a.address))) throw new Error('Private address');
}

function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const meta = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description|og:title)["'][^>]*content=["']([^"']*)["']/gi)]
    .map((m) => m[1]);
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|section|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return [title.trim(), ...meta, body].filter(Boolean).join('\n');
}

// Returns { ok: true, text, finalUrl } or { ok: false, reason }.
async function fetchPageText(rawUrl, maxChars = 5000) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'not a valid link' };
  }
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(url);
      const res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'TalentBridgeBot/1.0 (+profile link preview)', Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url);
        continue;
      }
      if (!res.ok) return { ok: false, reason: `the site answered ${res.status}` };
      const type = res.headers.get('content-type') || '';
      if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return { ok: false, reason: 'not a web page' };
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const raw = Buffer.concat(chunks).toString('utf8');
      const text = /html/i.test(type) ? htmlToText(raw) : raw;
      if (!text.trim()) return { ok: false, reason: 'the page has no readable text (it may load with JavaScript)' };
      return { ok: true, text: text.slice(0, maxChars), finalUrl: url.href };
    }
    return { ok: false, reason: 'too many redirects' };
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'the site took too long' : e.message === 'Private address' ? 'not a public website' : 'the site couldn’t be reached' };
  }
}

module.exports = { fetchPageText, isPrivateIP };
