#!/usr/bin/env node

// ============================================================================
// follow-gass — Prepare Digest (consumer side)
// ============================================================================
// Runs on the user's machine. Gathers everything the LLM needs:
//   - the central feed.json (published by the repo owner's GitHub Action)
//   - the prompt files (user custom > remote GitHub > local default)
//   - the user's config (which person(s) to follow, language, delivery)
// Filters feed items to the followed person(s), then prints ONE JSON blob.
//
// The LLM's only job afterwards is: cluster -> rank -> summarize -> compare ->
// assemble the Chinese digest, following the prompts. It fetches NOTHING.
//
// Usage:  node prepare-digest.js
// Output: JSON to stdout
// ============================================================================

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";

// --- REPLACE <owner> with your GitHub username after you fork/push this repo ---
const REPO_RAW = "https://raw.githubusercontent.com/BubblePub/follow-gass/main";
// ------------------------------------------------------------------------------

const USER_DIR = join(homedir(), ".follow-gass");
const CONFIG_PATH = join(USER_DIR, "config.json");
const SCRIPT_DIR = decodeURIComponent(new URL(".", import.meta.url).pathname);
const LOCAL_PROMPTS = join(SCRIPT_DIR, "..", "prompts");
const USER_PROMPTS = join(USER_DIR, "prompts");

const FEED_URL = `${REPO_RAW}/feed.json`;
const PROMPTS_BASE = `${REPO_RAW}/prompts`;
const PROMPT_FILES = [
  "cluster.md", "score-rank.md", "summarize-event.md",
  "compare-sources.md", "digest-format.md", "translate.md",
];

async function fetchJSON(url) { try { const r = await fetch(url); return r.ok ? r.json() : null; } catch { return null; } }
async function fetchText(url) { try { const r = await fetch(url); return r.ok ? r.text() : null; } catch { return null; } }

async function main() {
  const errors = [];

  // 1. config
  let config = { follow: ["attal", "sejourne"], language: "zh", delivery: { method: "stdout" } };
  if (existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")); }
    catch (e) { errors.push(`config: ${e.message}`); }
  }
  const follow = config.follow && config.follow.length ? config.follow : ["attal", "sejourne"];

  // 2. central feed (fall back to a local feed.json if the repo isn't reachable)
  let feed = await fetchJSON(FEED_URL);
  if (!feed) {
    const localFeed = join(SCRIPT_DIR, "..", "feed.json");
    if (existsSync(localFeed)) { feed = JSON.parse(await readFile(localFeed, "utf-8")); errors.push("used local feed.json (remote unreachable)"); }
    else errors.push("could not fetch feed.json");
  }

  // 3. filter to followed person(s). Keep co-occurrence items if EITHER person is followed.
  //    Defense-in-depth for the agenda leak: the central feed may still carry EC
  //    college-calendar entries mis-tagged to one commissioner (broken RSS facet)
  //    until the owner's Action republishes with the generate-feed.js fix. Drop any
  //    agenda item whose title/location names none of its tagged persons' aliases.
  let aliasesByPerson = {};
  const sourcesPath = join(SCRIPT_DIR, "..", "config", "sources.json");
  if (existsSync(sourcesPath)) {
    try {
      const src = JSON.parse(await readFile(sourcesPath, "utf-8"));
      for (const [id, p] of Object.entries(src.persons || {})) {
        aliasesByPerson[id] = (p.aliases && p.aliases.length ? p.aliases : [p.displayName || id])
          .map((a) => a.toLowerCase());
      }
    } catch (e) { errors.push(`sources: ${e.message}`); }
  }
  const namesAPerson = (it) => {
    const hay = `${it.title || ""} ${it.location || ""}`.toLowerCase();
    return it.persons.some((p) => (aliasesByPerson[p] || []).some((a) => hay.includes(a)));
  };
  const items = (feed?.items || []).filter((it) =>
    it.persons.some((p) => follow.includes(p)) &&
    (it.type !== "agenda" || Object.keys(aliasesByPerson).length === 0 || namesAPerson(it))
  );

  // 3b. Token diet for the LLM context (see deliver.js for the inverse step):
  //   - snippet: Google News snippets are ~94% HTML/URL noise (anchor tags wrapping
  //     the redirect URL). Strip tags + URLs; drop the field unless real text remains.
  //   - url: the base64 Google-News redirect URL is ~418B of opaque junk the model
  //     only needs to echo back. Replace it with a short placeholder that LOOKS like a
  //     URL (so the model drops it into markdown link slots verbatim). The real URLs
  //     live in a sidecar map that NEVER enters the LLM context; deliver.js expands the
  //     placeholders back into the finished digest before sending.
  const urlMap = {};
  const slimItems = items.map((it, i) => {
    if (it.url) urlMap[i] = it.url;
    const slim = { ...it, url: `https://gnews.ref/${i}` };
    const text = (it.snippet || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 25) slim.snippet = text;
    else delete slim.snippet;
    delete slim.firstSeenAt; // redundant with isNew (the only freshness flag the prompts use)
    return slim;
  });
  await writeFile(join(tmpdir(), "asd-urlmap.json"), JSON.stringify(urlMap));

  // 4. prompts: user custom > remote GitHub > local default
  const prompts = {};
  for (const f of PROMPT_FILES) {
    const key = f.replace(".md", "").replace(/-/g, "_");
    const userPath = join(USER_PROMPTS, f);
    const localPath = join(LOCAL_PROMPTS, f);
    if (existsSync(userPath)) { prompts[key] = await readFile(userPath, "utf-8"); continue; }
    const remote = await fetchText(`${PROMPTS_BASE}/${f}`);
    if (remote) { prompts[key] = remote; continue; }
    if (existsSync(localPath)) prompts[key] = await readFile(localPath, "utf-8");
    else errors.push(`prompt missing: ${f}`);
  }

  // 5. scoring config (ship it so the LLM can read the weights + hard rule)
  let scoring = null;
  const scoringPath = join(SCRIPT_DIR, "..", "config", "scoring.json");
  if (existsSync(scoringPath)) { try { scoring = JSON.parse(await readFile(scoringPath, "utf-8")); } catch {} }

  const out = {
    status: "ok",
    generatedAt: new Date().toISOString(),
    config: { follow, language: config.language || "zh", delivery: config.delivery || { method: "stdout" } },
    feedGeneratedAt: feed?.generatedAt || null,
    items: slimItems,
    scoring,
    prompts,
    stats: {
      total: items.length,
      new: items.filter((i) => i.isNew).length,
      carried: items.filter((i) => !i.isNew).length,
      coOccurrence: items.filter((i) => i.coOccurrence).length,
      media: items.filter((i) => i.type === "media").length,
      agenda: items.filter((i) => i.type === "agenda").length,
    },
    errors: errors.length ? errors : undefined,
  };
  console.log(JSON.stringify(out)); // compact: indentation is pure token waste for the LLM
}

main().catch((e) => { console.error(JSON.stringify({ status: "error", message: e.message })); process.exit(1); });
