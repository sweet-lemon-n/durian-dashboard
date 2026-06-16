// 看板可编辑占位内容存储（orders / logistics / news / meta）
// 极简 JSON 文件存储：data/board-content.json，原子写入，首次运行自动播种。
// 与 auth.db 分离——这里只存「展示用」的占位内容，企微真实数据走 /api/dashboard。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'data', 'board-content.json');

// ---------- 种子数据（占位）----------
// 真实数据接入前的默认内容，首次读取时写入磁盘，之后由管理后台编辑。
function seedData() {
  return {
    meta: {
      title: '榴莲交付总览 · DURIAN DELIVERY OVERVIEW',
      subtitle: 'THAILAND & VIETNAM · 泰越双产季订单 + 物流监控实时看板',
      updatedBy: 'system',
    },

    // 订单：每个品种一条记录
    orders: [
      // ========== 泰国 ==========
      { id: 'TH-KK-FRESH',  country: 'TH', category: 'FRESH',  brand: 'KK 鲜果',        orders: 3, boxes: 32, signed: 0, delivered: 22, transit: 0, port: 0, pending: 10 },
      { id: 'TH-YL-FRESH',  country: 'TH', category: 'FRESH',  brand: 'YL 鲜果',        orders: 4, boxes: 50, signed: 0, delivered: 24, transit: 4, port: 0, pending: 22 },
      { id: 'TH-YR-FRESH',  country: 'TH', category: 'FRESH',  brand: 'YR 鲜果',        orders: 3, boxes: 36, signed: 0, delivered: 0,  transit: 0, port: 0, pending: 36 },
      { id: 'TH-KK-FROZEN', country: 'TH', category: 'FROZEN', brand: 'KK 冻肉',        orders: 4, boxes: 9,  signed: 0, delivered: 1,  transit: 2, port: 0, pending: 6  },

      // ========== 越南 ==========
      { id: 'VN-CTY-FRESH',  country: 'VN', category: 'FRESH',  brand: 'CTY 小宝珍·鲜果', orders: 2, boxes: 12, signed: 8, delivered: 0, transit: 2, port: 1, pending: 1  },
      { id: 'VN-CTY-FROZEN', country: 'VN', category: 'FROZEN', brand: 'CTY 小宝珍·冻果', orders: 4, boxes: 15, signed: 0, delivered: 1, transit: 3, port: 1, pending: 10 },
      { id: 'VN-VP-FROZEN',  country: 'VN', category: 'FROZEN', brand: 'VP 万春·冻果',    orders: 3, boxes: 15, signed: 0, delivered: 0, transit: 0, port: 0, pending: 15 },
    ],

    // 物流：关口滞留 + 在途冷柜
    logistics: {
      kpis: {
        inTransit: 3,        // 在途批次（柜）
        tempRecords: 8,      // 温度记录条数
        avgReturnTemp: 14.0, // 平均回风温度 ℃
        tempAlarms: 2,       // 温度异常条数
        portDelayed: 25,     // 关口滞留柜数
      },
      // 关口滞留预警表
      portDelays: [
        { id: 'pd1', container: 'TSTU8536507', route: '南沙',      category: 'FRESH',  delayDays: 4.0, reason: '滞留+虫检' },
        { id: 'pd2', container: 'TBJU1295750', route: '磨憨-铁路', category: 'FROZEN', delayDays: 3.8, reason: '滞留+虫检' },
        { id: 'pd3', container: 'YMLU5489270', route: '蛇口',      category: 'FRESH',  delayDays: 3.0, reason: '查验' },
        { id: 'pd4', container: 'LYGU0023713', route: '蛇口',      category: 'FRESH',  delayDays: 2.5, reason: '查验' },
      ],
      // 在途冷柜温度监控表
      inTransitContainers: [
        { id: 'tc1', container: 'TEMU8123456', brand: '汇食', setTemp: 12, returnTemp: 16.8, location: '广西·凭祥',     status: 'ALARM', note: '▲异常' },
        { id: 'tc2', container: 'GESU5678901', brand: '国贸', setTemp: 14, returnTemp: 17.1, location: '云南·磨憨',     status: 'ALARM', note: '▲异常' },
        { id: 'tc3', container: 'YMLU5320778', brand: '烨荣', setTemp: 13, returnTemp: 15.2, location: '越南 LANG SON', status: 'WARN',  note: '友谊关滞留' },
        { id: 'tc4', container: 'TEMU8123456', brand: '汇食', setTemp: 12, returnTemp: 12.8, location: '广西·凭祥',     status: 'OK',    note: '正常' },
        { id: 'tc5', container: 'GESU5678901', brand: '国贸', setTemp: 14, returnTemp: 14.2, location: '云南·磨憨',     status: 'OK',    note: '正常' },
      ],
    },

    // 新闻/快讯
    news: [
      // 泰国
      { id: 'th-n1', country: 'TH', icon: '🇹🇭', title: '中国第一供应国',     detail: '1-4月对华出口 **28.86万吨(占81%)**；产量预计 **178–189万吨**' },
      { id: 'th-n2', country: 'TH', icon: '⚠️',  title: '100% 抽检碱性嫩黄+镉', detail: '须附认证实验室 **"未检出"** 报告，通关门槛提高' },
      { id: 'th-n3', country: 'TH', icon: '🐂',  title: '价格持续走低',       detail: '金枕 **19元/斤** 同比跌超40%，7月回升 20–28元/斤' },
      { id: 'th-n4', country: 'TH', icon: '📦',  title: '中老铁路提速',       detail: '"澜湄快线" **26小时** 到昆明，1-4月运榴莲 **5.03万吨(+94.2%)**' },
      // 越南
      { id: 'vn-n1', country: 'VN', icon: '🇻🇳', title: '280号令落地',       detail: '仅 **25家** 检测机构获中方认可，同奈领涨 85K VND/kg' },
      { id: 'vn-n2', country: 'VN', icon: '📈',  title: '进口额暴增 205%',   detail: '1-4月 **17亿美元**，越南占比首超50%、超越泰国' },
      { id: 'vn-n3', country: 'VN', icon: '🇵🇭', title: '菲律宾 7.8 级强震',  detail: '达沃榴莲/香蕉产业链遭重创，出口受阻' },
      { id: 'vn-n4', country: 'VN', icon: '🤖',  title: 'AI 榴莲检测上线',   detail: '无损检测准确率 **95%+**，包销500万斤，一果一码' },
    ],
  };
}

function ensureSeed() {
  if (!fs.existsSync(FILE)) {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(seedData(), null, 2), 'utf-8');
    fs.renameSync(tmp, FILE);
    console.log('📦 首次运行，已生成看板占位内容：' + FILE);
  }
}

function read() {
  ensureSeed();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (e) {
    console.error('❌ board-content.json 解析失败，请检查格式：', e.message);
    throw e;
  }
}

// 同步写入（管理端改完立即响应）：写临时文件后 rename，同盘原子替换
function writeSync(data) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, FILE);
}

function genId(prefix) {
  return prefix + '-' + crypto.randomUUID();
}

module.exports = { read, writeSync, genId, seedData, FILE };
