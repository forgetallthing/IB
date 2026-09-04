import React, { useEffect, useMemo, useState } from 'react';
import { RichText, View, Text } from '@tarojs/components';
import { markdownToSegments, highlightCode, type CodeToken } from '../../utils/markdown';
import { API_BASE } from '../../config';
import styles from './index.module.scss';
// towxml 转换入口（原生库，类型见 src/types/towxml.d.ts）
// @ts-ignore
import towxml from '../towxml/index';

const isWeapp = process.env.TARO_ENV === 'weapp';

/**
 * 把 Markdown 里的站内相对路径（如 /api/images/xxx）补全为绝对地址。
 * 小程序没有"当前域名"概念，<image> 无法加载相对路径，必须显式拼上 API_BASE。
 */
function absolutizeAssets(source: string): string {
  if (!source.includes('](/api/') && !source.includes('src="/api/')) return source;
  return source
    .replace(/\]\((\/api\/[^)\s]+)\)/g, `](${API_BASE}$1)`)
    .replace(/src="(\/api\/[^"]+)"/g, `src="${API_BASE}$1"`);
}

/** 解析结果缓存：同内容只解析一次，收起再展开直接复用（LRU 上限，防内存增长） */
const parsedCache = new Map<string, any>();
const PARSE_CACHE_LIMIT = 5;

interface MarkdownProps {
  source: string;
  /** 微信端延迟解析毫秒数：错开 towxml 同步解析，避免阻塞转场动画（缓存命中时立即渲染） */
  defer?: number;
}

/** 代码块：逐行渲染 + token 上色（one-dark 配色，行结构保证换行）——仅 H5 预览使用 */
const CodeBlock: React.FC<{ lang: string; code: string }> = ({ lang, code }) => {
  const lines = useMemo(
    () => code.replace(/\t/g, '    ').split('\n').map((line) => highlightCode(line, lang)),
    [code, lang],
  );

  return (
    <View className={styles.codeBlock}>
      {lang ? <Text className={styles.codeLang}>{lang}</Text> : null}
      {lines.map((tokens, li) => (
        <Text key={li} className={styles.codeLine} userSelect>
          {tokens.length
            ? tokens.map((token: CodeToken, i: number) =>
              token.type === 'plain' ? (
                token.text
              ) : (
                <Text key={i} className={styles[`tok-${token.type}`]}>{token.text}</Text>
              ),
            )
            : '\u00A0'}
        </Text>
      ))}
    </View>
  );
};

/**
 * Markdown 渲染：
 * - 微信端：towxml（markdown-it + highlight.js，light 主题适配白底卡片），原生组件渲染效果最好
 * - H5 预览：towxml 原生组件不可用，走自研轻量渲染
 */
const Markdown: React.FC<MarkdownProps> = ({ source, defer = 60 }) => {
  const normalized = useMemo(() => absolutizeAssets(source), [source]);
  const segments = useMemo(() => markdownToSegments(normalized), [normalized]);
  const [nodes, setNodes] = useState<any>(null);

  useEffect(() => {
    if (!isWeapp || !normalized) {
      setNodes(null);
      return;
    }
    // 缓存命中：直接复用，零解析开销
    const cached = parsedCache.get(normalized);
    if (cached) {
      parsedCache.delete(normalized);
      parsedCache.set(normalized, cached);
      setNodes(cached);
      return;
    }
    // 分帧：先让展开动画与滚动校准完成，下一拍再同步解析，避免点击瞬间阻塞
    setNodes(null);
    const timer = setTimeout(() => {
      try {
        const result = towxml(normalized, 'markdown', { theme: 'light' });
        parsedCache.set(normalized, result);
        if (parsedCache.size > PARSE_CACHE_LIMIT) {
          const oldestKey = parsedCache.keys().next().value;
          if (oldestKey !== undefined) parsedCache.delete(oldestKey);
        }
        setNodes(result);
      } catch (error) {
        console.error('[Towxml] 解析失败:', error);
      }
    }, defer);
    return () => clearTimeout(timer);
  }, [normalized, defer]);

  if (!source) return null;

  if (isWeapp) {
    return nodes ? (
      <towxml nodes={nodes} />
    ) : (
      <View className={styles.rendering}>
        <Text className={styles.renderingText}>渲染中…</Text>
      </View>
    );
  }

  return (
    <View className={styles.rich}>
      {segments.map((seg, index) => {
        if (seg.type === 'code') {
          return <CodeBlock key={index} lang={seg.lang ?? ''} code={seg.code ?? ''} />;
        }
        return <RichText key={index} nodes={seg.html} />;
      })}
    </View>
  );
};

export default Markdown;
