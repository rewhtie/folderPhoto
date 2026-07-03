<script setup lang="ts">
import { onMounted, ref } from 'vue'

const emit = defineEmits<{ close: [] }>()

const apiKey = ref('')
const steamId = ref('')
const saving = ref(false)
const savedToast = ref('')

onMounted(async () => {
  const s = await window.imageLibrary.loadSettings()
  apiKey.value = s.apiKey
  steamId.value = s.steamId
})

async function save(): Promise<void> {
  saving.value = true
  try {
    await window.imageLibrary.saveSettings({ apiKey: apiKey.value.trim(), steamId: steamId.value.trim() })
    savedToast.value = '已保存'
    setTimeout(() => (savedToast.value = ''), 1500)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="settings-backdrop" @click.self="emit('close')">
    <div class="settings-dialog">
      <h3>设置</h3>
      <p>配置 Steam Web API 以获取成就图标和名称</p>

      <label class="settings-label">
        Steam Web API Key
        <input v-model="apiKey" type="text" class="settings-input" placeholder="在 steamcommunity.com/dev 申请" autocomplete="off" />
      </label>

      <label class="settings-label">
        Steam ID（64 位）
        <input v-model="steamId" type="text" class="settings-input" placeholder="如 76561198000000000" autocomplete="off" />
      </label>

      <p class="settings-hint">
        API Key 在 <a href="https://steamcommunity.com/dev/apikey" target="_blank">steamcommunity.com/dev/apikey</a> 申请；
        Steam ID 可在个人资料页查看。
      </p>

      <div class="settings-actions">
        <span v-if="savedToast" class="settings-saved">{{ savedToast }}</span>
        <button class="ghost-button" type="button" @click="emit('close')">关闭</button>
        <button class="primary-button" type="button" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.66);
}
.settings-dialog {
  width: 420px;
  max-width: 92vw;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #172033;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.settings-dialog h3 {
  margin: 0 0 8px;
}
.settings-dialog p {
  margin: 0 0 18px;
  color: #94a3b8;
  font-size: 14px;
}
.settings-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  color: #94a3b8;
  font-size: 13px;
}
.settings-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 14px;
}
.settings-hint {
  color: #64748b;
  font-size: 12px;
  margin: 0 0 16px;
}
.settings-hint a {
  color: #7dd3fc;
}
.settings-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}
.settings-saved {
  color: #86efac;
  font-size: 13px;
  margin-right: auto;
}
</style>
