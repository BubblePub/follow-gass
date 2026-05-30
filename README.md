# follow-gass

每日追踪 **Gabriel Attal** 与 **Stéphane Séjourné** 的法媒/外媒报道、官方行程与社媒动态,
自动聚类、按重要程度排序,生成一份中文简报。

> 理念借鉴 [follow-builders](https://github.com/zarazhangrui/follow-builders),
> 把"抓取层 / prompt 层 / 投递层"分离,但针对政治人物追踪做了专门设计:
> **跨源框架对比**、**两人同框强制置顶**、**每日三大事**。

## 它做什么

- **两条 track**:Attal(法国国内党派政治 / 2027 总统初选)与 Séjourné(欧盟 / 布鲁塞尔产业政策)
  身处不同舆论场,分别抓取、各自打分,最后合并成一份简报。
- **聚类**:同一事件的多家报道归为一组。
- **排序**:覆盖广度、信源权重、主角度(占比)、事件类型、时效综合打分,取**每日三大事**置顶。
- **硬规则**:一篇文章同时提到两人(同一 URL 出现在两人的查询结果里)→ **强制置顶**,高于一切。
- **每条事件**:中文概括 → 来源链接 list(保留法语原标题)→ 2–3 句简短跨源对比。
- **无大事**:直接写"今日无大事发生"。

## 架构(中央 feed 模型)

```
GitHub Action (每天) ──> generate-feed.js ──> feed.json (提交回仓库)
                                                   │
你 fork 仓库、跑 Action = 维护这个公开 feed         │
                                                   ▼
别人 clone 成 skill ──> prepare-digest.js 读取公开 feed + 本地 config + prompts
                                  │
                                  ▼
                      agent 按 prompts 聚类→排序→概括→对比→排版
                                  │
                                  ▼
                          deliver.js(stdout / Email)
```

**消费端零 API key、零依赖**——内容都来自你公开的 `feed.json`。

## 信源

- **媒体标题**:Google News RSS(只取标题 + 摘要 + 链接;不抓全文,绕开付费墙,无需 key)。
- **官方/行程**:Google News 的 `site:` 代理查询;官方页面(欧委会委员页、复兴党新闻)留有抓取钩子,
  需按页面结构自行补全选择器(见 `config/sources.json` 注释)。
- **社媒**:X(需在 GitHub Secret 配 `X_BEARER_TOKEN`;不配则自动跳过)。

## 快速开始

1. **Fork** 本仓库到你的账号。
2. 编辑 `scripts/prepare-digest.js` 顶部的 `REPO_RAW`,把 `<owner>` 换成你的 GitHub 用户名。
3. (可选)想要 X 动态:仓库 Settings → Secrets → Actions 加 `X_BEARER_TOKEN`。
4. 打开 **Actions**,手动跑一次 `Generate Feed`,确认生成了 `feed.json`。之后每天自动更新。
5. 把仓库 clone 成 skill:
   ```bash
   git clone https://github.com/<你的用户名>/follow-gass ~/.claude/skills/follow-gass
   cd ~/.claude/skills/follow-gass/scripts && npm install
   ```
6. 在 agent 里说「setup follow-gass」或 `/digest`,按引导选择跟谁、投递方式(输出固定为中文)。

## 自定义

所有 prompt 都是纯文本(`prompts/*.md`),对话式即可改:「概括短一点」「对比再深一点」
「多关注 2027 初选」。改动会复制到 `~/.follow-gass/prompts/` 持久保存,不被中央更新覆盖。
排序权重在 `config/scoring.json`,信源在 `config/sources.json`。

## 注意

- **版权**:只抓标题/摘要并链接到原文,绝不复制文章正文。简报里媒体标题保留原文、其余为中文转述。
- **中立**:跨源对比只做**描述性**说明(谁侧重什么),不替读者下政治判断。
- 官方议程的精确抓取是最脆弱的一环,首次使用建议先验证 `feed.json` 里的 agenda 条目是否如预期。

## License

MIT
