#!/usr/bin/env node

// ============================================================================
// follow-gass — Central Feed Generator
// ============================================================================
// Runs on GitHub Actions (daily) to fetch content and publish feed.json.
//
//   - Media headlines  -> Google News RSS (titles + snippets + links only;
//                         no full text, no paywall, NO API key)
//
// No agenda is fetched here: neither figure has a reliably machine-scrapable
// official agenda (the EC commissioner calendar is JS-rendered; Renaissance has
// no stable feed — see config/sources.json `agendaRefs`). The digest's 官方行程
// section is instead built at the remix layer, where the agent extracts concrete
// forward-looking engagements mentioned in the fetched news. If you later find a
// machine-readable agenda source, add a fetcher and tag items `type:"agenda"`.
//
// Co-occurrence: if the SAME article URL is returned for BOTH persons, the item
// is tagged persons:["attal","sejourne"] and coOccurrence:true. The ranking
// prompt forces those to the top of the digest.
//
// Carry-over (anti-split): the feed publishes EVERY item inside a 48h window,
// even ones seen on a previous run, each tagged with `firstSeenAt` and `isNew`.
// This way an event whose coverage straddles the daily cutoff (some outlets
// report early, some late) is NOT cut in half: tomorrow's feed still contains
// yesterday's early articles alongside the new late ones, so the agent can
// re-cluster the whole event. The `isNew` flag lets the digest suppress events
// with no fresh coverage and surface continuing ones as "续报". state-feed.json
// remembers when each URL was first seen (pruned after 7 days).
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
// 48h window (was 24h): gives the agent two days of context so an event whose
// coverage spans the cutoff stays whole, and survives a single missed run.
const MEDIA_LOOKBACK_HOURS = 48;

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

// -- main --------------------------------------------------------------------

async function main() {
  const errors = [];
  const sources = JSON.parse(await readFile(SOURCES_PATH, "utf-8"));
  const state = await loadState();

  const media = await fetchMedia(sources, errors);

  // Carry-over instead of drop-on-seen: publish every in-window item, but tag
  // when it was first seen and whether it's new this run. The agent clusters
  // over the full window (so split events re-merge) and uses `isNew` to decide
  // what to surface vs. suppress. Same article from the same URL still collapses
  // to one entry per run via this Map.
  const now = Date.now();
  const byUrl = new Map();
  for (const it of media) {
    if (byUrl.has(it.url)) continue;
    const firstSeen = state.seenUrls[it.url];
    const isNew = !firstSeen;
    if (isNew) state.seenUrls[it.url] = now;
    byUrl.set(it.url, {
      ...it,
      firstSeenAt: new Date(isNew ? now : firstSeen).toISOString(),
      isNew,
    });
  }
  const items = [...byUrl.values()];

  const feed = {
    generatedAt: new Date().toISOString(),
    persons: Object.keys(sources.persons),
    lookbackHours: MEDIA_LOOKBACK_HOURS,
    items,
    stats: {
      total: items.length,
      new: items.filter((i) => i.isNew).length,
      carried: items.filter((i) => !i.isNew).length,
      media: items.filter((i) => i.type === "media").length,
      agenda: items.filter((i) => i.type === "agenda").length,
      coOccurrence: items.filter((i) => i.coOccurrence).length,
    },
    errors: errors.length ? errors : undefined,
  };

  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2));
  await saveState(state);
  console.error(`feed.json written: ${items.length} items ` +
    `(${feed.stats.new} new, ${feed.stats.carried} carried; ` +
    `media ${feed.stats.media}, agenda ${feed.stats.agenda}, ` +
    `co-occurrence ${feed.stats.coOccurrence}); ${errors.length} non-fatal errors`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
