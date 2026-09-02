import crypto from 'crypto';

const SCRYPT_PREFIX = 'scrypt$';
const KEY_LEN = 64;

/** 生成 scrypt 慢哈希（自带随机盐），替代旧的无盐 SHA-256 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${hash}`;
}

/** 旧格式（无盐 SHA-256）判断，用于登录时透明升级 */
export function isLegacyHash(passwordHash: string): boolean {
  return !passwordHash.startsWith(SCRYPT_PREFIX);
}

/** 校验密码：自动兼容旧 SHA-256 哈希 */
export function verifyPassword(password: string, passwordHash: string): boolean {
  if (isLegacyHash(passwordHash)) {
    return crypto.createHash('sha256').update(password).digest('hex') === passwordHash;
  }

  const [salt, hash] = passwordHash.slice(SCRYPT_PREFIX.length).split('$');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
