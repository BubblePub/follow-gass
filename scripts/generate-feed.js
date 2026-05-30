#!/usr/bin/env node

// ============================================================================
// follow-gass — Central Feed Generator
// ============================================================================
// Runs on GitHub Actions (daily) to fetch content and publish feed.json.
//
//   - Media headlines  -> Google News RSS (titles + snippets + links only;
//                         no full text, no paywall, NO API key)
//   - Official/agenda  -> Google News "site:" proxy queries (+ best-effort
//                         official pages, see notes)
//
// Co-occurrence: if the SAME article URL is returned for BOTH persons, the item
// is tagged persons:["attal","sejourne"] and coOccurrence:true. The ranking
// prompt forces those to the top of the digest.
//
// Dedup: previously-seen URLs are tracked in state-feed.json.
//
// Usage:  node generate-feed.js
// Output: writes ../feed.json (and updates ../state-feed.json)
// ============================================================================

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const SCRIPT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const ROOT = join(SCRIPT_DIR, "..");
const SOURCES_PATH = join(ROOT, "config", "sources.json");
const FEED_PATH = join(ROOT, "feed.json");
const STATE_PATH = join(ROOT, "state-feed.json");

const RSS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MEDIA_LOOKBACK_HOURS = 24;

// -- helpers -----------------------------------------------------------------

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": RSS_UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function stripCdata(s) {
  if (!s) return "";
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Parse an RSS 2.0 feed into items. Works for Google News RSS.
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const title = stripCdata((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const link = stripCdata((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    const pub = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    const desc = stripCdata((b.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "");
    // Google News encodes the outlet name in <source url="...">Le Monde</source>
    const source = stripCdata((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "");
    if (!link) continue;
    items.push({
      title: decodeEntities(title),
      url: link,
      source: decodeEntities(source) || "(source inconnue)",
      snippet: stripTags(desc).slice(0, 320),
      publishedAt: pub ? new Date(pub).toISOString() : null,
    });
  }
  return items;
}

function googleNewsUrl(base, query, lang) {
  const hl = lang === "en" ? "en-US" : "fr";
  const gl = lang === "en" ? "US" : "FR";
  const ceid = lang === "en" ? "US:en" : "FR:fr";
  const q = encodeURIComponent(query);
  return `${base}?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

function withinHours(iso, hours) {
  if (!iso) return true; // keep undated items; dedup handles repeats
  return Date.now() - new Date(iso).getTime() <= hours * 3600 * 1000;
}

// -- state -------------------------------------------------------------------

async function loadState() {
  if (!existsSync(STATE_PATH)) return { seenUrls: {} };
  try {
    const s = JSON.parse(await readFile(STATE_PATH, "utf-8"));
    s.seenUrls ||= {};
    return s;
  } catch { return { seenUrls: {} }; }
}

async function saveState(state) {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const [id, ts] of Object.entries(state.seenUrls))
    if (ts < cutoff) delete state.seenUrls[id];
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

// -- media (Google News RSS) -------------------------------------------------

async function fetchMedia(sources, errors) {
  const base = sources.googleNewsBase;
  // url -> { item, persons:Set }
  const byUrl = new Map();

  for (const [personId, person] of Object.entries(sources.persons)) {
    for (const q of person.newsQueries) {
      try {
        const xml = await fetchText(googleNewsUrl(base, q.query, q.lang));
        for (const it of parseRss(xml)) {
          if (!withinHours(it.publishedAt, MEDIA_LOOKBACK_HOURS)) continue;
          const rec = byUrl.get(it.url) || { item: { ...it, lang: q.lang, type: "media" }, persons: new Set() };
          rec.persons.add(personId);
          byUrl.set(it.url, rec);
        }
      } catch (e) { errors.push(`media ${personId}/${q.lang}: ${e.message}`); }
    }
  }

  const items = [];
  for (const { item, persons } of byUrl.values()) {
    const ps = [...persons];
    items.push({
      ...item,
      persons: ps,
      coOccurrence: ps.length > 1, // <-- the hard-rule signal
    });
  }
  return items;
}

// -- official / agenda -------------------------------------------------------

async function fetchOfficial(sources, errors) {
  const base = sources.googleNewsBase;
  const items = [];
  for (const [personId, person] of Object.entries(sources.persons)) {
    for (const off of person.official || []) {
      if (off.type === "googlenews") {
        try {
          const xml = await fetchText(googleNewsUrl(base, off.query, off.lang));
          for (const it of parseRss(xml)) {
            if (!withinHours(it.publishedAt, MEDIA_LOOKBACK_HOURS)) continue;
            items.push({ ...it, lang: off.lang, type: "agenda", persons: [personId], coOccurrence: false, official: off.name });
          }
        } catch (e) { errors.push(`official ${personId}/${off.name}: ${e.message}`); }
      } else {
        // type "page": official HTML pages (EC commissioner page, Renaissance news).
        // These have no stable RSS and need per-site selectors. Left as a hook:
        // implement targeted extraction here if you want hard agenda scraping.
        errors.push(`official ${personId}/${off.name}: page-type source not auto-parsed (see sources.json note)`);
      }
    }
  }
  return items;
}

// -- main --------------------------------------------------------------------

async function main() {
  const errors = [];
  const sources = JSON.parse(await readFile(SOURCES_PATH, "utf-8"));
  const state = await loadState();

  const [media, official] = await Promise.all([
    fetchMedia(sources, errors),
    fetchOfficial(sources, errors),
  ]);

  // Dedup against state (by URL)
  const fresh = [];
  for (const it of [...media, ...official]) {
    if (state.seenUrls[it.url]) continue;
    state.seenUrls[it.url] = Date.now();
    fresh.push(it);
  }

  const feed = {
    generatedAt: new Date().toISOString(),
    persons: Object.keys(sources.persons),
    items: fresh,
    stats: {
      total: fresh.length,
      media: fresh.filter((i) => i.type === "media").length,
      agenda: fresh.filter((i) => i.type === "agenda").length,
      coOccurrence: fresh.filter((i) => i.coOccurrence).length,
    },
    errors: errors.length ? errors : undefined,
  };

  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2));
  await saveState(state);
  console.error(`feed.json written: ${fresh.length} items ` +
    `(media ${feed.stats.media}, agenda ${feed.stats.agenda}, ` +
    `co-occurrence ${feed.stats.coOccurrence}); ${errors.length} non-fatal errors`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
