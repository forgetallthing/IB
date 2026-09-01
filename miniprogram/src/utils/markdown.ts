/**
 * 轻量 Markdown 解析器（跨端渲染）
 * 微信 RichText 仅支持白名单标签且 CSS 受限，因此将内容拆分为片段：
 * - html 片段：常规富文本（标题/列表/表格/引用等），经 RichText 渲染
 * - code 片段：围栏代码块，由页面用原生 View/Text 渲染，保证真机显示
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内语法处理（输入为已转义文本） */
function renderInline(text: string): string {
  let out = text;
  // 图片（优先于链接）
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
    return `<img src="${src}" alt="${alt}" />`;
  });
  // 链接：小程序 RichText 内 a 不可点击，渲染为主题色文本
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label) => {
    return `<span style="color:#0d9488;">${label}</span>`;
  });
  // 行内代码
  out = out.replace(/`([^`]+)`/g, '<code style="background-color:#f0f4f4;color:#0f766e;padding:2rpx 10rpx;border-radius:6rpx;">$1</code>');
  // 加粗 / 斜体
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return out;
}

interface CodeBlock {
  lang: string;
  code: string;
}

/** 提取围栏代码块，避免被段落逻辑破坏 */
function extractCodeBlocks(md: string): { text: string; blocks: CodeBlock[] } {
  const blocks: CodeBlock[] = [];
  const text = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_m, lang, code) => {
    blocks.push({ lang: String(lang ?? ''), code: String(code ?? '') });
    return `\u0000CODE${blocks.length - 1}\u0000`;
  });
  return { text, blocks };
}

export interface MdSegment {
  type: 'html' | 'code';
  html?: string;
  lang?: string;
  code?: string;
}

/** Markdown 拆分为渲染片段 */
export function markdownToSegments(md: string): MdSegment[] {
  if (!md) return [];
  const { text, blocks } = extractCodeBlocks(md);
  const lines = escapeHtml(text).split('\n');

  const segments: MdSegment[] = [];
  const htmlBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];
  let tableRows: string[][] = [];

  const flushHtml = () => {
    if (htmlBuffer.length) {
      segments.push({ type: 'html', html: htmlBuffer.join('') });
      htmlBuffer.length = 0;
    }
  };
  const closeList = () => {
    if (listType) {
      htmlBuffer.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeParagraph = () => {
    if (paragraph.length) {
      htmlBuffer.push(`<p style="margin:10rpx 0;line-height:1.75;">${renderInline(paragraph.join('<br/>'))}</p>`);
      paragraph = [];
    }
  };
  const closeTable = () => {
    if (tableRows.length) {
      const [head, ...body] = tableRows;
      const headCells = head
        .map((c) => `<th style="padding:10rpx 14rpx;border:1px solid #e5e9e9;background-color:#f0f7f6;text-align:left;font-weight:600;">${renderInline(c)}</th>`)
        .join('');
      const bodyRows = body
        .map((row) => `<tr>${row.map((c) => `<td style="padding:10rpx 14rpx;border:1px solid #e5e9e9;">${renderInline(c)}</td>`).join('')}</tr>`)
        .join('');
      htmlBuffer.push(`<table style="border-collapse:collapse;width:100%;"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`);
      tableRows = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // 代码块占位
    const codeMatch = trimmed.match(/^\u0000CODE(\d+)\u0000$/);
    if (codeMatch) {
      flushHtml();
      closeParagraph();
      closeList();
      closeTable();
      const block = blocks[Number(codeMatch[1])];
      segments.push({ type: 'code', lang: block.lang, code: block.code.replace(/\n$/, '') });
      continue;
    }

    // 空行
    if (!trimmed) {
      closeParagraph();
      closeList();
      closeTable();
      continue;
    }

    // 标题
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      closeTable();
      const level = heading[1].length;
      const size = [38, 36, 34, 32, 30, 28][level - 1];
      htmlBuffer.push(`<h${level} style="font-size:${size}rpx;font-weight:600;margin:28rpx 0 12rpx;color:#1a2b33;">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    // 分隔线（div 在 RichText 白名单内）
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeParagraph();
      closeList();
      closeTable();
      htmlBuffer.push('<div style="height:1px;background-color:#e5e9e9;margin:16rpx 0;overflow:hidden;"></div>');
      continue;
    }

    // 引用
    const quote = trimmed.match(/^&gt;\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      closeTable();
      htmlBuffer.push(`<blockquote style="border-left:6rpx solid #14b8a6;background-color:#f0f7f6;padding:16rpx 20rpx;margin:12rpx 0;border-radius:0 10rpx 10rpx 0;color:#52606d;">${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    // 表格行
    if (/^\|(.+)\|$/.test(trimmed)) {
      closeParagraph();
      closeList();
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      // 分隔行跳过
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      tableRows.push(cells);
      continue;
    }
    closeTable();

    // 无序列表
    const ulItem = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulItem) {
      closeParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        htmlBuffer.push('<ul style="margin:8rpx 0;padding-left:36rpx;">');
      }
      htmlBuffer.push(`<li style="margin:6rpx 0;line-height:1.7;">${renderInline(ulItem[1])}</li>`);
      continue;
    }

    // 有序列表
    const olItem = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (olItem) {
      closeParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        htmlBuffer.push('<ol style="margin:8rpx 0;padding-left:36rpx;">');
      }
      htmlBuffer.push(`<li style="margin:6rpx 0;line-height:1.7;">${renderInline(olItem[1])}</li>`);
      continue;
    }
    closeList();

    // 普通段落
    paragraph.push(trimmed);
  }

  closeParagraph();
  closeList();
  closeTable();
  flushHtml();

  return segments;
}

/** 提取纯文本（用于摘要预览） */
export function markdownToPlainText(md: string): string {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ========== 代码语法高亮（轻量 tokenizer，one-dark 配色） ==========

export type TokenType = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'func' | 'builtin';

export interface CodeToken {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set(
  ('const let var function class return if else for while do switch case break continue new typeof instanceof in of try catch finally throw '
    + 'async await import export from default extends super null undefined true false void delete yield static get set '
    + 'public private protected interface type enum implements namespace declare abstract readonly '
    + 'def self None True False elif lambda pass raise with as global nonlocal print '
    + 'int float bool char double long short unsigned struct union typedef sizeof goto volatile extern register inline').split(' '),
);

const BUILTINS = new Set(
  ('console log document window Math JSON Object Array String Number Boolean Promise Map Set Date RegExp Error Symbol '
    + 'useState useEffect useRef useMemo useCallback useReducer React Vue Taro wx setTimeout setInterval clearTimeout clearInterval '
    + 'require module exports process localStorage fetch').split(' '),
);

const HASH_COMMENT_LANGS = new Set(['python', 'py', 'sh', 'bash', 'shell', 'zsh', 'yaml', 'yml', 'ruby', 'rb', 'makefile', 'dockerfile', 'docker', 'ini', 'toml', 'conf', 'nginx']);

/**
 * 保留代码缩进：微信 Text 组件会折叠空白，
 * 将 tab 转 4 空格、前导缩进与行内连续空格替换为不间断空格（\u00A0）避免折叠
 */
function preserveIndent(code: string): string {
  return code
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => {
      const lead = line.match(/^ +/)?.[0].length ?? 0;
      let out = lead ? '\u00A0'.repeat(lead) + line.slice(lead) : line;
      out = out.replace(/ {2,}/g, (s) => '\u00A0'.repeat(s.length));
      return out;
    })
    .join('\n');
}

/** 将代码切分为带类型的 token（用于嵌套 Text 上色） */
export function highlightCode(code: string, lang?: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const lower = (lang ?? '').toLowerCase();
  const hashComment = HASH_COMMENT_LANGS.has(lower);
  const source = preserveIndent(code);

  const push = (text: string, type: TokenType) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else tokens.push({ text, type });
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    // 块注释 /* ... */
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const seg = end === -1 ? source.slice(i) : source.slice(i, end + 2);
      push(seg, 'comment');
      i += seg.length;
      continue;
    }

    // 行注释 // 或 #
    if ((ch === '/' && source[i + 1] === '/') || (hashComment && ch === '#')) {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      push(source.slice(i, end), 'comment');
      i = end;
      continue;
    }

    // 字符串 / 模板串
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === ch) { j++; break; }
        j++;
      }
      push(source.slice(i, j), 'string');
      i = j;
      continue;
    }

    // 数字（前面不是标识符字符时才独立成 token）
    if (/[0-9]/.test(ch) && !/[0-9a-zA-Z_$]/.test(source[i - 1] ?? '')) {
      let j = i;
      while (j < source.length && /[0-9a-fx.]/i.test(source[j])) j++;
      push(source.slice(i, j), 'number');
      i = j;
      continue;
    }

    // 标识符 / 关键字 / 函数名
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_$]/.test(source[j])) j++;
      const word = source.slice(i, j);
      let next = j;
      while (next < source.length && source[next] === ' ') next++;
      const type: TokenType = KEYWORDS.has(word)
        ? 'keyword'
        : BUILTINS.has(word)
          ? 'builtin'
          : source[next] === '('
            ? 'func'
            : 'plain';
      push(word, type);
      i = j;
      continue;
    }

    push(ch, 'plain');
    i++;
  }

  return tokens;
}
