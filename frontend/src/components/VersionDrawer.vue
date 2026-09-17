<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import Vditor from 'vditor';
import { request } from '../api';
import { showConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';

// 历史版本抽屉（详情页/编辑页共用）：父组件用 v-if 控制挂载，挂载即加载版本列表；
// 恢复成功后 emit('restored') 通知父页面静默刷新
interface VersionSummary {
  v: number;
  title: string;
  editorName: string;
  reason: 'edit' | 'restore';
  contentLength: number;
  createdAt: string;
}

interface VersionDetail extends VersionSummary {
  content: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

const props = defineProps<{ questionId: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'restored'): void }>();

const { notice, fail } = useToast();
const versions = ref<VersionSummary[]>([]);
const versionsLoading = ref(false);
const selected = ref<VersionDetail | null>(null);
const versionLoading = ref(false);
const restoring = ref(false);
const previewEl = ref<HTMLDivElement | null>(null);

const previewOptions = {
  lang: 'zh_CN',
  mode: 'light',
  cdn: '/vditor',
  hljs: { style: 'github', lineNumber: false },
} as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadVersions() {
  versionsLoading.value = true;
  try {
    const res = await request<{ items: VersionSummary[] }>(`/questions/${props.questionId}/versions`);
    versions.value = res.items;
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载历史版本失败');
  } finally {
    versionsLoading.value = false;
  }
}

async function selectVersion(summary: VersionSummary) {
  versionLoading.value = true;
  selected.value = null;
  try {
    const detail = await request<VersionDetail>(`/questions/${props.questionId}/versions/${summary.v}`);
    selected.value = detail;
    await nextTick();
    if (previewEl.value && selected.value) {
      Vditor.preview(previewEl.value, selected.value.content, previewOptions);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : '加载版本失败');
  } finally {
    versionLoading.value = false;
  }
}

// 非破坏性恢复：后端先把当前内容存为新版本，再写回快照内容
async function restoreVersion() {
  if (!selected.value || restoring.value) return;
  const version = selected.value;
  const ok = await showConfirm({
    title: '恢复此版本',
    message: `当前内容会先自动保存为一个历史版本，确定恢复到 v${version.v} 吗？`,
    confirmText: '恢复',
  });
  if (!ok) return;
  restoring.value = true;
  try {
    const res = await request<{ ok: boolean; unchanged?: boolean }>(
      `/questions/${props.questionId}/versions/${version.v}/restore`,
      { method: 'POST' },
    );
    if (res.unchanged) {
      notice('内容与当前一致，无需恢复');
      return;
    }
    notice('已恢复该版本');
    selected.value = null;
    emit('restored');
    await loadVersions();
  } catch (error) {
    fail(error instanceof Error ? error.message : '恢复失败');
  } finally {
    restoring.value = false;
  }
}

onMounted(loadVersions);
</script>

<template>
  <!-- 蒙版 z-index 40 在抽屉 50 之下，点蒙版收起 -->
  <Transition name="mask-fade">
    <div class="drawer-mask" @click="emit('close')"></div>
  </Transition>
  <Transition name="drawer-slide">
    <aside class="version-drawer">
      <header class="drawer-head">
        <h2>历史版本</h2>
        <button type="button" class="close-btn" aria-label="关闭" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </header>
      <p class="drawer-hint">保存修改时自动生成快照（保留最近 30 个）。恢复是安全的：当前内容会先自动存为新版本。</p>

      <p v-if="versionsLoading" class="drawer-tip">加载中…</p>
      <p v-else-if="!versions.length" class="drawer-tip">暂无历史版本，保存修改后自动生成。</p>
      <div v-else class="version-list">
        <button
          v-for="vItem in versions"
          :key="vItem.v"
          type="button"
          class="version-item"
          :class="{ active: selected?.v === vItem.v }"
          @click="selectVersion(vItem)"
        >
          <span class="v-badge">v{{ vItem.v }}</span>
          <span class="v-info">
            <span class="v-title">
              {{ vItem.title }}
              <i v-if="vItem.reason === 'restore'" class="v-reason">恢复点</i>
            </span>
            <span class="v-meta">{{ vItem.editorName }} · {{ fmtDate(vItem.createdAt) }} · {{ vItem.contentLength }} 字</span>
          </span>
        </button>
      </div>

      <p v-if="versionLoading" class="drawer-tip">版本加载中…</p>
      <div v-if="selected" class="version-preview">
        <header class="preview-head">
          <span class="preview-title">v{{ selected.v }} · {{ selected.title }}</span>
          <button type="button" class="restore-btn" :disabled="restoring" @click="restoreVersion">
            {{ restoring ? '恢复中…' : '恢复此版本' }}
          </button>
        </header>
        <div ref="previewEl" class="preview-content"></div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 42, 58, 0.42);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.mask-fade-enter-active,
.mask-fade-leave-active {
  transition: opacity 0.2s ease;
}

.mask-fade-enter-from,
.mask-fade-leave-to {
  opacity: 0;
}

.version-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 50;
  width: min(460px, 94vw);
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: auto;
  background: var(--surface);
  border-left: 1px solid var(--line-soft);
  box-shadow: -24px 0 48px rgba(15, 42, 58, 0.18);
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.22s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(102%);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.drawer-head h2 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.01em;
}

.close-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--muted);
  box-shadow: none;
  transform: none;
  cursor: pointer;
}

.close-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.35);
}

@media (hover: hover) {
  .close-btn:hover {
    background: rgba(13, 148, 136, 0.09);
    color: var(--accent);
    transform: none;
    box-shadow: none;
  }
}

.drawer-hint {
  margin: 8px 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}

.drawer-tip {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.version-list {
  display: grid;
  gap: 6px;
}

.version-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  background: none;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  text-align: left;
  font: inherit;
  color: inherit;
  box-shadow: none;
  transform: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.version-item.active {
  background: rgba(13, 148, 136, 0.08);
  border-color: rgba(13, 148, 136, 0.4);
}

@media (hover: hover) {
  .version-item:hover {
    background: rgba(13, 148, 136, 0.06);
    transform: none;
    box-shadow: none;
  }
}

.v-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-tint);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}

.version-item.active .v-badge {
  background: rgba(13, 148, 136, 0.14);
  color: var(--accent);
}

.v-info {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.v-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v-reason {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(13, 148, 136, 0.12);
  color: var(--accent);
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
  vertical-align: 1px;
}

.v-meta {
  font-size: 12px;
  color: var(--muted);
}

.version-preview {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line-soft);
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.preview-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.restore-btn {
  flex-shrink: 0;
  padding: 5px 12px;
  border: none;
  border-radius: 9px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.restore-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (hover: hover) {
  .restore-btn:hover:not(:disabled) {
    background: var(--primary-strong);
  }
}

.restore-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.35);
}

.preview-content {
  font-size: 14px;
  line-height: 1.75;
  color: #4a5b6a;
  overflow-wrap: anywhere;
}

.preview-content :deep(p) {
  margin: 0 0 8px;
}

.preview-content :deep(pre) {
  max-width: 100%;
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f4f7f9;
  overflow-x: auto;
}

.preview-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}
</style>
