import { registerEnabledModuleServices } from '../utils/moduleRuntime'

/** Register APIs/tools/UI for every build-time enabled module. */
export default defineNitroPlugin(() => {
  registerEnabledModuleServices()
})
