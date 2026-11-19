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
    // Barres de progression de la maquette : 3 px (cartes, volumes) et 4 px (import).
    progress: {
      compoundVariants: [
        { orientation: 'horizontal', size: '2xs', class: 'h-[3px]' },
        { orientation: 'horizontal', size: 'xs', class: 'h-1' },
      ],
    },
    // Curseurs de la maquette : poignée pleine de la couleur d'accent.
    slider: {
      variants: { color: { primary: { thumb: 'bg-primary ring-primary outline-primary/25' } } },
      // Piste de 4 px et poignée de 18 px (lecteurs) ; la zone de prise fait 44 px sans changer la mise en page.
      compoundVariants: [
        {
          orientation: 'horizontal',
          size: 'lg',
          class: { root: 'min-h-11 -my-2.5', track: 'h-1', thumb: 'size-[18px]' },
        },
      ],
    },
  },
})
