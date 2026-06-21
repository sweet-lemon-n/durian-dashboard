# 🍈 榴莲运输温度监控看板

从企业微信智能表格抓取温度数据，实时展示榴莲运输过程中的温度监控看板。

## 前置准备

### 1. 获取企业微信配置

| 配置项 | 获取方式 |
|--------|---------|
| **corpid**（企业ID） | 登录 [企业微信管理后台](https://work.weixin.qq.com) → 「我的企业」 → 「企业信息」 → 复制企业ID |
| **corpsecret**（应用密钥） | 管理后台 → 「应用管理」 → 「自建」 → 创建/查看应用 → 复制 Secret |
| **docid**（文档ID） | 在企业微信打开智能表格 → 查看 URL 中的 docid 参数 |

### 2. 配置应用权限

在管理后台 → 「协作」 → 「文档」 → 「API」 → 将你的自建应用添加到「可调用接口的应用」列表。

### 3. 准备智能表格

你需要在智能表格文档中有一个子表用于记录温度数据，建议包含以下字段：

- **柜号**（文本）
- **温度**（数字）
- **位置信息**（文本）
- **香味**（文本）
- **更新时间**（日期时间）

> 看板会自动识别字段名称（支持中英文），无需严格匹配。

## 快速开始

### 1. 填写配置

```bash
cp .env.example .env
# 编辑 .env，填入 corpid、corpsecret、docid
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务

```bash
npm start
```

### 4. 打开看板

浏览器访问 `http://localhost:3000`

## 配置说明

`.env` 文件中的配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| CORPID | 企业ID | 必填 |
| CORPSECRET | 应用密钥 | 必填 |
| DOCID | 智能表格文档ID | 必填 |
| PORT | 服务端口 | 3000 |
| TEMP_MIN | 温度下限告警阈值（°C） | 2 |
| TEMP_MAX | 温度上限告警阈值（°C） | 8 |
| REFRESH_INTERVAL | 前端刷新间隔（秒） | 30 |
| METASO_MCP_URL | 秘塔搜索 ModelScope MCP 地址（可选，优先用于自动新闻） | 空 |
| METASO_MCP_API_KEY | 秘塔/ModelScope MCP 鉴权 Key（可选；未填时回退 METASO_API_KEY） | 空 |
| METASO_API_KEY | 秘塔搜索 API Key（可选；兼容直连 API 或 MCP） | 空 |
| METASO_API_URL | 秘塔搜索直连 API 地址（可选；没有 MCP 地址时使用） | 空 |

自动新闻优先级：`METASO_MCP_URL` → `METASO_API_URL` → 新浪财经/RSS/搜索引擎 fallback。ModelScope MCP 服务可参考：
`https://www.modelscope.cn/mcp/servers/metasota/metaso-search`

## 生产部署

推荐使用 pm2 守护进程：

```bash
npm install -g pm2
pm2 start server.js --name durian-dashboard
pm2 save
pm2 startup
```

## 技术栈

- 后端：Node.js + Express
- 前端：原生 HTML/CSS/JS + Chart.js
- 数据源：企业微信智能表格 API
