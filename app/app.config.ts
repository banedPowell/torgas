// Thème « papier et brique » : palettes dans assets/css/main.css (@theme).
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'custom-primary',
      // Réservé aux récompenses (série, XP, badges) : aucun usage en phase 0.
      secondary: 'custom-secondary',
      neutral: 'custom-neutral',
    },
    input: { defaultVariants: { variant: 'soft' } },
    select: { defaultVariants: { variant: 'soft' } },
    selectMenu: { defaultVariants: { variant: 'soft' } },
    textarea: { defaultVariants: { variant: 'soft' } },
  },
})
