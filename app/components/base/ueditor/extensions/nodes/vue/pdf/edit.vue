<template>
    <UFormField :label="t('ueditor.pdfFile')" size="sm">
        <div class="flex items-center gap-2">
            <UInput v-model="fileUrl" :placeholder="t('ueditor.pdfSelectHint')" size="sm" class="flex-1" />
            <UButton icon="i-lucide-upload" size="sm" variant="outline" color="neutral" :label="t('common.upload')"
                @click="triggerUpload" />
            <input ref="fileInput" type="file" accept=".pdf,.PDF" class="hidden" @change="onFileChange" />
        </div>
    </UFormField>
    <UFormField :label="t('ueditor.pdfPages')" size="sm" :hint="t('ueditor.pdfPagesHint')">
        <UInput v-model="configPages" :placeholder="'1-3, 5, 8-10'" size="sm" />
    </UFormField>
    <UFormField :label="t('ueditor.pdfHeight')" size="sm">
        <UInput v-model.number="configHeight" type="number" size="sm" :placeholder="800" />
    </UFormField>
    <UButton size="xs" color="primary" @click="apply">{{ t('common.save') }}</UButton>
</template>

<script setup>
const props = defineProps({
    config: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:config', 'close'])
const { t } = useI18n()

const fileUrl = ref(props.config?.url || '')
const configPages = ref(props.config?.pages || '')
const configHeight = ref(props.config?.height || 800)

const fileInput = ref(null)
const uploading = ref(false)
const toast = useToast()

function triggerUpload() {
    fileInput.value?.click()
}

async function onFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    uploading.value = true
    try {
        const formData = new FormData()
        formData.append('files', file)
        const res = await $fetch('/api/files/upload', {
            method: 'POST',
            body: formData,
        })
        const uploaded = res?.files?.[0] || res?.data?.[0]
        const path = uploaded?.path || uploaded?.url
        if (path) {
            fileUrl.value = path.startsWith('http') ? path : `/api/files/serve/${path}`
        } else {
            toast.add({ title: t('common.uploadFailed'), color: 'error' })
        }
    } catch {
        toast.add({ title: t('common.uploadFailed'), color: 'error' })
    } finally {
        uploading.value = false
    }
}

function apply() {
    const newConfig = {
        ...props.config,
        url: fileUrl.value || props.config?.url,
        pages: configPages.value.trim(),
        height: Number(configHeight.value) || 800,
    }
    emit('update:config', newConfig)
    emit('close')
}
</script>
