# Modular Dashboard Design

## Goal

建立稳定的模块化看板架构：现有生产页面继续保留，新页面和新接口先以旁路方式上线；每个页面和板块都有清晰的业务名与英文模块代号，后续重构按模块推进，避免修改一个功能牵扯其他功能。

## Confirmed Requirements

- 现有 `/index.html`、`/index-flow.html`、`/admin.html` 先保留，不直接替换。
- 新页面先使用新路径，例如 `/app-overview.html`、`/app-flow.html`，验证好再替换入口。
- `overview` 作为主看板，只放概览和入口；每个卡片点击进入对应详情页。
- 权限按模块代号管理：`overview`、`orders`、`flow`、`temperature`、`logistics`、`news`、`smartsheet`、`admin`。
- 保留旧 API 不动；新增模块化路由或兼容层，例如 `/api/modules/flow/*`。
- 第一期只做架构整理、命名体系、新总览入口、权限模块设计，不重写所有详细页。
- 每拆一个模块，都补最小回归脚本，优先保护统计口径、权限拦截、页面脚本语法。

## Module Names

| Code | Business Name | Responsibility |
| --- | --- | --- |
| `overview` | 运营总览 | 主看板概览、模块入口、关键 KPI |
| `orders` | 订单看板 | 订单、国家、工厂、品类、柜数 |
| `flow` | 货柜流向 | 总柜数到签收的状态流转 |
| `temperature` | 温度监控 | 温度记录、异常、甘特图 |
| `logistics` | 物流监控 | 在途、到岸、关口滞留、国内转运、催办 |
| `news` | 行业新闻 | 新闻列表、新闻源和诊断 |
| `smartsheet` | 智能表管理 | 企微智能表结构、记录、AI 录入 |
| `admin` | 系统管理 | 用户、权限、全局配置 |

## Architecture

第一期采用“旁路模块化”而不是“替换式重构”。现有页面和接口继续作为生产基线，新模块只新增文件、少量挂载路由和兼容权限逻辑。等旁路页面在生产验证稳定后，再逐步把默认入口从旧页面切到新页面。

后端拆分方向：

- `lib/modules/registry.js` 作为模块命名、页面路径、权限 key 的唯一来源。
- `lib/db.js` 从模块注册表获取权限列表，保留旧权限兼容。
- `server.js` 只保留应用启动、全局中间件和路由挂载；大块业务路由逐步迁移到 `lib/routes/*`。
- `lib/board-routes.js` 暂时保留旧行为，后续按 `overview`、`flow`、`logistics` 等模块拆出新路由。

前端拆分方向：

- 新增 `/app-overview.html`，作为新运营总览入口。
- 旧页面仍可访问：`/index.html`、`/index-flow.html`、`/admin.html` 不改名、不删除。
- 新总览卡片链接到现有详细页或新别名页；详细页成熟后再逐个替换链接目标。

## Data Flow

`app-overview.html` 第一版直接读取现有 `/api/aggregate` 和 `/api/auth/me`，不新增统计口径。它只重新组织展示和入口，不重算业务数据。

`flow`、`logistics`、`temperature` 的详细页第一期仍复用现有 API：

- `flow` 使用 `/api/flow-dashboard`。
- `temperature` 使用 `/api/dashboard`。
- `logistics` 第一版从 `/api/aggregate.logistics` 展示概览，后续独立出 `/api/modules/logistics/summary`。

## Permissions

权限统一用模块代号。为了不影响现有账号，第一期需要兼容旧权限：

- 旧 `accounts` 等价于新 `admin`。
- 已有 `orders`、`logistics`、`news`、`smartsheet` 保持有效。
- 管理员仍自动拥有全部模块权限。
- 新增用户默认权限由当前后台表单决定，不在第一期改变默认授权策略。

页面权限和 API 权限分开表达，但共享模块代号：

- `permissions` 控制 API 和后台操作模块。
- `dashboardPermissions` 控制看板可见模块。

## Stability Rules

- 第一阶段不删除旧页面、不删除旧 API、不改生产入口。
- 任何新页面失败时，不影响旧页面。
- 任何权限迁移都必须向后兼容已有 SQLite 用户数据。
- 每个任务都必须有独立验证脚本或语法检查。
- 业务统计口径不在本次重构中重新定义，只复用已确认逻辑。

## First Implementation Scope

第一期交付：

1. 模块注册表和权限常量。
2. 权限兼容测试。
3. 新运营总览旁路页面 `/app-overview.html`。
4. 新页面入口路由或静态访问验证。
5. 最小后端路由拆分：优先拆 `auth` 和 `users`，降低 `server.js` 风险。
6. 文档更新，明确模块代号和页面命名。

不在第一期交付：

- 不重写所有详细页。
- 不替换 `/index.html`。
- 不调整企业微信表结构。
- 不改变已确认的订单、物流、温度统计口径。
