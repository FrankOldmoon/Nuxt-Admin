/**
 * Shared curated list of Lucide icons (`i-lucide-*`) used by icon-picking
 * surfaces across the app (BaseIconPicker, nav link logo field, menu editors).
 *
 * Centralising the list keeps every picker consistent and avoids drift.
 */
export const LUCIDE_ICONS: string[] = [
  // Layout & navigation
  'i-lucide-layout-grid', 'i-lucide-layout-dashboard', 'i-lucide-menu',
  'i-lucide-sidebar', 'i-lucide-navigation', 'i-lucide-compass',
  'i-lucide-map', 'i-lucide-map-pin', 'i-lucide-home', 'i-lucide-external-link',
  // Users & access
  'i-lucide-users', 'i-lucide-user', 'i-lucide-user-cog', 'i-lucide-user-plus',
  'i-lucide-shield', 'i-lucide-shield-check', 'i-lucide-shield-half',
  'i-lucide-key', 'i-lucide-lock', 'i-lucide-unlock',
  'i-lucide-fingerprint', 'i-lucide-badge-check',
  // Files & storage
  'i-lucide-folder', 'i-lucide-folder-open', 'i-lucide-file',
  'i-lucide-file-text', 'i-lucide-file-json', 'i-lucide-file-plus',
  'i-lucide-file-search', 'i-lucide-download', 'i-lucide-upload',
  'i-lucide-cloud', 'i-lucide-cloud-upload', 'i-lucide-hard-drive',
  // Content & editing
  'i-lucide-pencil', 'i-lucide-edit', 'i-lucide-edit-3',
  'i-lucide-pen-tool', 'i-lucide-book', 'i-lucide-book-open',
  'i-lucide-bookmark', 'i-lucide-tag', 'i-lucide-tags',
  'i-lucide-copy', 'i-lucide-clipboard', 'i-lucide-scissors',
  // Communication
  'i-lucide-bell', 'i-lucide-bell-ring', 'i-lucide-bell-off',
  'i-lucide-message', 'i-lucide-message-circle', 'i-lucide-mail',
  'i-lucide-send', 'i-lucide-share', 'i-lucide-share-2',
  // Settings & tools
  'i-lucide-settings', 'i-lucide-settings-2', 'i-lucide-cog',
  'i-lucide-tool', 'i-lucide-tools', 'i-lucide-wrench',
  'i-lucide-sliders', 'i-lucide-sliders-horizontal', 'i-lucide-tune',
  // Data & analytics
  'i-lucide-chart', 'i-lucide-chart-bar', 'i-lucide-chart-line',
  'i-lucide-chart-pie', 'i-lucide-database', 'i-lucide-table',
  'i-lucide-spreadsheet', 'i-lucide-calculator', 'i-lucide-sigma',
  // Media
  'i-lucide-image', 'i-lucide-images', 'i-lucide-video',
  'i-lucide-music', 'i-lucide-play', 'i-lucide-volume',
  'i-lucide-camera', 'i-lucide-palette', 'i-lucide-brush',
  // Status & feedback
  'i-lucide-check', 'i-lucide-check-circle', 'i-lucide-check-circle-2',
  'i-lucide-circle-check', 'i-lucide-x', 'i-lucide-x-circle',
  'i-lucide-alert', 'i-lucide-alert-triangle', 'i-lucide-info',
  'i-lucide-help', 'i-lucide-help-circle', 'i-lucide-question',
  // Time & calendar
  'i-lucide-clock', 'i-lucide-calendar', 'i-lucide-calendar-days',
  'i-lucide-timer', 'i-lucide-hourglass', 'i-lucide-sandwich',
  // E-commerce & finance
  'i-lucide-shopping-cart', 'i-lucide-bag', 'i-lucide-credit-card',
  'i-lucide-wallet', 'i-lucide-coins', 'i-lucide-dollar-sign',
  // Education & science
  'i-lucide-graduation-cap', 'i-lucide-school', 'i-lucide-flask',
  'i-lucide-microscope', 'i-lucide-atom', 'i-lucide-dna',
  'i-lucide-award', 'i-lucide-trophy', 'i-lucide-medal',
  'i-lucide-target', 'i-lucide-flag', 'i-lucide-lightbulb',
  // Misc
  'i-lucide-star', 'i-lucide-heart', 'i-lucide-thumbs-up',
  'i-lucide-eye', 'i-lucide-search', 'i-lucide-filter',
  'i-lucide-zap', 'i-lucide-fire', 'i-lucide-link',
  'i-lucide-globe', 'i-lucide-planet', 'i-lucide-rocket',
  'i-lucide-puzzle', 'i-lucide-pieces', 'i-lucide-gamepad',
  'i-lucide-cake', 'i-lucide-gift', 'i-lucide-party-popper',
  'i-lucide-circle-dashed'
]

/**
 * Filter the shared icon list by a search query (matching the readable label).
 */
export function filterLucideIcons(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return LUCIDE_ICONS
  return LUCIDE_ICONS.filter(name => {
    const label = name.replace('i-lucide-', '').replace(/-/g, ' ')
    return label.includes(q)
  })
}