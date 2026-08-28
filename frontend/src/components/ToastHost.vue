<script setup lang="ts">
import { toastState } from '../composables/useToast';

const items = toastState().items;
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="item in items" :key="item.id" class="toast" :class="item.type" role="status">
          <span class="toast-icon">{{ item.type === 'success' ? '✓' : '!' }}</span>
          <span class="toast-text">{{ item.text }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 360px;
  padding: 12px 18px 12px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--line-soft);
  box-shadow: 0 12px 32px rgba(15, 42, 58, 0.14);
  font-size: 14px;
  color: var(--ink);
}

.toast-icon {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.toast.success .toast-icon {
  background: var(--primary);
}

.toast.error .toast-icon {
  background: var(--danger);
}

.toast.error {
  border-color: rgba(220, 38, 38, 0.25);
}

.toast-text {
  line-height: 1.5;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
