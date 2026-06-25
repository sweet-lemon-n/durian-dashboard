# AGENTS.md

本文件是 AI Agent 在本项目中工作的长期规则。适用于 Codex、Cursor、Claude Code 等工具。

只记录长期稳定的信息：项目结构、开发规范、工作流程、文档维护规则。具体业务背景、统计口径、历史决策写入 `MEMORY.md`；临时任务、Bug、待办写入 `TASKS.md`。

## 项目简介

本项目是榴莲运输数据看板，用于展示订单、分柜、物流、温度、新闻和货柜流转等信息。系统主要从企业微信智能表格读取真实业务数据，并提供后台配置、智能解析录入、统计配置和多种看板页面。

核心目标：

- 让业务人员快速查看榴莲运输状态、到岸、签收、在途和异常信息。
- 通过企业微信智能表格作为主要数据源，尽量保留业务侧可编辑能力。
- 通过后台配置降低代码改动频率，例如新闻源、AI 解析、统计口径、流转字段映射。
- 让 AI Agent 能在长期迭代中稳定理解项目，不因上下文压缩或换工具而丢失关键规则。

## 技术栈

- 后端：Node.js、Express
- 前端：原生 HTML、CSS、JavaScript
- 认证：JWT、httpOnly Cookie、SQLite、better-sqlite3、bcryptjs
- 数据源：企业微信智能表格 API、运行时 JSON 配置、少量本地 SQLite
- 数据导入：xlsx
- 部署：Tencent Cloud Ubuntu Lighthouse、PM2、GitHub 拉取部署

## 项目目录说明

```text
.
├── server.js                 # Express 主服务和核心 API 路由
├── lib/
│   ├── auth.js               # JWT 鉴权和权限中间件
│   ├── db.js                 # SQLite 用户和审计日志
│   ├── wecom.js              # 企业微信智能表格 API 封装
│   ├── wecom-cache.js        # 企业微信数据内存快照缓存
│   ├── wecom-aggregate.js    # 企微数据源下的基础看板聚合
│   ├── flow-dashboard.js     # 货柜流转看板聚合
│   ├── board-routes.js       # 看板、后台配置、新闻、智能录入等路由
│   ├── runtime-config.js     # 运行时可编辑配置
│   ├── content-store.js      # board-content JSON 存取
│   └── news-fetcher.js       # 自动新闻抓取和缓存
├── public/
│   ├── index.html            # 基础总览看板
│   ├── index-flow.html       # 货柜流转看板
│   ├── index-tv.html         # TV 看板
│   ├── index-sentry.html     # 另一套视觉风格看板
│   ├── admin.html            # 后台管理页
│   ├── admin-sentry.html     # 另一套后台视觉风格
│   ├── admin-smartsheet.js   # 智能表格管理前端逻辑
│   ├── gantt.js              # 温度甘特图
│   └── login.html            # 登录页
├── scripts/                  # 初始化、建表、导入、校验脚本
├── docs/                     # 说明文档
├── data/                     # 运行时数据；多数文件不应提交
├── AGENTS.md                 # AI 工作规则
├── MEMORY.md                 # 项目长期记忆
└── TASKS.md                  # 当前任务和待办管理
```

## 开发规范

1. 优先理解现有代码和业务口径，再修改实现。
2. 保持改动聚焦，一次提交只解决一个清晰问题。
3. 不随意重构大型文件；如需重构，先说明原因和影响面。
4. 不把密钥、Cookie、Token、生产密码写入代码、文档或提交记录。
5. 不直接改动 `data/` 中的运行时数据，除非任务明确要求。
6. 企微智能表字段优先使用字段 ID 或后台配置映射，不要只依赖字段标题。
7. 对用户已修改但未提交的文件，必须先确认用途，不可擅自覆盖或回滚。
8. 新功能应尽量提供后台配置入口，减少以后改代码的频率。

## 代码规范

- JavaScript 使用 CommonJS 风格，保持与现有代码一致。
- 前端页面目前以单文件 HTML 内联 CSS/JS 为主，修改时遵循现有页面结构。
- 新增工具函数应放在最接近业务边界的位置，不为了抽象而抽象。
- 命名要直接表达业务含义，例如 `arrivalDate`、`domesticShipDate`、`signedDate`。
- 时间展示给用户时不要直接显示时间戳，应格式化为业务可读日期。
- 企业微信 DATE_TIME 写入值使用字符串形式的毫秒时间戳。
- 后端 API 成功响应应保持当前接口约定，不随意改变返回包裹结构。
- 修改 UI 时要验证不同视口下不重叠、不截断、不需要不必要滚动。

## AI 工作流程

AI Agent 接到需求后默认按以下流程工作：

1. 阅读 `AGENTS.md`，确认项目规则。
2. 阅读 `MEMORY.md`，确认业务背景、统计口径和历史决策。
3. 阅读 `TASKS.md`，确认当前任务、优先级和已知 Bug。
4. 用 `rg`、`rg --files`、`sed` 等工具快速定位相关代码。
5. 在动代码前说明将修改哪些文件和为什么。
6. 使用 `apply_patch` 进行手工代码或文档编辑。
7. 执行必要检查，例如 `node --check`、页面脚本语法检查、`git diff --check`。
8. 更新相关文档：长期事实进 `MEMORY.md`，任务状态进 `TASKS.md`。
9. 最后给出改动摘要、验证结果、未完成事项。

## 修改代码前必须执行的步骤

每次修改前至少执行：

```bash
git status --short
rg --files
```

然后根据任务类型继续检查：

- 后端 API：阅读 `server.js`、相关 `lib/*.js` 和调用方前端。
- 企微数据：阅读 `lib/wecom.js`、`lib/wecom-cache.js`、聚合模块和字段配置。
- 看板 UI：阅读目标 `public/*.html`，确认现有视觉和布局规则。
- 后台配置：阅读 `public/admin.html`、`lib/runtime-config.js`、相关路由。
- 统计口径：阅读 `docs/statistics-logic.md` 和 `MEMORY.md`。

禁止在未查看相关上下文的情况下直接猜测字段、接口或业务口径。

## 验证规范

根据改动选择合适验证：

```bash
node --check server.js
node --check lib/<changed-file>.js
node -e "const fs=require('fs'); const html=fs.readFileSync('public/<page>.html','utf8'); [...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].forEach(m=>new Function(m[1]));"
git diff --check
```

涉及真实企微数据或外部新闻接口时，优先使用已有缓存、mock 或只读接口验证。需要访问网络、生产 API 或写入智能表时，必须明确说明风险。

## 文档维护规则

- `AGENTS.md`：只写长期稳定的 AI 工作规则、技术栈、目录说明、开发规范。
- `MEMORY.md`：写代码无法直接推断的长期业务知识、统计口径、设计决策、数据结构说明。
- `TASKS.md`：写会变化的当前任务、待办、Bug、完成记录和优先级。
- 修改业务规则时，同步更新 `MEMORY.md`。
- 完成任务或发现新 Bug 时，同步更新 `TASKS.md`。
- 不把短期讨论、一次性排查过程、个人密码或密钥写入任何文档。

## 推荐工作流

```text
阅读 AGENTS.md
↓
阅读 MEMORY.md
↓
阅读 TASKS.md
↓
分析需求
↓
输出方案
↓
实施开发
↓
运行验证
↓
更新文档
```

