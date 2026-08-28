// 将 vditor 的静态资源复制到 public，使编辑器运行时从本地加载（而非 CDN）
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// 兼容依赖被提升到工作区根 node_modules 的情况
const candidates = [join(root, 'node_modules', 'vditor', 'dist'), join(root, '..', 'node_modules', 'vditor', 'dist')];
const src = candidates.find((p) => existsSync(p));
const dest = join(root, 'public', 'vditor', 'dist');

if (!src) {
  console.warn('[copy-vditor] 未找到 node_modules/vditor，跳过复制');
} else {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[copy-vditor] 已复制 ${src} -> ${dest}`);
}
