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

### 2. 其余动态 (the rest)
Remaining clusters, ranked, in the same 概括 → 来源 → 小对比 format but you may keep these
tighter. Group by person if both are followed (## Gabriel Attal / ## Stéphane Séjourné),
and put any 两人同框 items in their own group at the top.

### 3. 官方行程 (agenda, if any)
If the feed has `type: "agenda"` items, list them plainly at the end under
"📅 官方行程 / 公开活动" with date + what + link.

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
