#!/usr/bin/env node

// ============================================================================
// follow-gass — Deliver
// ============================================================================
// Sends the finished digest text to the configured channel.
//   stdout   -> print (default; the agent shows it in chat)
//   email    -> via Resend            (needs RESEND_API_KEY + config.delivery.email)
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

// Inverse of prepare-digest.js's URL diet: expand the `https://gnews.ref/<n>`
// placeholders the model copied into the digest back into the real source URLs.
// Missing/garbled map => leave the text untouched (graceful, never blocks delivery).
async function expandUrls(text) {
  if (!existsSync(URLMAP_PATH)) return text;
  let map = {};
  try { map = JSON.parse(await readFile(URLMAP_PATH, "utf-8")); } catch { return text; }
  return text.replace(/https:\/\/gnews\.ref\/(\d+)/g, (m, n) => map[n] || m);
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
  const text = await expandUrls(raw);

  let config = { delivery: { method: "stdout" } };
  if (existsSync(CONFIG_PATH)) { try { config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")); } catch {} }
  const d = config.delivery || { method: "stdout" };

  if (d.method === "email") {
    await loadEnvFile();
    const key = process.env.RESEND_API_KEY;
    if (!key || !d.email) { console.error("email: missing key or address; printing instead"); console.log(text); return; }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Attal & Séjourné Digest <onboarding@resend.dev>",
        to: [d.email],
        subject: `Attal & Séjourné 每日简报 — ${new Date().toLocaleDateString("fr-FR")}`,
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
