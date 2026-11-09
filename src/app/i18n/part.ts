// Un trozo del diccionario: los mismos textos en español y en inglés.
// TypeScript obliga a que el inglés tenga exactamente las mismas claves que el español:
// si falta una traducción, no compila.

export type Params = Record<string, string | number>;

export function part<T extends Record<string, string>>(es: T, en: { [K in keyof T]: string }): { es: T; en: { [K in keyof T]: string } } {
  return { es, en };
}

/** Reemplaza {nombre} por el valor de params.nombre. */
export function format(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (all, k) => (k in params ? String(params[k]) : all));
}
