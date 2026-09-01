/**
 * towxml 原生库类型补充
 * 库源码位于 src/components/towxml（微信原生组件 + CommonJS 转换函数）
 */

// 转换入口：src/components/towxml/index.js
declare module '*/towxml/index' {
  interface TowxmlNode {
    [key: string]: unknown;
  }
  function towxml(
    str: string,
    type: 'markdown' | 'html',
    option?: { theme?: 'light' | 'dark'; events?: Record<string, unknown> },
  ): TowxmlNode;
  export default towxml;
}

// 原生组件标签 <towxml nodes={...} />
declare global {
  namespace JSX {
    interface IntrinsicElements {
      towxml: {
        nodes?: Record<string, unknown>;
        [key: string]: unknown;
      };
    }
  }
}
