# 简报排版 Prompt (digest-format)

Assemble the final daily digest in **Chinese**. The reader gets this every morning.

## 标题
以今日日期开头:

  Attal & Séjourné 每日简报 — [YYYY年M月D日]

(若用户在 config 里只 follow 一个人,则只写那个人的名字。)

## 结构

### 1. 今日三大事 (headline section)
The top-3 clusters from `score-rank.md`, in order. **Co-occurrence events (两人同框)
come first** and get a clear marker, e.g. "🔗 两人同框". For each of the three:
- 事件概括 (from summarize-event)
- 来源 list (with 法语原标题 + 链接)
- 2–3 句对比 (from compare-sources)

Mark any cluster flagged on the personal-relevance axis with "⭐ 对其本人重要".
Mark a continuing story (from `score-rank.md`) with "🔄 续报(+N 家新跟进)" and show
its full source list (carried-over + new together) so the event reads as one whole
thing, not a fragment.

### 2. 其余动态 (the rest)
Remaining clusters, ranked, in the same 概括 → 来源 → 小对比 format but you may keep these
tighter. Group by person if both are followed (## Gabriel Attal / ## Stéphane Séjourné),
and put any 两人同框 items in their own group at the top.

### 3. 官方行程 / 公开活动
This section has **two sources**, kept visually separate:

**(a) 官方日程(权威)** — items in the feed with `type: "agenda"`. These come from the
EC commissioner-calendar RSS (currently Séjourné only) and are **official**, so they
need NO "据媒体报道" tag. Each agenda item has `eventDate` (the real date, "YYYY-MM-DD"),
`title` (the engagement), `location`, and `url`. List them under
"📅 官方行程 / 公开活动 · 官方日程", **sorted by `eventDate`**, newest first, as:
- `[eventDate] 中文转述 the engagement — location` + the link.
- Note for the reader that this log is **回溯式**(EC 在事件前后才登记),所以多为近期已
  发生的官方活动,不一定包含未来安排。
- Prefer items where `isNew` is true (newly published since last digest) but you may
  include recent ones for context.

**(b) 媒体提及的日程(参考)** — concrete engagements mentioned in the NEWS items
(`type: "media"`), useful especially for Attal, who has no official feed. Include one
ONLY if a title/snippet states a specific activity with a date and/or place and the
nature of the event (e.g. "Attal sera à Lille mardi"). Render as
"📅 …·据媒体报道" with: 中文转述 (what/when/where) + "(据 [outlet] 报道)" + link.

**Hard limits (no exceptions):**
- Only use what is explicitly present (agenda fields, or news title/snippet). **Never
  infer or invent a date, place, or event.** Vague timing ("bientôt") → say so verbatim.
- Keep (a) and (b) distinct: official agenda is authoritative; media-mentioned is "据…报道".
- Don't duplicate: if an official agenda item and a news mention describe the same
  engagement, list it once under (a).
- If neither source yields anything, **omit the section** (don't pad). You may add:
  "官方行程:本期无官方日程更新;可在官方页面手动核验(见 sources.json)。"

## 无大事处理 (quiet day)
If `score-rank.md` produced no clusters that clear a meaningful bar (e.g. only a couple
of passing-mention, low-tier items, or nothing at all), do NOT pad. Output exactly:

  Attal & Séjourné 每日简报 — [日期]

  今日无大事发生。

  (可附 1–2 条次要动态链接,若有。)

## 语言
- 全中文,但媒体来源行保留法语/英语原标题。

## 绝对规则
- 每条内容必须有真实链接;无链接不收录。
- 绝不杜撰事件、引语、数字。只用 feed 里的标题与 snippet。
- 不复制原文段落。标题原文可以,文章正文不可以。
- 结尾加一行:
  "由 follow-gass 生成 · 来源链接均指向原始报道"
