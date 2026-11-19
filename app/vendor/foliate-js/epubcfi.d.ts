// Déclarations propres à Torgas : sous-ensemble de l'API de foliate-js utilisé par l'app.

export declare const isCFI: RegExp
/** Joint un CFI de section du spine et un CFI interne à son document (`a!b`). */
export declare function joinIndir(...cfis: string[]): string
/** CFI (interne au document) d'une plage du DOM. */
export declare function fromRange(range: Range): string
/** Début (ou fin, `toEnd`) d'un CFI de plage. */
export declare function collapse(cfi: string, toEnd?: boolean): string
/** Ordre de deux CFI dans le livre (négatif si `a` vient avant `b`). */
export declare function compare(a: string, b: string): number
export declare const fake: {
  /** CFI d'une section quand le livre n'en fournit pas. */
  fromIndex(index: number): string
}
