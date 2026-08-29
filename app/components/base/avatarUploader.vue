<script setup lang="ts">
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'
import type { PublicUser } from '~/types/auth'
import type { FileRecord } from '~/types/file'

interface UploadResult extends FileRecord {
  duplicated: boolean
}

const props = defineProps<{
  user: Pick<PublicUser, 'id' | 'username' | 'avatarPath'>
  size?: number
}>()

const emit = defineEmits<{
  updated: [user: PublicUser]
  error: [message: string]
}>()

const { t } = useI18n()
const toast = useToast()

const size = computed(() => props.size ?? 128)

const inputRef = ref<HTMLInputElement>()
const cropperOpen = ref(false)
const imageSrc = ref<string>('')
const cropperCanvas = ref<HTMLCanvasElement | null>(null)
const isUploading = ref(false)
const isRemoving = ref(false)

// Cache-busting query for avatar img
const avatarVersion = ref(Date.now())
const avatarUrl = computed(() => {
  if (!props.user.avatarPath) return ''
  return `/api/files/serve/${props.user.avatarPath}?v=${avatarVersion.value}`
})

function openPicker() {
  inputRef.value?.click()
}

function onInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  void onFileSelected(file)
}

async function onFileSelected(file: File) {
  if (!isImageFile(file)) {
    toast.add({ title: t('avatar.errors.imageOnly'), color: 'error' })
    return
  }
  if (isGifFile(file)) {
    toast.add({ title: t('avatar.errors.noGif'), color: 'error' })
    return
  }
  try {
    imageSrc.value = await readFileAsDataURL(file)
    cropperOpen.value = true
  } catch {
    toast.add({ title: t('avatar.errors.loadFailed'), color: 'error' })
  }
}

function onCropperChange({ canvas }: { canvas: HTMLCanvasElement | null }) {
  cropperCanvas.value = canvas
}

async function getCroppedBlob(): Promise<Blob | null> {
  const canvas = cropperCanvas.value
  if (!canvas) return null
  return new Promise((resolve) => {
    canvas.toBlob(blob => resolve(blob), 'image/png')
  })
}

async function confirmCrop() {
  const blob = await getCroppedBlob()
  if (!blob) {
    toast.add({ title: t('avatar.errors.cropFailed'), color: 'error' })
    return
  }
  cropperOpen.value = false
  await uploadAvatar(blob)
}

function cancelCrop() {
  cropperOpen.value = false
  imageSrc.value = ''
  cropperCanvas.value = null
}

async function uploadAvatar(croppedBlob: Blob) {
  isUploading.value = true
  try {
    // 1. Compress cropped image to WebP
    const webpFile = await compressImageToWebp(croppedBlob, {
      maxSizeMB: 1,
      maxWidthOrHeight: 512,
      initialQuality: 0.85
    })
    const fileToUpload = new File([webpFile], 'avatar.webp', { type: 'image/webp' })

    // 2. Reuse /api/files/upload to store the avatar file (with hash dedup)
    const formData = new FormData()
    formData.append('files', fileToUpload)
    const uploadRes = await $fetch<{ files: UploadResult[] }>('/api/files/upload', {
      method: 'POST',
      body: formData
    })
    const uploaded = uploadRes.files[0]
    if (!uploaded) {
      throw new Error(t('avatar.errors.uploadFailed'))
    }

    // 3. Link the file path to the user via profile update
    const data = await $fetch<{ user: PublicUser }>('/api/auth/profile', {
      method: 'PUT',
      body: { avatarPath: uploaded.path }
    })

    avatarVersion.value = Date.now()
    emit('updated', data.user)
    toast.add({ title: t('avatar.updated'), color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || t('avatar.errors.uploadFailed')
    emit('error', msg)
    toast.add({ title: msg, color: 'error' })
  } finally {
    isUploading.value = false
    imageSrc.value = ''
    cropperCanvas.value = null
  }
}

async function removeAvatar() {
  if (!props.user.avatarPath) return
  isRemoving.value = true
  try {
    // Only unlink the avatar; the underlying file record remains manageable in /files
    const data = await $fetch<{ user: PublicUser }>('/api/auth/profile', {
      method: 'PUT',
      body: { avatarPath: null }
    })
    avatarVersion.value = Date.now()
    emit('updated', data.user)
    toast.add({ title: t('avatar.removed'), color: 'success' })
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || t('avatar.errors.removeFailed')
    emit('error', msg)
    toast.add({ title: msg, color: 'error' })
  } finally {
    isRemoving.value = false
  }
}

function avatarInitial(username: string): string {
  return username?.charAt(0)?.toUpperCase() || '?'
}
</script>

<template>
  <div class="flex items-center gap-4">
    <!-- Avatar preview -->
    <div
      class="relative shrink-0 overflow-hidden rounded-full bg-elevated ring-2 ring-default"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="user.username"
        class="h-full w-full object-cover"
      >
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-2xl font-bold text-muted"
      >
        {{ avatarInitial(user.username) }}
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-upload"
          size="sm"
          :label="t('avatar.upload')"
          :loading="isUploading"
          @click="openPicker"
        />
        <BaseConfirmButton
          v-if="user.avatarPath"
          icon="i-lucide-trash"
          size="sm"
          color="error"
          variant="soft"
          :label="t('avatar.remove')"
          :confirm-text="t('avatar.confirmRemove')"
          :loading="isRemoving"
          @confirm="removeAvatar"
        />
      </div>
      <p class="text-xs text-muted">
        {{ t('avatar.hint') }}
      </p>
      <input
        ref="inputRef"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp"
        class="hidden"
        @change="onInputChange"
      >
    </div>

    <!-- Cropper modal -->
    <UModal
      v-model:open="cropperOpen"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #header>
        <h3 class="text-lg font-semibold text-highlighted">
          {{ t('avatar.cropperTitle') }}
        </h3>
      </template>

      <template #body>
        <div class="mx-auto max-w-md">
          <Cropper
            :src="imageSrc"
            :stencil-props="{ aspectRatio: 1 }"
            class="h-80 w-full rounded-lg bg-muted"
            @change="onCropperChange"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="cancelCrop"
          />
          <UButton
            icon="i-lucide-check"
            :label="t('avatar.confirm')"
            @click="confirmCrop"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
