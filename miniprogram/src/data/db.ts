/**
 * H5 预览用的内存 mock 数据库（weapp 真机不走此文件）
 * 字段结构与真实后端返回保持一致，便于无缝切换
 */
import type { Question, Tag } from '../types';
import { genId } from '../utils/format';

export interface MockUser {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  email?: string | null;
  createdAt: string;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const mockUsers: MockUser[] = [
  { id: 'u_admin', username: 'admin', password: 'admin123456', role: 'admin', status: 'active', createdAt: daysAgo(90) },
  { id: 'u_alex', username: 'alex', password: '123456', role: 'member', status: 'active', createdAt: daysAgo(60) },
  { id: 'u_lisa', username: 'lisa', password: '123456', role: 'member', status: 'active', createdAt: daysAgo(30) },
];

export const mockTags: Tag[] = [
  { id: 't_js', name: 'JavaScript', color: '#f59e0b', description: '语言核心', active: true, displayOrder: 1 },
  { id: 't_css', name: 'CSS', color: '#3b82f6', description: '样式布局', active: true, displayOrder: 2 },
  { id: 't_vue', name: 'Vue', color: '#10b981', description: 'Vue 全家桶', active: true, displayOrder: 3 },
  { id: 't_react', name: 'React', color: '#0ea5e9', description: 'React 生态', active: true, displayOrder: 4 },
  { id: 't_browser', name: '浏览器', color: '#8b5cf6', description: '渲染与原理', active: true, displayOrder: 5 },
  { id: 't_network', name: '网络', color: '#ec4899', description: 'HTTP/HTTPS', active: true, displayOrder: 6 },
  { id: 't_algo', name: '算法', color: '#14b8a6', description: '数据结构与算法', active: true, displayOrder: 7 },
  { id: 't_node', name: 'Node', color: '#64748b', description: '服务端', active: true, displayOrder: 8 },
];

function q(
  n: number,
  title: string,
  content: string,
  tags: string[],
  difficulty: Question['difficulty'],
  creatorId: string,
  creatorName: string,
  visibility: Question['visibility'] = 'public',
): Question {
  return {
    id: `q_${n}`,
    title,
    content,
    answer: '',
    tags,
    difficulty,
    creatorId,
    creatorName,
    visibility,
    createdAt: daysAgo(n + 2),
    updatedAt: daysAgo(n),
  };
}

export let mockQuestions: Question[] = [
  q(1, '什么是闭包？', '闭包是指**函数与其词法作用域的组合**，函数可以访问定义时所在作用域的变量。\n\n```javascript\nfunction counter() {\n  let count = 0;\n  return () => ++count;\n}\nconst next = counter();\nnext(); // 1\nnext(); // 2\n```\n\n常见用途：\n- 数据私有化\n- 柯里化\n- 防抖节流', ['JavaScript'], 'medium', 'u_admin', 'admin'),
  q(2, 'Flex 布局中 flex: 1 是什么含义？', '`flex: 1` 是三个属性的简写：\n\n- `flex-grow: 1` 放大比例\n- `flex-shrink: 1` 收缩比例\n- `flex-basis: 0%` 基准尺寸\n\n> 注意与 `flex: auto` 的区别在于 basis 不同。', ['CSS'], 'easy', 'u_alex', 'alex'),
  q(3, 'Vue3 的响应式原理和 Vue2 有什么区别？', 'Vue2 使用 `Object.defineProperty`，Vue3 改用 `Proxy`。\n\n主要优势：\n1. 可以监听新增/删除属性\n2. 可以监听数组下标变化\n3. 惰性响应式，性能更好\n\n```javascript\nconst state = reactive({ list: [1, 2] });\nstate.list[2] = 3; // Vue3 可以侦测到\n```\n\n*补充：ref 用于基本类型的包装。*', ['Vue', 'JavaScript'], 'hard', 'u_admin', 'admin'),
  q(4, 'HTTPS 握手过程是怎样的？', 'TLS 握手核心步骤：\n\n1. Client Hello：发送随机数与支持的加密套件\n2. Server Hello：返回证书与随机数\n3. 客户端验证证书，生成预主密钥并用公钥加密发送\n4. 双方基于随机数生成会话密钥\n\n之后使用**对称加密**通信。', ['网络'], 'medium', 'u_lisa', 'lisa'),
  q(5, '事件循环 Event Loop 的执行顺序？', '一次循环的顺序：\n\n- 执行同步代码\n- 清空微任务（Promise.then、queueMicrotask）\n- 取一个宏任务（setTimeout、I/O）\n\n```javascript\nconsole.log(1);\nsetTimeout(() => console.log(2));\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);\n// 输出：1 4 3 2\n```', ['JavaScript', '浏览器'], 'medium', 'u_alex', 'alex'),
  q(6, '二分查找的实现要点', '要求**有序数组**，时间复杂度 `O(log n)`。\n\n```javascript\nfunction search(nums, target) {\n  let left = 0, right = nums.length - 1;\n  while (left <= right) {\n    const mid = (left + right) >> 1;\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}\n```\n\n注意 `left <= right` 与溢出写法 `left + ((right - left) >> 1)`。', ['算法'], 'easy', 'u_admin', 'admin'),
  q(7, 'React Fiber 架构解决了什么问题？', 'Fiber 把渲染拆成**可中断的小任务单元**，通过调度器（Scheduler）按优先级执行。\n\n- 旧架构：递归渲染不可中断，长任务阻塞交互\n- 新架构：requestIdleCallback 思想的时间切片', ['React'], 'hard', 'u_lisa', 'lisa'),
  q(8, '浏览器输入 URL 后发生了什么？', '简化流程：\n\n1. DNS 解析\n2. TCP 三次握手（HTTPS 再加 TLS 握手）\n3. 发送 HTTP 请求\n4. 服务器处理并响应\n5. 浏览器解析渲染：HTML → DOM，CSS → CSSOM，合成渲染树并绘制\n\n> 涉及重绘与回流的知识点常被追问。', ['浏览器', '网络'], 'medium', 'u_admin', 'admin'),
  q(9, 'Node.js 中的流 Stream 有什么用？', '流用于处理**大文件或持续数据**，避免一次性载入内存。\n\n```javascript\nconst rs = fs.createReadStream(\'big.file\');\nrs.pipe(zlib.createGzip()).pipe(fs.createWriteStream(\'big.gz\'));\n```\n\n四种类型：Readable、Writable、Duplex、Transform。', ['Node'], 'medium', 'u_alex', 'alex', 'private'),
  q(10, '防抖和节流的区别与实现', '- **防抖 debounce**：停止触发 n 秒后才执行（搜索框）\n- **节流 throttle**：n 秒内最多执行一次（滚动监听）\n\n```javascript\nfunction debounce(fn, wait) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), wait);\n  };\n}\n```', ['JavaScript', '性能优化'], 'easy', 'u_lisa', 'lisa'),
  q(11, 'Cookie、localStorage、sessionStorage 的区别', '| 特性 | Cookie | localStorage | sessionStorage |\n| --- | --- | --- | --- |\n| 容量 | 4KB | 5MB | 5MB |\n| 生命周期 | 可设置过期 | 永久 | 会话级 |\n| 随请求发送 | 是 | 否 | 否 |', ['浏览器'], 'easy', 'u_admin', 'admin', 'private'),
  q(12, '跨端开发中 rpx 与 px 的换算关系？', '以 750 设计稿为基准：\n\n- `750rpx = 屏幕宽度`\n- 1px（设计稿）= 1rpx（在 375px 宽的设备上为 0.5px 物理的两倍）\n\n> 建议：间距用 8 的倍数 rpx，字号尽量使用设计规范常量。', ['CSS'], 'easy', 'u_admin', 'admin'),
];

export function addMockQuestion(item: Question) {
  mockQuestions = [item, ...mockQuestions];
}

export function updateMockQuestion(id: string, patch: Partial<Question>) {
  mockQuestions = mockQuestions.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
}

export function removeMockQuestion(id: string) {
  mockQuestions = mockQuestions.filter((item) => item.id !== id);
}

export function nextQuestionId(): string {
  return `q_${genId()}`;
}
