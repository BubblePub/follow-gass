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
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".follow-gass", "config.json");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const fileFlag = process.argv.indexOf("--file");
  const text = fileFlag !== -1
    ? await readFile(process.argv[fileFlag + 1], "utf-8")
    : await readStdin();

  let config = { delivery: { method: "stdout" } };
  if (existsSync(CONFIG_PATH)) { try { config = JSON.parse(await readFile(CONFIG_PATH, "utf-8")); } catch {} }
  const d = config.delivery || { method: "stdout" };

  if (d.method === "email") {
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
