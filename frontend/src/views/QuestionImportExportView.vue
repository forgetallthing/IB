<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { request } from '../api';

const exportText = ref('');
const importText = ref('');
const message = ref('');
const errorMessage = ref('');
const loading = ref(false);

function notice(text: string) {
  message.value = text;
  errorMessage.value = '';
}

function fail(text: string) {
  errorMessage.value = text;
  message.value = '';
}

async function loadExport() {
  loading.value = true;
  try {
    const result = await request<{ format: string; items: unknown[] }>('/questions/export');
    exportText.value = JSON.stringify(result, null, 2);
    notice(`导出成功，共 ${result.items.length} 条`);
  } catch (error) {
    fail(error instanceof Error ? error.message : '导出失败');
  } finally {
    loading.value = false;
  }
}

async function doImport() {
  try {
    const parsed = JSON.parse(importText.value || '{}') as { items?: unknown[] };
    const result = await request<{ ok: boolean; importedIds: string[] }>('/questions/import', {
      method: 'POST',
      body: JSON.stringify({ items: parsed.items ?? [] }),
    });
    notice(`导入成功，写入 ${result.importedIds.length} 条`);
    await loadExport();
  } catch (error) {
    fail(error instanceof Error ? error.message : '导入失败');
  }
}

async function copyExport() {
  await navigator.clipboard.writeText(exportText.value || '');
  notice('已复制导出 JSON');
}

onMounted(loadExport);
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>导入导出</h1>
        <p class="subtitle">导出当前笔记数据，或粘贴 JSON 批量导入。</p>
      </div>
      <button type="button" @click="loadExport" :disabled="loading">{{ loading ? '刷新中…' : '刷新导出' }}</button>
    </header>

    <p v-if="message" class="success">{{ message }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <article class="panel">
      <div class="panel-head">
        <h2>导出内容</h2>
        <button class="secondary" type="button" @click="copyExport">复制</button>
      </div>
      <textarea v-model="exportText" rows="16" readonly></textarea>
    </article>

    <article class="panel">
      <div class="panel-head">
        <h2>导入内容</h2>
        <button type="button" @click="doImport">开始导入</button>
      </div>
      <textarea v-model="importText" rows="16" placeholder='粘贴 {"items": [...] }'></textarea>
    </article>
  </section>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 12px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

h2 {
  margin: 0;
  font-size: 16px;
}

textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
</style>
