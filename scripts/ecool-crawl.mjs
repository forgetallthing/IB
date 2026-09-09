#!/usr/bin/env node
// 抓取 fe.ecool.fun 免费面试题并转为 IB 笔记库格式（JSONL）
// 用法: node scripts/ecool-crawl.mjs [起始exerciseKey] [数量上限]
//   默认从种子题开始沿 next 链抓 2 道题做验证
//   全量抓取时自行加大上限；进度追加写入 JSONL，可断点续跑（自动跳过已抓 key）

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'ecool-export';
const OUT_FILE = `${OUT_DIR}/ecool_questions.jsonl`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const DELAY_MS = 1500; // 限速，避免给站点造成压力

const seedKey = process.argv[2] || '8f04d26c-f525-45ca-81f5-a2cd48c15f16';
const limit = Number(process.argv[3] || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractSsrData(html) {
  // SSR 数据在 window.g_initialProps = {...}; 中，以 `;</script>` 收尾
  const m = html.match(/window\.g_initialProps = ([\s\S]*?);\s*<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1]).data;
}

async function fetchTopic(exerciseKey) {
  const url = `https://fe.ecool.fun/topic/${exerciseKey}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return extractSsrData(await res.text());
}

function parseOptions(d) {
  if (d.category !== 'Choice') return null;
  try {
    const o = d.options ? JSON.parse(d.options) : null;
    return o && Array.isArray(o.options) ? o : null;
  } catch { return null; }
}

function buildTitle(d, opts) {
  if (d.category !== 'Choice') return d.title;
  // 选择题: 标题 = 题干 + 选项列表（列表页/抽题卡直接展示完整题目）
  const parts = [d.title];
  if (d.desc && d.desc.trim()) parts.push(d.desc.trim());
  if (opts) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    parts.push(opts.options.map((t, i) => `${letters[i]}. ${t}`).join('\n\n'));
  }
  return parts.join('\n\n');
}

function buildContent(d, opts) {
  if (d.category !== 'Choice') return d.explanation || '';
  // 选择题正文: 正确答案 + 解析
  const parts = [];
  if (opts) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const ans = (opts.answer || []).map((i) => letters[i] ?? '?').join('、'); // answer 为 0 起始下标
    if (ans) parts.push(`**正确答案：${ans}**${opts.isMulti ? '（多选）' : ''}`);
  }
  if (d.explanation) parts.push(`## 解析\n\n${d.explanation}`);
  return parts.join('\n\n');
}

function toIbQuestion(d) {
  const opts = parseOptions(d);
  return {
    title: buildTitle(d, opts),
    content: buildContent(d, opts),
    tags: ['ecool题库'], // 固定归属标签；主题标签由导入脚本按内容自动匹配
    difficulty: Math.min(5, Math.max(1, Math.round(d.level || 1))),
    visibility: 'public',
    source: { site: 'fe.ecool.fun', exerciseKey: d.exerciseKey, vipLimit: d.vipLimit, level: d.level, category: d.category, createdAt: d.createAt },
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 断点续跑：读取已抓取的 key
  const done = new Set();
  if (existsSync(OUT_FILE)) {
    for (const line of readFileSync(OUT_FILE, 'utf8').split('\n')) {
      if (line.trim()) {
        try { done.add(JSON.parse(line).source.exerciseKey); } catch { /* 忽略坏行 */ }
      }
    }
  }

  let key = seedKey;
  let saved = 0, skippedPaid = 0, failed = 0;

  while (key && saved < limit) {
    if (done.has(key)) {
      console.log(`[skip] 已抓取过 ${key}`);
      break; // 续跑时从断点数据里取 next 更好，这里简单起见直接停
    }
    let d;
    try {
      d = await fetchTopic(key);
    } catch (e) {
      console.error(`[fail] ${key}: ${e.message}`);
      failed += 1;
      if (failed >= 3) { console.error('连续失败 3 次，终止'); break; }
      await sleep(3000);
      break;
    }

    if (d.vipLimit === 0) {
      appendFileSync(OUT_FILE, JSON.stringify(toIbQuestion(d)) + '\n');
      saved += 1;
      console.log(`[ok ${saved}/${limit}] #${d.currentIndex} ${d.title}`);
    } else {
      skippedPaid += 1;
      console.log(`[付费] #${d.currentIndex} ${d.title} (vipLimit=${d.vipLimit})`);
    }

    key = d.next;
    await sleep(DELAY_MS);
  }

  console.log(`\n完成：保存 ${saved}，跳过付费 ${skippedPaid}，失败 ${failed}`);
  if (key) console.log(`下一题 key（续跑用）: ${key}`);
}

main();
