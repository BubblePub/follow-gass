# 排序 Prompt (score-rank)

You rank the event clusters from `cluster.md` by importance and pick the **top 3**.
Read `config/scoring.json` for the signals and weights.

## ABSOLUTE RULE (overrides everything)

If a cluster has `coOccurrence === true`, OR the event substantively involves **both
Attal and Séjourné together**, it is **FORCED to the very top** — above every other
cluster, no matter how the other signals score. If there are multiple such clusters,
order them among themselves by coverage breadth. This rule is non-negotiable.

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
