#!/usr/bin/env node

// ============================================================================
// follow-gass — Deliver
// ============================================================================
// Sends the finished digest text to the configured channel.
//   stdout   -> print (default; the agent shows it in chat)
//   email    -> via Resend            (needs RESEND_API_KEY + config.delivery.email)
//
// For email we render the plain-text digest into a readable HTML version:
//   - section/card boxes for visual separation, bold headlines
//   - long source lists folded into a collapsible <details> block
//   - source links embedded behind "[Media] Title" anchor text (no raw URLs)
// The plain-text version is still sent as the `text` fallback (deliverability
// + accessibility), and stdout delivery stays plain text.
//
// Usage:  node deliver.js --file /tmp/digest.txt
//         cat digest.txt | node deliver.js
// ============================================================================

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";

const CONFIG_PATH = join(homedir(), ".follow-gass", "config.json");
const ENV_PATH = join(homedir(), ".follow-gass", ".env");
const URLMAP_PATH = join(tmpdir(), "asd-urlmap.json");

// Onboarding stores RESEND_API_KEY in ~/.follow-gass/.env, but cron / a plain
// shell never sources that file — so load it ourselves into process.env (without
// clobbering anything already exported). Supports `KEY=value`, optional `export `
// prefix, and surrounding quotes. Missing/garbled file => no-op (never blocks).
async function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return;
  let text = "";
  try { text = await readFile(ENV_PATH, "utf-8"); } catch { return; }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

// Load the placeholder->real-URL sidecar map written by prepare-digest.js.
// Missing/garbled => {} (graceful: links just fall back to the placeholder text).
async function loadUrlMap() {
  if (!existsSync(URLMAP_PATH)) return {};
  try { return JSON.parse(await readFile(URLMAP_PATH, "utf-8")); } catch { return {}; }
}

// Inverse of prepare-digest.js's URL diet: expand the `https://gnews.ref/<n>`
// placeholders the model copied into the digest back into the real source URLs.
function expandUrls(text, map) {
  return text.replace(/https:\/\/gnews\.ref\/(\d+)/g, (m, n) => map[n] || m);
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Inline styles only — Gmail and most clients strip <style>/<head> CSS.
const S = {
  body: "margin:0;padding:24px 12px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#1f2329;line-height:1.65;",
  wrap: "max-width:640px;margin:0 auto;",
  h1: "font-size:21px;font-weight:700;text-align:center;margin:0 0 20px;padding-bottom:14px;border-bottom:2px solid #d7dae0;color:#101317;",
  section: "background:#ffffff;border:1px solid #e3e6ea;border-radius:12px;padding:18px 18px 6px;margin:0 0 18px;",
  sectionTitle: "font-size:16px;font-weight:700;margin:0 0 14px;color:#0b66c3;",
  card: "background:#fafbfc;border:1px solid #eceef1;border-radius:10px;padding:13px 14px;margin:0 0 14px;",
  badges: "margin:0 0 6px;",
  badge: "display:inline-block;font-size:12px;line-height:1.4;color:#5b4500;background:#fff3cf;border:1px solid #f3e3a3;border-radius:5px;padding:1px 7px;margin:0 5px 4px 0;",
  headline: "font-size:16px;font-weight:700;margin:2px 0 8px;color:#101317;",
  para: "margin:0 0 10px;color:#33373d;",
  compare: "margin:0 0 12px;padding:9px 12px;background:#f3f6fb;border-left:3px solid #9bbbe0;border-radius:0 6px 6px 0;font-size:14px;color:#3a4654;",
  note: "margin:0 0 10px;font-size:12.5px;color:#7a818c;",
  h3: "font-size:15px;font-weight:700;margin:14px 0 8px;color:#101317;",
  subhead: "font-size:14px;font-weight:600;margin:4px 0 8px;color:#101317;",
  // <details> folds in clients that support it (Apple Mail, Outlook, iOS Mail).
  // Gmail strips <details>/<summary> AND blocks the checkbox hack, so there is no
  // interactive fold there — instead the summary degrades to a plain label and the
  // chips below it stay visible. Chips keep that fallback compact (~3 wrapped lines
  // instead of an 18-line wall), so the email reads cleanly in every client.
  details: "margin:6px 0 12px;",
  summary: "cursor:pointer;list-style:none;font-size:12.5px;font-weight:600;color:#7a818c;margin:0 0 7px;",
  chipWrap: "line-height:2.2;",
  chip: "display:inline-block;font-size:12px;line-height:1.4;color:#0b66c3;background:#eef3fb;border:1px solid #d6e3f3;border-radius:6px;padding:2px 9px;margin:0 6px 6px 0;text-decoration:none;white-space:nowrap;",
  srcMedia: "color:#7a818c;font-weight:600;",
  link: "color:#0b66c3;text-decoration:none;",
  footer: "text-align:center;font-size:12px;color:#9aa1ac;margin:18px 0 0;",
};

// Parse a source line ("- [Media] Title — https://gnews.ref/3") into its parts.
// The title itself may contain dashes/colons, so we anchor on the trailing URL and
// treat everything before it as the label, then split off a leading "[Media]".
function parseSource(line, map) {
  const body = line.replace(/^[-•·]\s*/, "");
  const um = body.match(/(https?:\/\/\S+)\s*$/);
  let url = "";
  let label = body;
  if (um) {
    url = expandUrls(um[1], map);
    label = body.slice(0, um.index).replace(/[\s—–-]+$/, "").trim();
  }
  const mm = label.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (mm) return { media: mm[1], title: mm[2].trim(), url, label };
  return { media: "", title: label, url, label };
}

// Full "[Media] Title" link — used for standalone list items (e.g. agenda) where
// the line is content, not one of many sources to compress.
function renderSourceLink(line, map) {
  const { media, title, url, label } = parseSource(line, map);
  const inner = media
    ? `<span style="${S.srcMedia}">[${esc(media)}]</span> ${esc(title)}`
    : esc(label);
  return url ? `<a href="${esc(url)}" style="${S.link}">${inner}</a>` : inner;
}

const isSourceLine = (t) => /^[-•·]\s*\[/.test(t); // "- [Media] ..."
const isAnyDashLine = (t) => /^[-•·]\s+/.test(t);

// Compress a run of source lines into a wrapped row of outlet chips. Each chip is
// a plain styled <a> (works everywhere): label = media name, full title in the
// hover tooltip, the long URL lives only in href. Wrapped in <details> so capable
// clients can fold it away entirely.
function renderSources(lines, map, summaryLabel) {
  const chips = lines
    .map((l) => {
      const { media, title, url, label } = parseSource(l, map);
      const text = media || label || "链接";
      const tip = title || label || "";
      const href = url ? `href="${esc(url)}" ` : "";
      return `<a ${href}title="${esc(tip)}" style="${S.chip}">${esc(text)}</a>`;
    })
    .join("");
  return (
    `<details style="${S.details}">` +
    `<summary style="${S.summary}">${esc(summaryLabel)} (${lines.length})</summary>` +
    `<div style="${S.chipWrap}">${chips}</div>` +
    `</details>`
  );
}

// Render markers like "⭐ 对其本人重要 ｜ 🔄 续报(+1 家新跟进)" into pill badges.
function renderBadges(marker) {
  const parts = marker.split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  return (
    `<div style="${S.badges}">` +
    parts.map((p) => `<span style="${S.badge}">${esc(p)}</span>`).join("") +
    `</div>`
  );
}

const MARKER_RE = /[⭐🔄🔗🏛️🆕]|对其本人重要|续报|两人同框|官方口径|次要/;

function renderHtml(raw, map) {
  const lines = raw.split("\n");
  const out = [];
  let sectionOpen = false;
  let cardOpen = false;

  const closeCard = () => { if (cardOpen) { out.push("</div>"); cardOpen = false; } };
  const closeSection = () => { closeCard(); if (sectionOpen) { out.push("</div>"); sectionOpen = false; } };
  const openSection = (title) => {
    closeSection();
    out.push(`<div style="${S.section}">`);
    if (title) out.push(`<div style="${S.sectionTitle}">${esc(title)}</div>`);
    sectionOpen = true;
  };
  const ensureSection = () => { if (!sectionOpen) openSection(""); };
  const openCard = () => { closeCard(); ensureSection(); out.push(`<div style="${S.card}">`); cardOpen = true; };

  let titleDone = false;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;

    // Title (first 每日简报 line)
    if (!titleDone && /每日简报/.test(t)) {
      out.push(`<h1 style="${S.h1}">${esc(t)}</h1>`);
      titleDone = true;
      continue;
    }

    // Footer
    if (/^由\s*follow-gass\s*生成/.test(t)) {
      closeSection();
      out.push(`<p style="${S.footer}">${esc(t)}</p>`);
      continue;
    }

    // Section divider: —— 今日三大事 ——
    let m = t.match(/^—{2,}\s*(.+?)\s*—{2,}$/);
    if (m) { openSection(m[1]); continue; }

    // Person heading: ## Gabriel Attal
    m = t.match(/^#{1,6}\s+(.+)$/);
    if (m) { closeCard(); ensureSection(); out.push(`<div style="${S.h3}">${esc(m[1])}</div>`); continue; }

    // Numbered headline item: "1. ⭐ ... ｜ 🔄 ..."
    m = t.match(/^(\d+)[.)、]\s*(.+)$/);
    if (m) {
      openCard();
      const rest = m[2];
      if (MARKER_RE.test(rest)) {
        // markers on this line; headline is the next non-empty line
        out.push(renderBadges(rest));
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length) {
          out.push(`<div style="${S.headline}">${esc(lines[j].trim())}</div>`);
          i = j;
        }
      } else {
        out.push(`<div style="${S.headline}">${esc(rest)}</div>`);
      }
      continue;
    }

    // Bullet item in 其余动态: "• ⭐ ... : headline"  or  "• 次要动态(...):"
    m = t.match(/^[•·]\s*(.+)$/);
    if (m) {
      openCard();
      const content = m[1];
      const ci = content.search(/[：:]/);
      if (ci !== -1 && MARKER_RE.test(content.slice(0, ci))) {
        out.push(renderBadges(content.slice(0, ci)));
        const headline = content.slice(ci + 1).trim();
        if (headline) out.push(`<div style="${S.headline}">${esc(headline)}</div>`);
      } else {
        out.push(`<div style="${S.subhead}">${esc(content.replace(/[：:]\s*$/, ""))}</div>`);
      }
      continue;
    }

    // Sources header: "来源:" then a run of "- [Media] ..." lines
    if (/^来源[：:]\s*$/.test(t)) {
      const run = [];
      let j = i + 1;
      while (j < lines.length && isAnyDashLine(lines[j].trim())) { run.push(lines[j].trim()); j++; }
      if (run.length) { ensureSection(); out.push(renderSources(run, map, "来源")); i = j - 1; }
      continue;
    }

    // Bare run of "- [Media] ..." source lines (e.g. 次要动态 list, no 来源 header)
    if (isSourceLine(t)) {
      const run = [t];
      let j = i + 1;
      while (j < lines.length && isSourceLine(lines[j].trim())) { run.push(lines[j].trim()); j++; }
      ensureSection();
      out.push(renderSources(run, map, "来源"));
      i = j - 1;
      continue;
    }

    // Lone dash list item that is NOT a media source (e.g. agenda "- 据 … 报道 … url"):
    // keep visible, just embed the link.
    if (isAnyDashLine(t)) {
      ensureSection();
      out.push(`<p style="${S.para}">${renderSourceLink(t, map)}</p>`);
      continue;
    }

    // Cross-source comparison line
    if (/^(跨源对比|小对比|对比)[：:]/.test(t)) {
      ensureSection();
      out.push(`<p style="${S.compare}">${esc(t)}</p>`);
      continue;
    }

    // Note / agenda (a)(b) subheaders
    if (/^注[：:]/.test(t)) { ensureSection(); out.push(`<p style="${S.note}">${esc(t)}</p>`); continue; }
    if (/^\([ab]\)/.test(t)) { ensureSection(); out.push(`<div style="${S.subhead}">${esc(t)}</div>`); continue; }

    // Default body paragraph (linkify any leftover placeholder, just in case)
    ensureSection();
    const safe = esc(t).replace(/https:\/\/gnews\.ref\/(\d+)/g, (mm2, n) =>
      map[n] ? `<a href="${esc(map[n])}" style="${S.link}">链接 ↗</a>` : mm2);
    out.push(`<p style="${S.para}">${safe}</p>`);
  }

  closeSection();

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="${S.body}"><div style="${S.wrap}">${out.join("")}</div></body></html>`
  );
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const fileFlag = process.argv.indexOf("--file");
  const raw = fileFlag !== -1
    ? await readFile(process.argv[fileFlag + 1], "utf-8")
    : await readStdin();

  const map = await loadUrlMap();
  const text = expandUrls(raw, map);

  let config = { delivery: { method: "stdout" } };
  if (existsSync(CONFIG_PATH)) { try { config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")); } catch {} }
  const d = config.delivery || { method: "stdout" };

  if (d.method === "email") {
    await loadEnvFile();
    const key = process.env.RESEND_API_KEY;
    if (!key || !d.email) { console.error("email: missing key or address; printing instead"); console.log(text); return; }
    let html;
    try { html = renderHtml(raw, map); } catch (e) { console.error("html render failed; sending text only", e.message); }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Attal & Séjourné Digest <onboarding@resend.dev>",
        to: [d.email],
        subject: `Attal & Séjourné 每日简报 — ${new Date().toLocaleDateString("fr-FR")}`,
        ...(html ? { html } : {}),
        text,
      }),
    });
    if (!res.ok) { console.error(`email failed ${res.status}; printing instead`); console.log(text); }
    else console.error("delivered via email");
    return;
  }

  // stdout (default)
  console.log(text);
}

main().catch((e) => { console.error("deliver error", e.message); process.exit(1); });
