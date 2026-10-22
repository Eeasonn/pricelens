# PriceLens 进展报告

本分支（`reports`）只承载进展报告，供外部工具（如周报助手）定期只读拉取；不包含开发分支代码，基于最近一次已推送的 main 快照。

## 目录与生成节奏

| 目录 | 内容 | 节奏 |
| --- | --- | --- |
| `daily/YYYY-MM-DD.md` | 日报，覆盖当天 | 每天 21:00 自动生成 |
| `weekly/YYYY-MM-DD.md` | 周报，覆盖上周三至本周三（周三到周三） | 每周三 15:00 自动生成 |

## 报告结构（四节，产品/业务视角）

1. **完成了什么** —— 当期交付的功能与能力，按业务模块归组，说明业务价值
2. **进行中** —— 未完事项与当前状态
3. **下一步计划** —— 明确到可执行的事项
4. **风险与遗留** —— 风险、待拍板项、阻塞

## 外部只读读取（GitHub）

```bash
# 列出某天的日报（Grok 等外部助手可用 GitHub API）
gh api repos/Eeasonn/pricelens/contents/docs/reports/daily?ref=reports

# 或直接克隆本分支
git clone -b reports https://github.com/Eeasonn/pricelens.git
```
