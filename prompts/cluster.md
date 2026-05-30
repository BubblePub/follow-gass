# 聚类 Prompt (cluster)

You are grouping raw news/agenda items into **events**. The feed JSON gives
you a flat list of `items`, each with: `type` (media / agenda), `persons`
(["attal"], ["sejourne"], or both), `title` (original language, usually French),
`source`, `url`, `snippet`, `publishedAt`, `lang`, and `coOccurrence` (true if the
same article was seen under BOTH persons).

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
   lang), and the count of distinct outlets.

5. Do NOT merge genuinely different events just because they involve the same person
   on the same day. Two separate Attal statements = two clusters.

## Output (internal — not shown to the user yet)

A list of clusters, each:
- `persons`: ["attal"] / ["sejourne"] / ["attal","sejourne"]
- `coOccurrence`: true/false
- `type`: dominant type (media / agenda)
- `sources`: [ { outlet, titleOriginal, url, lang } ... ]
- `outletCount`: integer

Do not invent events. Every cluster must trace back to items in the feed.
