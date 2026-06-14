/**
 * 初始化数据库并创建第一个管理员账户
 *
 * 用法：node scripts/init-db.js
 *
 * 首次部署时在服务器上运行一次。
 * 如果数据库中已有用户，则提示并退出（防止覆盖）。
 */

const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initDatabase, countUsers, createUser } = require('../lib/db');

const DB_PATH = path.join(__dirname, '..', 'data', 'auth.db');

function ask(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async function main() {
  console.log('\n🍈  榴莲温度看板 — 管理员账户初始化\n');
  console.log(`数据库路径: ${DB_PATH}\n`);

  // 初始化数据库
  const db = initDatabase(DB_PATH);

  // 检查是否已有用户
  const userCount = countUsers(db);
  if (userCount > 0) {
    console.log(`⚠️  数据库中已有 ${userCount} 个用户，无需初始化。`);
    console.log('   如需管理用户，请通过后台管理面板操作。');
    process.exit(0);
  }

  console.log('数据库已就绪，当前无用户。请创建管理员账户：\n');

  // 交互式输入
  const username = await ask('用户名 (默认: admin): ') || 'admin';
  const displayName = await ask(`显示名称 (默认: ${username}): `) || username;

  // 密码输入（两次确认）
  let password;
  while (true) {
    const pw1 = await ask('密码 (至少6位): ');
    if (!pw1 || pw1.length < 6) {
      console.log('  密码至少需要 6 位，请重新输入。');
      continue;
    }
    const pw2 = await ask('确认密码: ');
    if (pw1 !== pw2) {
      console.log('  两次密码不一致，请重新输入。');
      continue;
    }
    password = pw1;
    break;
  }

  try {
    const result = await createUser(db, {
      username,
      password,
      displayName,
      role: 'admin',
    });

    console.log(`\n✅  管理员账户创建成功！`);
    console.log(`   ID:       ${result.id}`);
    console.log(`   用户名:   ${username}`);
    console.log(`   显示名:   ${displayName}`);
    console.log(`   角色:     admin`);
    console.log(`\n现在可以启动服务并登录了。`);
  } catch (err) {
    console.error(`\n❌  创建失败: ${err.message}`);
    process.exit(1);
  }
})();
