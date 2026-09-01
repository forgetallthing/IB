/**
 * 笔记详情/编辑页（薄壳入口）。
 * 页面主体在 EditorView.tsx —— 严禁直接 re-export 其他页面模块，
 * 否则 Taro 注入的 Page() 注册会在同一文件执行两次导致运行时崩溃。
 */
export { default } from './EditorView';
