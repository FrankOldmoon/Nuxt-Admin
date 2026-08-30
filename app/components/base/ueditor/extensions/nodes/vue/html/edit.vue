<template>
    <div class="w-full space-y-2 flex flex-col">
        <div class="flex items-center gap-2">
            <label class="text-xs text-gray-500 shrink-0">{{ t('html.height') }}</label>
            <UInput v-model.number="height" type="number" size="xs" min="0" class="w-32"
                :placeholder="t('html.heightPlaceholder')" />
        </div>
        <BaseMonaco v-model="html" language="html" />
        <UButton size="xs" color="primary" class="self-end mt-2" @click="emit('close')">
            {{ t('common.save') }}
        </UButton>
    </div>
</template>

<script setup>
const props = defineProps({
    config: { type: String, default: '' },
    height: { type: [Number, String], default: 0 },
})
const emit = defineEmits(['update:config', 'update:height', 'close'])
const { t } = useI18n()

const html = ref(props.config || '')
const height = ref(Number(props.height) || 0)

// 实时预览：输入时即通知父组件持久化
watch(html, () => {
    emit('update:config', html.value)
})
watch(height, (v) => {
    emit('update:height', Number(v) || 0)
})
</script>
