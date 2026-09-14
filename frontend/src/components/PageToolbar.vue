<script setup lang="ts">
import { ref, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue';

// 全站固定顶部工具栏：各页页头通过 Teleport 渲染到 App.vue 的 #page-toolbar-slot，
// 工具栏行在滚动容器之外，不参与滚动。
// KeepAlive 失活的页面（含按 path 独立实例的详情页）其传送内容不会自动隐藏，
// 用 v-show 守卫保证同一时刻只有激活实例的页头可见；
// 不能用 Teleport :disabled 切换——disabled 会把内容渲染回页面体内，造成页头在滚动区重复出现。
const visible = ref(true);

onMounted(() => {
  visible.value = true;
});
onUnmounted(() => {
  visible.value = false;
});
onActivated(() => {
  visible.value = true;
});
onDeactivated(() => {
  visible.value = false;
});
</script>

<template>
  <Teleport to="#page-toolbar-slot">
    <header v-show="visible" class="page-header">
      <slot />
    </header>
  </Teleport>
</template>
