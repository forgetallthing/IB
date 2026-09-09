#!/usr/bin/env node
// 将 ecool-export/ecool_questions.jsonl 导入 IB 笔记库（MongoDB）
// 用法: node scripts/ecool-import.mjs [--limit 2] [--uri mongodb://...]
//   --limit  只导入前 N 条（默认 2，验证用）
//   --uri    覆盖连接串，默认读 backend/.env 的 MONGO_URI
//
// 标签策略:
//   1. 所有导入题固定绑定「ecool题库」标签
//   2. 用现有标签名在标题+正文里做匹配（如 React/CSS/HTTP），命中即复用现有标签
//   3. 没有命中任何现有标签的题归入「综合」标签（不存在时自动创建），不从内容新建标签

import { readFileSync, existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';

// ---------- 参数 ----------
const args = process.argv.slice(2);
function argOf(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const LIMIT = Number(argOf('--limit', 2));
const IN_FILE = 'ecool-export/ecool_questions.jsonl';

// ---------- 连接串 ----------
let uri = argOf('--uri', '');
if (!uri) {
  const envFile = readFileSync('backend/.env', 'utf8');
  const m = envFile.match(/^MONGO_URI=(.*)$/m);
  if (m) uri = m[1].trim().replace(/^["']|["']$/g, '');
}
if (!uri) { console.error('未找到 MONGO_URI（backend/.env 或 --uri）'); process.exit(1); }
const safeUri = uri.replace(/\/\/[^@]+@/, '//***@');
console.log(`目标数据库: ${safeUri}`);

// ---------- 标签工具 ----------
const PALETTE = ['#e7f0ff', '#e9f7ef', '#efe8dd', '#fdeaea', '#e8f4f4', '#f0e9f7', '#eef7e9'];
const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAscii = (s) => /^[\x00-\x7F]+$/.test(s);

function matchExistingTags(text, existingNames) {
  const hits = [];
  for (const name of existingNames) {
    if (name.length < 2) continue;
    if (isAscii(name)) {
      if (new RegExp(`\\b${escapeReg(name)}\\b`, 'i').test(text)) hits.push(name);
    } else if (text.includes(name)) {
      hits.push(name);
    }
  }
  return hits;
}

function toDifficulty(record) {
  const level = record.source?.level ?? record.difficulty ?? 3;
  if (level <= 2) return 'easy';
  if (level < 4) return 'medium';
  return 'hard';
}

// ---------- 主流程 ----------
if (!existsSync(IN_FILE)) { console.error(`找不到 ${IN_FILE}，先运行 ecocool-crawl.mjs`); process.exit(1); }
const records = readFileSync(IN_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
console.log(`待导入记录: ${records.length} 条，本次上限 ${LIMIT} 条\n`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const questions = db.collection('questions');
const tags = db.collection('tags');
const users = db.collection('users');

const before = await questions.countDocuments({});
const tagDocs = await tags.find({}, { projection: { name: 1 } }).toArray();
const existingNames = new Set(tagDocs.map((t) => t.name));
console.log(`库内现状: ${before} 道题, ${existingNames.size} 个标签\n`);

// 管理员作为导入归属
const admin =
  (await users.findOne({ role: 'admin' })) ||
  (await users.findOne({ role: 'user', username: { $ne: null } }));
if (!admin) { console.error('库内没有任何用户，无法确定 creatorId'); process.exit(1); }
console.log(`导入归属: ${admin.username} (${admin._id})\n`);

let maxOrder = (await tags.find({}, { projection: { displayOrder: 1 } }).sort({ displayOrder: -1 }).limit(1).toArray())[0]?.displayOrder ?? 0;
let colorIdx = 0;
let imported = 0, dupSkipped = 0;
const createdTags = [];

for (const rec of records) {
  if (imported >= LIMIT) break;

  const sourceKey = `fe.ecool.fun:${rec.source.exerciseKey}`;
  if (await questions.findOne({ source: sourceKey })) { dupSkipped++; continue; }
  if (await questions.findOne({ title: rec.title })) { dupSkipped++; console.log(`[跳过] 标题已存在: ${rec.title}`); continue; }

  // 组装标签: ecool题库 + 内容匹配的现有标签；无任何匹配则归入「综合」
  const matched = matchExistingTags(`${rec.title}\n${rec.content}`, [...existingNames]);
  const wantedTags = [...new Set(['ecool题库', ...(matched.length ? matched : ['综合'])])];
  const tagList = [];
  for (const name of wantedTags) {
    if (!existingNames.has(name)) {
      const doc = {
        name,
        color: PALETTE[colorIdx++ % PALETTE.length],
        description: 'ecool 题库导入归类',
        active: true,
        displayOrder: ++maxOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const r = await tags.insertOne(doc);
      existingNames.add(name);
      createdTags.push(name);
      console.log(`[新标签] ${name} (#${r.insertedId})`);
    }
    tagList.push(name);
  }

  await questions.insertOne({
    title: rec.title,
    content: rec.content,
    tags: tagList,
    difficulty: toDifficulty(rec),
    creatorId: admin._id,
    creatorName: admin.username,
    visibility: 'public',
    source: sourceKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  imported += 1;
  console.log(`[入库 ${imported}] ${rec.title} | 标签: ${tagList.join(', ')} | 难度: ${toDifficulty(rec)}`);
}

const after = await questions.countDocuments({});
console.log(`\n完成: 导入 ${imported}，跳过重复 ${dupSkipped}，题目数 ${before} → ${after}`);
console.log(`新增标签: ${createdTags.length ? createdTags.join(', ') : '无'}`);
await client.close();
