<template>
  <!-- Dashboard layout: left sidebar + main content area. -->
  <!-- The layout component itself is NOT a Nuxt "layout:" file (layouts/); -->
  <!-- it's a reusable Vue component mounted directly inside pages/dashboard.vue -->
  <!-- so it can receive metadata props from the page's useAsyncData. -->
  <slot name="default" />
</template>
