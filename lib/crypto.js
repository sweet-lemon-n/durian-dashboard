/**
 * 企业微信回调加解密工具
 *
 * 用于：
 *   1. GET 请求：验证回调 URL（解密 echostr）
 *   2. POST 请求：解密消息体 + 加密回复（预留）
 */

const crypto = require('crypto');

/**
 * 验证签名
 *
 * 算法：
 *   1. 将 token、timestamp、nonce、encrypted 按字典序排序
 *   2. 拼接为字符串
 *   3. SHA1，转小写十六进制
 *   4. 与 msg_signature 对比
 *
 * @param {string} token - 企微后台配置的 Token
 * @param {string} timestamp - 请求参数 timestamp
 * @param {string} nonce - 请求参数 nonce
 * @param {string} encrypted - 加密的内容（GET 时为 echostr，POST 时为 Encrypt 标签值）
 * @param {string} msgSignature - 请求参数 msg_signature
 * @returns {boolean}
 */
function verifySignature(token, timestamp, nonce, encrypted, msgSignature) {
  const arr = [token, timestamp, nonce, encrypted].sort();
  const raw = arr.join('');
  const sha1 = crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
  return sha1.toLowerCase() === msgSignature.toLowerCase();
}

/**
 * AES-256-CBC 解密
 *
 * @param {string} encodingAESKey - 43 位 EncodingAESKey
 * @param {string} encryptedText - Base64 编码的密文
 * @returns {{ message: string, receiveId: string }} 解密后的消息和 corpid
 */
function decrypt(encodingAESKey, encryptedText) {
  // AES 密钥 = Base64.decode(EncodingAESKey + "=")
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');

  // IV = AES 密钥前 16 字节
  const iv = aesKey.subarray(0, 16);

  // AES-256-CBC 解密
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  const encryptedBuffer = Buffer.from(encryptedText, 'base64');
  let decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

  // 手动去除 PKCS7 填充
  const padLen = decrypted[decrypted.length - 1];
  if (padLen > 0 && padLen <= 32) {
    decrypted = decrypted.subarray(0, decrypted.length - padLen);
  }

  // 结构: random(16) + msg_len(4, big-endian) + msg + receiveid
  const content = decrypted.subarray(16); // 跳过 16 字节随机数
  const msgLen = content.readUInt32BE(0); // 4 字节，网络字节序（大端）
  const message = content.subarray(4, 4 + msgLen).toString('utf8');
  const receiveId = content.subarray(4 + msgLen).toString('utf8');

  return { message, receiveId };
}

/**
 * 加密消息（用于被动回复，预留）
 */
function encrypt(encodingAESKey, message, receiveId) {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = aesKey.subarray(0, 16);

  // 生成 16 字节随机数
  const random = crypto.randomBytes(16);

  // 构造: random(16) + msg_len(4) + msg + receiveid
  const msgBuffer = Buffer.from(message, 'utf8');
  const idBuffer = Buffer.from(receiveId, 'utf8');
  const msgLen = Buffer.alloc(4);
  msgLen.writeUInt32BE(msgBuffer.length, 0);

  const plain = Buffer.concat([random, msgLen, msgBuffer, idBuffer]);

  // PKCS7 填充
  const padLen = 32 - (plain.length % 32);
  const pad = Buffer.alloc(padLen, padLen);
  const padded = Buffer.concat([plain, pad]);

  // AES-256-CBC 加密
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return encrypted.toString('base64');
}

/**
 * 生成签名（用于被动回复时的 MsgSignature）
 */
function generateSignature(token, timestamp, nonce, encrypted) {
  const arr = [token, timestamp, nonce, encrypted].sort();
  const raw = arr.join('');
  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex');
}

/**
 * 处理回调 URL 验证（GET 请求）
 *
 * @param {object} params
 * @param {string} params.msg_signature
 * @param {string} params.timestamp
 * @param {string} params.nonce
 * @param {string} params.echostr
 * @param {string} token
 * @param {string} encodingAESKey
 * @returns {{ success: true, echo: string } | { success: false, error: string }}
 */
function handleVerifyUrl(params, token, encodingAESKey) {
  const { msg_signature, timestamp, nonce, echostr } = params;

  if (!msg_signature || !timestamp || !nonce || !echostr) {
    return { success: false, error: '缺少必要参数 (msg_signature, timestamp, nonce, echostr)' };
  }

  // 第一步：验证签名
  if (!verifySignature(token, timestamp, nonce, echostr, msg_signature)) {
    return { success: false, error: '签名验证失败' };
  }

  // 第二步：解密 echostr
  try {
    const { message } = decrypt(encodingAESKey, echostr);
    return { success: true, echo: message };
  } catch (err) {
    return { success: false, error: `解密失败: ${err.message}` };
  }
}

module.exports = {
  verifySignature,
  decrypt,
  encrypt,
  generateSignature,
  handleVerifyUrl,
};
