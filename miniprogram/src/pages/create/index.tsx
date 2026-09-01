/**
 * 「新建」tab 页（薄壳入口），复用编辑器视图（无 url 参数即新建模式）。
 * 注意：必须引用非页面组件 EditorView，不能 re-export pages/editor/index，
 * 否则会产生双重 Page() 注册导致 "Please do not register multiple Pages" 崩溃。
 */
export { default } from '../editor/EditorView';
