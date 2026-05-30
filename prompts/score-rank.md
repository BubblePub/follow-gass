# 排序 Prompt (score-rank)

You rank the event clusters from `cluster.md` by importance and pick the **top 3**.
Read `config/scoring.json` for the signals and weights.

## FRESHNESS GATE (apply first, before ranking)

The feed spans ~48h and carries over articles already shown in a previous digest,
so the same event can reappear. To avoid repeating yesterday's digest:

- A cluster qualifies for today's digest **only if `hasNew === true`** (it gained at
  least one new article/outlet since the last run). **Drop clusters where every source
  is carried-over** (`hasNew === false`) — they were already covered and have nothing
  new; do not re-show them.
- A qualifying cluster that mixes new **and** carried-over sources is a **continuing
  story (续报)**. Keep its **full** source list (old + new) so the reader gets the
  whole event with context, and mark it "🔄 续报(+N 家新跟进)" where N =
  `newOutletCount`. This is the payoff of carry-over: the event is shown whole, not
  as an orphaned sliver of late-reporting outlets.
- The gate is about *freshness*, not importance — apply it before the scoring below.
- **Fallback:** if the feed items carry no `isNew` field at all (an older feed format),
  skip the gate entirely and treat every cluster as eligible.

## ABSOLUTE RULE (overrides everything, among gated clusters)

If a cluster has `coOccurrence === true`, OR the event substantively involves **both
Attal and Séjourné together**, it is **FORCED to the very top** — above every other
cluster, no matter how the other signals score. If there are multiple such clusters,
order them among themselves by coverage breadth. This rule is non-negotiable.
(It applies only to clusters that pass the freshness gate; a co-occurrence event with
no new coverage was already shown and is not forced up again.)

## Scoring the rest

For every other cluster, weigh these signals (see scoring.json for weights):

- **Coverage breadth** — how many distinct outlets covered it. Strongest signal.
- **Source tier** — tier-1 outlets (Le Monde, Reuters, AFP, Politico, Les Échos…)
  count more than aggregators or tabloids.
- **Centrality (占比)** — is the person the protagonist, or only mentioned in passing?
  Protagonist = high; passing mention = low.
- **Event type** — policy/personnel/official-position/law/presidential-move/EU-decision
  rank high; photo ops and ceremonial appearances rank low.
- **Velocity** — breaking or fast-developing today ranks higher.

Produce a single ranked list, then take the **top 3** as the headline section.

## Personal-relevance flag (separate axis)

After ranking, also flag any cluster that matters strongly to the person's own
trajectory (see `personalRelevanceAxis` in scoring.json — e.g. anything tied to
Attal's 2027 bid, or Séjourné's standing in the Commission), **even if it didn't make
top-3 on public importance**. These get a "⭐ 对其本人重要" marker in the digest so the
reader doesn't miss them.

## Output (internal)

- `headline`: the top 3 clusters, in order (co-occurrence clusters first if any)
- `rest`: remaining clusters, ranked
- `personalFlags`: cluster ids flagged on the personal-relevance axis
