export interface PublicConfigData {
  configs: Record<string, string>
}

/** Shared public site config fetcher; cached under the 'config:public' key. */
export function usePublicConfig() {
  return useAsyncData<PublicConfigData>(
    'config:public',
    () => cGet<PublicConfigData>('/api/config/public'),
    { default: () => ({ configs: {} }) }
  )
}
