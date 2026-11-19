// Torgas : remplace `pdf.js` de foliate-js, qui embarque PDF.js (plusieurs Mo).
// Le PDF est hors du périmètre de la phase 0 ; `view.js` l'importe dynamiquement,
// ce module doit donc exister pour que le build résolve l'import.
export const makePDF = async () => {
    throw new Error('PDF non pris en charge')
}
