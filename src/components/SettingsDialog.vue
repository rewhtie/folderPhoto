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
  <div
    class="fixed inset-0 z-11 flex items-center justify-center bg-[var(--backdrop)]"
    @click.self="emit('close')"
  >
    <div
      class="w-420px max-w-92vw border border-[var(--border)] rounded-18px bg-[var(--panel-background-solid)] p-24px [box-shadow:var(--shadow-dialog)]"
    >
      <h3 class="m-0 mb-8px">设置</h3>
      <p class="m-0 mb-18px text-14px text-[var(--text-muted)]">
        配置 Steam Web API 以获取成就图标和名称
      </p>

      <label class="mb-16px flex flex-col gap-6px text-13px text-[var(--text-muted)]">
        Steam Web API Key
        <input
          v-model="apiKey"
          type="text"
          class="w-full border border-[var(--border)] rounded-8px bg-[var(--input-background-soft)] px-12px py-8px text-14px text-[var(--text-primary)]"
          placeholder="在 steamcommunity.com/dev 申请"
          autocomplete="off"
        />
      </label>

      <label class="mb-16px flex flex-col gap-6px text-13px text-[var(--text-muted)]">
        Steam ID（64 位）
        <input
          v-model="steamId"
          type="text"
          class="w-full border border-[var(--border)] rounded-8px bg-[var(--input-background-soft)] px-12px py-8px text-14px text-[var(--text-primary)]"
          placeholder="如 76561198000000000"
          autocomplete="off"
        />
      </label>

      <p class="m-0 mb-16px text-12px text-[var(--text-faint)]">
        API Key 在
        <a
          class="text-[var(--accent)]"
          href="https://steamcommunity.com/dev/apikey"
          target="_blank"
        >steamcommunity.com/dev/apikey</a>
        申请； Steam ID 可在个人资料页查看。
      </p>

      <div class="flex items-center justify-end gap-10px">
        <span v-if="savedToast" class="mr-auto text-13px text-[var(--success-text)]">
          {{ savedToast }}
        </span>
        <button
          class="cursor-pointer border border-[var(--border-strong)] rounded-12px bg-transparent px-12px py-8px text-[var(--text-soft)]"
          type="button"
          @click="emit('close')"
        >
          关闭
        </button>
        <button
          class="cursor-pointer border-0 rounded-14px bg-[var(--accent)] px-22px py-11px text-15px font-800 text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-68"
          type="button"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>
