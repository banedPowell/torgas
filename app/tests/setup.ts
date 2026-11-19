import { config } from '@vue/test-utils'

// Les composants sont montés seuls, hors de `UApp` qui fournit le contexte des info-bulles :
// une info-bulle rend simplement son déclencheur.
config.global.stubs = {
  ...config.global.stubs,
  UTooltip: { template: '<slot />' },
}
