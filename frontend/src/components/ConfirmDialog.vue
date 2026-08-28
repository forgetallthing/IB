<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { confirmState, resolveConfirm } from '../composables/useConfirm';

const confirmButtonRef = ref<HTMLButtonElement | null>(null);

watch(
  () => confirmState.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    confirmButtonRef.value?.focus();
  },
);

function onKeydown(event: KeyboardEvent) {
  if (!confirmState.visible) return;
  if (event.key === 'Escape') resolveConfirm(false);
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="confirmState.visible" class="confirm-backdrop" @click.self="resolveConfirm(false)">
        <div class="confirm-dialog" role="alertdialog" aria-modal="true">
          <div class="confirm-icon" :class="{ danger: confirmState.danger }">!</div>
          <h3>{{ confirmState.title }}</h3>
          <p>{{ confirmState.message }}</p>
          <div class="confirm-actions">
            <button type="button" class="btn-cancel" @click="resolveConfirm(false)">
              {{ confirmState.cancelText }}
            </button>
            <button
              ref="confirmButtonRef"
              type="button"
              :class="confirmState.danger ? 'btn-danger' : 'btn-primary'"
              @click="resolveConfirm(true)"
            >
              {{ confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 30, 40, 0.4);
  backdrop-filter: blur(6px);
}

.confirm-dialog {
  width: min(400px, 100%);
  padding: 28px 26px 22px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  box-shadow: 0 24px 64px rgba(15, 30, 40, 0.28);
  text-align: center;
}

.confirm-icon {
  width: 46px;
  height: 46px;
  margin: 0 auto 14px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 22px;
  font-weight: 700;
  color: #0d9488;
  background: rgba(13, 148, 136, 0.12);
}

.confirm-icon.danger {
  color: #b3261e;
  background: rgba(179, 38, 30, 0.12);
}

h3 {
  margin: 0 0 8px;
  font-size: 17px;
  letter-spacing: -0.01em;
}

p {
  margin: 0;
  color: #557080;
  font-size: 14px;
  line-height: 1.65;
}

.confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 22px;
}

.btn-cancel,
.btn-danger,
.btn-primary {
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink);
}

.btn-cancel:hover {
  background: rgba(15, 42, 58, 0.06);
}

.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  box-shadow: 0 8px 18px rgba(15, 118, 110, 0.22);
}

.btn-primary:hover {
  transform: translateY(-1px);
}

.btn-danger {
  background: #b3261e;
  color: #fff;
  border: none;
  box-shadow: 0 8px 18px rgba(179, 38, 30, 0.28);
}

.btn-danger:hover {
  background: #a01f18;
  transform: translateY(-1px);
}

.btn-cancel:focus-visible,
.btn-danger:focus-visible,
.btn-primary:focus-visible {
  outline: 2px solid rgba(13, 148, 136, 0.55);
  outline-offset: 2px;
}

/* 过渡动画 */
.confirm-fade-enter-active {
  transition: opacity 0.2s ease;
}

.confirm-fade-enter-active .confirm-dialog {
  animation: confirm-pop 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.confirm-fade-leave-active {
  transition: opacity 0.16s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

@keyframes confirm-pop {
  from {
    transform: scale(0.88) translateY(10px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>
