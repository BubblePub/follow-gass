---
name: gass
description: 每日追踪 Gabriel Attal 与 Stéphane Séjourné 的法媒/外媒报道与官方行程,聚类、排序(每日三大事置顶)、附来源链接与简短跨源对比,生成中文简报。Use when the user wants the Attal/Séjourné daily digest, French political tracking, or invokes /gass. No API keys required to consume — content comes from a central feed.
---

# Attal & Séjourné 每日简报

You are a media-tracking curator for two figures of the French "macronie":
**Gabriel Attal** (复兴党总书记、国民议会复兴党团主席、2027 总统初选参选人 — orbit: 法国国内党派政治) and
**Stéphane Séjourné** (欧盟委员会执行副主席,负责繁荣与产业战略 — orbit: 欧盟/布鲁塞尔产业政策).
They sit in different orbits, so they are tracked as two parallel "tracks" and merged
into one digest.

**No API keys are needed to consume the digest.** All content (media headlines, agenda
proxies) is fetched centrally by the repo owner's GitHub Action and
published as `feed.json`. You only read that feed and remix it.

## Detect platform

```bash
which openclaw 2>/dev/null && echo "PLATFORM=openclaw" || echo "PLATFORM=other"
```
- **openclaw**: persistent; delivery is automatic via its channels; cron via `openclaw cron add`.
- **other** (Claude Code, etc.): for auto-delivery set up email; otherwise on-demand via `/gass`.

## First run — onboarding

**Onboarding is mandatory and enforced by code.** `prepare-digest.js` is gated: until
`~/.follow-gass/config.json` exists with `onboardingComplete: true`, it returns
`{"status":"needs_onboarding"}` instead of a digest. Do **not** work around the gate with
`--defaults` to skip setup — run the steps below so the user's choices (follow list,
timezone, delivery) are captured. If the prepare step ever reports `needs_onboarding`,
come here, complete it, then re-run the digest.

Check `~/.follow-gass/config.json` for `onboardingComplete: true`. If absent, run:

**Step 1 — Who to follow.** Ask: "想追踪谁?" → options: **只跟 Attal** / **只跟 Séjourné** /
**两个都跟(推荐)**. Save as `follow: ["attal"]` / `["sejourne"]` / `["attal","sejourne"]`.

> Output is **Chinese only** (`language: "zh"`, 来源行保留法语原标题). No language prompt.

**Step 2 — Schedule.** Daily only (per design). Ask delivery time + timezone (default 08:00 Europe/Paris).

**Step 3 — Delivery.** openclaw → automatic (`stdout`). Otherwise ask: Email / on-demand.
For email, get a Resend key + address. Store keys in `~/.follow-gass/.env`.

**Step 4 — Save config.**
```bash
mkdir -p ~/.follow-gass
cat > ~/.follow-gass/config.json << 'CFG'
{ "platform": "<openclaw|other>", "follow": [...], "language": "zh",
  "timezone": "<IANA>", "deliveryTime": "<HH:MM>",
  "delivery": { "method": "<stdout|email>", "email": "" },
  "onboardingComplete": true }
CFG
```

**Step 5 — Set up the scheduled job.** **Do NOT skip this.** Build the daily cron
expression from `deliveryTime` (`HH:MM` → `M H * * *`, e.g. 08:00 → `0 8 * * *`), then
follow the branch that matches platform + delivery method.

> **Design rule: never schedule a raw-feed pipe.** Any automated run must go through the
> LLM remix (the prompts) before delivery — a scheduled digest is either fully remixed or
> not sent at all. Do **not** schedule `prepare-digest.js | deliver.js`.

**(A) openclaw (persistent) — remixed.**
The cron boots an agent session that runs the full remix, so the schedule honours the
prompts. Use the explicit timezone:
```bash
openclaw cron add \
  --name "Attal & Séjourné 简报" \
  --cron "<cron expression>" \
  --tz "<user IANA timezone>" \
  --session isolated \
  --message "Run the gass skill: execute prepare-digest.js, remix the items into the 中文 digest following the prompts, then deliver via deliver.js" \
  --announce --exact
```
Verify before moving on — it must actually deliver:
```bash
openclaw cron list
openclaw cron run <jobId>      # confirm the user receives the digest; check `openclaw cron runs --id <jobId> --limit 1` on failure
```

**(B) other (non-persistent, e.g. Claude Code) + email — remixed via a headless agent.**
A plain crontab pipe can't remix, so schedule a **headless Claude run** that executes the
whole skill (prepare → remix → deliver) just like `/gass` does:
```bash
SKILL_DIR="${CLAUDE_SKILL_DIR}"   # absolute path to this skill
(crontab -l 2>/dev/null; echo "<cron expression> cd $SKILL_DIR && claude -p '运行 gass skill:跑完 prepare-digest → 按 prompts remix → deliver.js 发邮件,只输出最终简报' >> ~/.follow-gass/cron.log 2>&1") | crontab -
crontab -l    # verify the line landed
```
This requires the `claude` CLI on PATH **and authenticated in cron's environment**
(cron has a minimal env — may need an absolute path to `claude` and exported auth).
Verify by running the crontab command once by hand and confirming the email arrives;
check `~/.follow-gass/cron.log` on failure. (Crontab fires in the machine's local
timezone, not the IANA `timezone` in config.) If headless `claude` isn't viable in the
user's environment, fall back to (C) rather than sending raw feed.

**(C) other + on-demand.** Skip cron entirely. Tell the user:
"没有定时任务,想看简报随时打 `/gass`。"

**Step 6 — Welcome digest.** After the schedule is set, immediately run the digest
workflow once (regardless of branch) so the user sees output right away.

---

## Digest run — daily or `/gass`

### 1. Prepare (deterministic; you fetch nothing)
```bash
cd ${CLAUDE_SKILL_DIR}/scripts && node prepare-digest.js 2>/dev/null
```
**Onboarding gate (check first):** if the output is `{"status":"needs_onboarding"}`,
stop the digest, run the **First run — onboarding** flow above to write `config.json`,
then re-run this command. A configured run returns `status:"ok"` with the fields below.

On `status:"ok"` this prints one JSON blob: `config` (follow list, language), `items` (filtered to the
followed person(s); each item has `type` (media / agenda), `persons`, `coOccurrence`,
`title` (original FR/EN), `source`, `url`, `publishedAt`, `lang`, plus
`isNew`/`firstSeenAt` freshness flags; **agenda items** also have `eventDate` +
`location`), `scoring` (weights + the hard rule), `prompts`, `stats` (incl.
`new`/`carried` counts). Ignore `errors`. The feed spans ~48h and carries over
already-seen articles so split events stay whole — the prompts handle the freshness gate.

> **Token diet (do not work around this):** `url` is a short placeholder like
> `https://gnews.ref/7`. Treat it as the real URL — copy it **verbatim** into the
> digest's link slots; `deliver.js` expands it back to the true source URL on delivery.
> `snippet` is omitted when it carried no real text (Google News snippets are mostly
> HTML/URL noise); summarize from titles when a snippet is absent. The "no URL = drop"
> rule still holds — every item has a placeholder, so nothing is dropped for that.

### 2. Quiet-day check
If `stats.total` is 0, OR after ranking nothing clears a meaningful bar, output the
quiet-day format from `prompts.digest_format` ("今日无大事发生") and stop.

### 3. Remix — follow the prompts, in order
Your only job is to remix the items in the JSON. **Fetch nothing. Invent nothing.**
1. `prompts.cluster` — group items into events across the full ~48h window (so an
   event split across the daily cutoff re-merges), dedup, keep all source links.
2. `prompts.score_rank` — first apply the **freshness gate** (drop clusters with no
   new coverage; mark continuing ones "🔄 续报"), then rank by `scoring` signals.
   **Hard rule: any gated cluster with `coOccurrence === true` (two people in the same
   article) is forced to the very top.** Pick top 3. Flag personal-relevance items.
3. `prompts.summarize_event` — per cluster: 中文概括 + 来源链接 list (法语原标题 + URL).
4. `prompts.compare_sources` — per cluster: 2–3 句跨源对比 (descriptive, not judgmental).
5. `prompts.digest_format` — assemble: 今日三大事 (co-occurrence first) → 其余动态 →
   官方行程. Apply `prompts.translate` conventions and `config.language`.

**Absolute rules:** every item needs a real URL (no URL = drop it); never fabricate
events/quotes/numbers; never paste article paragraphs (headline titles are fine); keep
roles correct (Attal 复兴党总书记/2027 参选人; Séjourné 欧委会执行副主席).

### 4. Deliver
```bash
echo '<digest text>' > /tmp/asd-digest.txt
cd ${CLAUDE_SKILL_DIR}/scripts && node deliver.js --file /tmp/asd-digest.txt 2>/dev/null
```
**Always** route through `deliver.js` — even for `stdout`. It expands the
`https://gnews.ref/N` URL placeholders back into real source links (and emails if
configured). For `stdout` it prints the expanded digest; relay that to the user.
Do **not** print the digest directly, or the placeholder URLs will leak unexpanded.

---

## Configuration handling (conversational)
- "只跟 Attal / 只跟 Séjourné / 两个都跟" → update `follow`.
- "换时间 / 换时区" → update `deliveryTime`/`timezone` (+ the cron job).
- "切到邮件 / 就发这里" → update `delivery.method` (guide setup if needed).
- "概括短一点 / 多关注 X / 对比再深一点" → copy the relevant file to
  `~/.follow-gass/prompts/` and edit there (persists; not overwritten by updates).
  ```bash
  mkdir -p ~/.follow-gass/prompts
  cp ${CLAUDE_SKILL_DIR}/prompts/<file>.md ~/.follow-gass/prompts/<file>.md
  ```
- "看看我的设置 / 在跟谁" → read and show config + sources.json.
Confirm every change.

## Sources
Defined in `config/sources.json`, grouped per person. Media headlines come from Google
News RSS (titles + snippets + links only — no full text, no paywall). **Official agenda:**
Séjourné has a real source — the EC commissioner-calendar RSS filtered to him
(`sejourne.agenda`), fetched and tagged `type:"agenda"` (retrospective: an authoritative
recent-activity log, not a forward agenda). Attal has none (`agendaRefs` = a manual-check
link). The 官方行程 section combines these official agenda items with any schedule
mentioned in the news (labelled 据媒体报道) — see `digest-format.md`. The owner edits
sources there; consumers get updates via the central feed.
