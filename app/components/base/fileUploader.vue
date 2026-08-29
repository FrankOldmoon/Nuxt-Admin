<script setup lang="ts">
import type { FileRecord } from '~/types/file'

interface UploadResult extends FileRecord {
  duplicated: boolean
}

const props = withDefaults(defineProps<{
  accept?: string
  maxSize?: number // bytes, 0 = unlimited; undefined = read from publicConfig
  multiple?: boolean
  endpoint?: string
}>(), {
  accept: '',
  maxSize: 0,
  multiple: true,
  endpoint: '/api/files/upload'
})

const emit = defineEmits<{
  uploaded: [files: UploadResult[]]
  error: [message: string]
}>()

const { t } = useI18n()
const toast = useToast()

// Read upload limits from public config (exposed at /api/config/public)
const { data: publicConfig } = usePublicConfig()

// Effective max file size in bytes (0 = unlimited)
const effectiveMaxSize = computed<number>(() => {
  if (props.maxSize > 0) return props.maxSize
  const mb = Number(publicConfig.value?.configs?.['upload.maxFileSize'] || 0)
  return mb > 0 ? mb * 1024 * 1024 : 0
})

// Effective accept string: explicit prop wins, else allowedMimeTypes from config
const effectiveAccept = computed<string>(() => {
  if (props.accept) return props.accept
  return publicConfig.value?.configs?.['upload.allowedMimeTypes'] || ''
})

const inputRef = ref<HTMLInputElement>()
const isDragging = ref(false)
const isUploading = ref(false)
const progress = ref(0)
const results = ref<UploadResult[]>([])
const compressing = ref(false)

function openPicker() {
  inputRef.value?.click()
}

function onInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) {
    void uploadFiles(Array.from(target.files))
    target.value = ''
  }
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) {
    void uploadFiles(Array.from(e.dataTransfer.files))
  }
}

function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files
  if (files?.length) {
    void uploadFiles(Array.from(files))
  }
}

function isAccepted(file: File): boolean {
  const accept = effectiveAccept.value
  if (!accept) return true
  const patterns = accept.split(',').map(p => p.trim().toLowerCase())
  for (const pattern of patterns) {
    if (pattern === '*/*' || pattern === '*') return true
    if (pattern.endsWith('/*')) {
      if (file.type.startsWith(pattern.slice(0, -1))) return true
    } else if (pattern.startsWith('.')) {
      if (file.name.toLowerCase().endsWith(pattern)) return true
    } else if (file.type === pattern) {
      return true
    }
  }
  return false
}

function validate(file: File): string | null {
  if (!isAccepted(file)) {
    return t('files.upload.invalidType', { name: file.name })
  }
  const max = effectiveMaxSize.value
  if (max > 0 && file.size > max) {
    return t('files.upload.tooLarge', { name: file.name, max: formatBytes(max) })
  }
  return null
}

async function uploadFiles(files: File[]) {
  if (!props.multiple && files.length > 1) {
    files = [files[0]!]
  }

  const errors: string[] = []
  const valid: File[] = []
  for (const file of files) {
    const err = validate(file)
    if (err) errors.push(err)
    else valid.push(file)
  }

  if (errors.length > 0) {
    toast.add({ title: errors.join('\n'), color: 'error' })
  }
  if (valid.length === 0) return

  // Compress image files to WebP before upload
  compressing.value = true
  const prepared: File[] = []
  const compressErrors: string[] = []
  for (const file of valid) {
    if (!isImageFile(file)) {
      prepared.push(file)
      continue
    }
    try {
      const webp = await compressImageToWebp(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 2048,
        initialQuality: 0.8
      })
      // Preserve original filename base but use .webp extension
      const baseName = file.name.replace(/\.[^.]+$/, '')
      prepared.push(new File([webp], `${baseName}.webp`, { type: 'image/webp' }))
    } catch {
      compressErrors.push(t('files.upload.compressFailed', { name: file.name }))
    }
  }
  compressing.value = false

  if (compressErrors.length > 0) {
    toast.add({ title: compressErrors.join('\n'), color: 'warning' })
  }
  if (prepared.length === 0) return

  isUploading.value = true
  progress.value = 0
  results.value = []

  const formData = new FormData()
  for (const file of prepared) {
    formData.append('files', file)
  }

  const xhr = new XMLHttpRequest()
  xhr.open('POST', props.endpoint)
  xhr.withCredentials = true

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      progress.value = Math.round((e.loaded / e.total) * 100)
    }
  }

  xhr.onload = () => {
    isUploading.value = false
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const response = JSON.parse(xhr.responseText) as { files: UploadResult[] }
        results.value = response.files
        emit('uploaded', response.files)
        toast.add({
          title: t('files.upload.success', { count: response.files.length }),
          color: 'success'
        })
      } catch {
        emit('error', t('files.upload.parseError'))
        toast.add({ title: t('files.upload.parseError'), color: 'error' })
      }
    } else {
      const msg = (() => {
        try {
          return (JSON.parse(xhr.responseText) as { message?: string }).message
        } catch {
          return null
        }
      })() || t('files.upload.failed')
      emit('error', msg)
      toast.add({ title: msg, color: 'error' })
    }
  }

  xhr.onerror = () => {
    isUploading.value = false
    emit('error', t('files.upload.failed'))
    toast.add({ title: t('files.upload.failed'), color: 'error' })
  }

  xhr.send(formData)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function serveUrl(path: string): string {
  return `/api/files/serve/${path}`
}
function downloadUrl(path: string): string {
  return `/api/files/download/${path}`
}
</script>

<template>
  <div
    class="space-y-4"
    @paste="onPaste"
  >
    <!-- Drop zone -->
    <div
      class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      :class="isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-primary'"
      @click="openPicker"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <UIcon
        name="i-lucide-upload-cloud"
        class="mb-2 size-10 text-muted"
      />
      <p class="text-sm font-medium">
        {{ t('files.upload.dropzone') }}
      </p>
      <p class="mt-1 text-xs text-muted">
        {{ t('files.upload.paste') }}
      </p>
      <p
        v-if="effectiveMaxSize > 0"
        class="mt-1 text-xs text-muted"
      >
        {{ t('files.upload.maxSizeHint', { max: formatBytes(effectiveMaxSize) }) }}
      </p>
      <input
        ref="inputRef"
        type="file"
        class="hidden"
        :accept="effectiveAccept"
        :multiple="multiple"
        @change="onInputChange"
      >
    </div>

    <!-- Progress -->
    <div
      v-if="compressing"
      class="space-y-1"
    >
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted">{{ t('files.upload.compressing') }}</span>
        <UIcon
          name="i-lucide-loader-2"
          class="size-4 animate-spin"
        />
      </div>
    </div>

    <div
      v-if="isUploading"
      class="space-y-1"
    >
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted">{{ t('files.upload.uploading') }}</span>
        <span class="font-medium">{{ progress }}%</span>
      </div>
      <UProgress
        :model-value="progress"
        size="sm"
      />
    </div>

    <!-- Results -->
    <div
      v-if="results.length > 0"
      class="space-y-2"
    >
      <div
        v-for="f in results"
        :key="f.id"
        class="flex items-center justify-between rounded-md border border-default p-2 text-sm"
      >
        <div class="flex min-w-0 items-center gap-2">
          <UIcon
            :name="f.duplicated ? 'i-lucide-copy' : 'i-lucide-check-circle'"
            :class="f.duplicated ? 'text-warning' : 'text-success'"
            class="size-4 shrink-0"
          />
          <div class="min-w-0">
            <p class="truncate font-medium">
              {{ f.originalName }}
            </p>
            <p class="text-xs text-muted">
              {{ formatBytes(f.size) }}
              <span v-if="f.duplicated">· {{ t('files.upload.duplicated') }}</span>
            </p>
          </div>
        </div>
        <div class="flex shrink-0 gap-1">
          <UButton
            :to="serveUrl(f.path)"
            external
            target="_blank"
            icon="i-lucide-eye"
            size="xs"
            color="neutral"
            variant="ghost"
            :title="t('common.preview')"
          />
          <UButton
            :to="downloadUrl(f.path)"
            external
            icon="i-lucide-download"
            size="xs"
            color="neutral"
            variant="ghost"
            :title="t('common.download')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
