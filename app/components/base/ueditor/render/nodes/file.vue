<template>
  <div class="umo-node-view" :style="nodeStyle" data-node-view-wrapper="">
    <div
      class="umo-node-container hover-shadow umo-select-outline umo-node-file"
      style="width: 220px"
    >
      <div class="umo-file-icon">
        <img :src="iconUrl" class="icon-file" />
      </div>
      <div class="umo-file-info">
        <div class="umo-file-name" :title="attrs.name || ''">
          {{ attrs.name || $t('ueditor.file.unknown') }}
        </div>
        <div class="umo-file-meta">{{ sizeText }}</div>
      </div>
      <div class="umo-file-action">
        <a
          v-if="attrs.url"
          :href="attrs.url"
          :download="attrs.name"
          target="_blank"
          class="umo-action-item"
          :title="$t('ueditor.file.download')"
        >↓</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computeAtomNodeStyle } from '../helpers'

const CDN_URL = 'https://unpkg.com/@umoteam/editor-external@latest'

const { t } = useI18n()

const fileTypes = {
  ai: ['ai', 'eps'],
  app: ['app'],
  axure: ['rp'],
  book: ['mobi', 'oeb', 'lit', 'xeb', 'ebx', 'rb', 'pdb', 'epub', 'azw3', 'hlp', 'chm', 'wdl', 'ceb', 'abm', 'pdg', 'caj'],
  css: ['css', 'less', 'sass'],
  dmg: ['dmg'],
  excel: ['csv', 'fods', 'ods', 'ots', 'xls', 'xlsm', 'xlsx', 'xlt', 'xltm', 'xltx', 'et', 'ett'],
  exe: ['exe'],
  html: ['htm', 'html', 'mht'],
  img: ['png', 'bmp', 'jpg', 'jpeg', 'gif', 'webp', 'tga', 'exif', 'fpx', 'svg', 'hdri', 'raw', 'ico', 'jfif', 'dib', 'pbm', 'pgm', 'ppm', 'rgb'],
  java: ['jar', 'java'],
  js: ['js', 'jsx', 'ts', 'tsx'],
  json: ['json'],
  keynote: ['key'],
  md: ['md', 'markdown'],
  music: ['au', 'aif', 'aiff', 'aifc', 'rmi', 'mp3', 'mid', 'cda', 'wav', 'wma', 'ra', 'ram', 'snd', 'mida', 'ogg', 'ape', 'flac', 'aac'],
  numbers: ['numbers'],
  pages: ['pages'],
  pdf: ['pdf'],
  ppt: ['dps', 'dpt', 'pot', 'potm', 'potx', 'pps', 'ppsm', 'ppsx', 'ppt', 'pptm', 'pptx'],
  psd: ['psd'],
  rar: ['rar', '7z', 'gz', 'tar', 'zip'],
  sketch: ['sketch'],
  txt: ['txt', 'log'],
  video: ['wmv', 'rmvb', 'mpeg4', 'mp4', 'avi', 'rm', 'flv', 'mkv', 'mov', '3gp', 'f4v', 'asf', 'mts', 'vob'],
  visio: ['vsd', 'vsdx'],
  word: ['doc', 'docm', 'docx', 'dot', 'dotm', 'dotx', 'rtf', 'wps', 'wpt'],
  xd: ['xd'],
}

const getFileIcon = (filename) => {
  let iconName = 'common'
  const extname = filename?.split('.').pop()?.toLowerCase()
  if (extname) {
    for (const type of Object.keys(fileTypes)) {
      if (fileTypes[type].includes(extname)) {
        iconName = type
      }
    }
  }
  return iconName
}

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})

const nodeStyle = computed(() => computeAtomNodeStyle(attrs.value))

const iconUrl = computed(
  () => `${CDN_URL}/icons/file/${getFileIcon(attrs.value.name)}.svg`,
)

const sizeText = computed(() => {
  const size = attrs.value.size
  if (!size && size !== 0) return t('ueditor.file.unknownSize')
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
})
</script>
