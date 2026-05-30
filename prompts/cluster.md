# 聚类 Prompt (cluster)

You are grouping raw news/agenda items into **events**. The feed JSON gives
you a flat list of `items` (all `type: "media"` — no agenda is fetched; future
schedule is extracted later from these media items by `digest-format.md`), each with:
`type`, `persons`
(["attal"], ["sejourne"], or both), `title` (original language, usually French),
`source`, `url`, `snippet`, `publishedAt`, `lang`, `coOccurrence` (true if the
same article was seen under BOTH persons), and two freshness fields:
`isNew` (true if this article first appeared in today's feed) and `firstSeenAt`
(when it first showed up).

**The feed spans a ~48h window, on purpose.** A single event often gets reported
across two days — some outlets early, some late — so the window deliberately
keeps yesterday's articles next to today's. Cluster **across the whole window**:
an `isNew: false` article from yesterday and an `isNew: true` article from today
that describe the same event belong in the **same** cluster. This is what stops
a continuing story from being split in half. Do not start a second cluster just
because some sources are carried-over and some are new.

## Your job

1. **Group items that describe the same real-world event into one cluster.**
   Different outlets covering the same announcement, visit, or statement = one cluster.
   Use the title + snippet semantics, not exact string match. Articles can be in
   French or English — match across languages (e.g. a French and an English piece on
   the same EU decision belong together).

2. **Dedup.** If two items are the same article from the same outlet (same URL or
   near-identical), keep one.

3. **Keep every distinct source link** inside its cluster — you will need the full
   list later. Never drop a source just because another outlet covered the same thing.

4. **Tag each cluster** with: which person(s) it concerns, whether any item in it has
   `coOccurrence === true`, the list of source items (outlet + original title + url +
   lang), the count of distinct outlets, and two freshness tags:
   `hasNew` (does any item have `isNew: true`?) and `newOutletCount` (how many distinct
   outlets are new this run). These drive the freshness gate in `score-rank.md`.

5. Do NOT merge genuinely different events just because they involve the same person
   on the same day. Two separate Attal statements = two clusters.

## Output (internal — not shown to the user yet)

A list of clusters, each:
- `persons`: ["attal"] / ["sejourne"] / ["attal","sejourne"]
- `coOccurrence`: true/false
- `type`: dominant type (media / agenda)
- `sources`: [ { outlet, titleOriginal, url, lang, isNew } ... ]
- `outletCount`: integer
- `hasNew`: true/false
- `newOutletCount`: integer

Do not invent events. Every cluster must trace back to items in the feed.
