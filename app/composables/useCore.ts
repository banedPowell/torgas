import type { CoreBridge } from '~/services/core/bridge'

/** Accès au cœur, réservé aux composables : un composant ne l'appelle jamais. */
export function useCore(): CoreBridge {
  return useNuxtApp().$core
}
