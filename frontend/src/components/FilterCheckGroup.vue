<script setup lang="ts">
export interface CheckOption {
  value: string;
  label: string;
  color?: string;
}

const props = defineProps<{
  label: string;
  options: CheckOption[];
  modelValue: string[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>();

function toggle(value: string) {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((item) => item !== value)
    : [...props.modelValue, value];
  emit('update:modelValue', next);
}

function selectAll() {
  emit('update:modelValue', []);
}
</script>

<template>
  <div class="check-group">
    <span class="group-label">{{ label }}</span>
    <div class="options">
      <button
        type="button"
        class="check-chip"
        :class="{ on: !modelValue.length }"
        @click="selectAll"
      >
        <span class="box"><i>✓</i></span>全部
      </button>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="check-chip"
        :class="{ on: modelValue.includes(option.value) }"
        @click="toggle(option.value)"
      >
        <span class="box"><i>✓</i></span><i v-if="option.color" class="tag-dot" :style="{ backgroundColor: option.color }"></i>{{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.check-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.group-label {
  flex-shrink: 0;
  width: 52px;
  padding-top: 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.check-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #f4f8fa;
  color: #557080;
  font-size: 13px;
  font-weight: 500;
  box-shadow: none;
  transform: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.check-chip:hover {
  border-color: rgba(13, 148, 136, 0.45);
  background: rgba(13, 148, 136, 0.05);
  transform: none;
}

.check-chip .box {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border: 1px solid var(--line);
  background: #fff;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.check-chip .box i {
  font-style: normal;
  font-size: 11px;
  line-height: 1;
  color: transparent;
  font-weight: 700;
  transition: color 0.15s ease;
}

.check-chip.on {
  background: rgba(13, 148, 136, 0.12);
  border-color: #5eaaa0;
  color: #0f766e;
  font-weight: 600;
}

.check-chip.on .box {
  background: var(--primary);
  border-color: var(--primary);
}

.check-chip.on .box i {
  color: #fff;
}

.check-chip:focus-visible {
  outline: 2px solid rgba(13, 148, 136, 0.55);
  outline-offset: 2px;
}
</style>
