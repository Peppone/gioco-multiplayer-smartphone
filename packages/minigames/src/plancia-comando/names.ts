/**
 * Nomi d'esempio dei comandi della Plancia di Comando: «sostantivo + aggettivo», come «Valvola Gelatinosa» o «Defibrillatore
 * Quantico». Sono contenuto d'esempio: la regia li può cambiare nell'istanza. Gli aggettivi stanno al maschile e si
 * accordano da soli con i sostantivi femminili (vedi `makeName`).
 */
export const DEFAULT_NOUNS = [
  "Valvola", "Leva", "Turbina", "Ugello", "Defibrillatore", "Condensatore", "Manopola", "Pistone", "Reattore", "Antenna",
  "Bobina", "Pompa", "Filtro", "Ingranaggio", "Sensore", "Motore", "Radar", "Propulsore", "Generatore", "Stabilizzatore",
  "Modulatore", "Iniettore", "Compressore", "Trasmettitore", "Rotore", "Ventola", "Serbatoio", "Cilindro", "Convertitore", "Amplificatore",
  "Deviatore", "Oscillatore", "Regolatore", "Analizzatore", "Cuscinetto", "Interruttore", "Bussola", "Sirena", "Pedale", "Campana",
  "Puleggia", "Molla", "Imbuto", "Frullatore", "Brodo", "Trivella", "Fornello", "Ciambella", "Polpetta", "Cappello",
  "Ombrello", "Orologio", "Pettine", "Specchio", "Tenda", "Mestolo", "Cucchiaio", "Calzino", "Bottone", "Fischietto",
];

export const DEFAULT_ADJECTIVES = [
  "Quantico", "Gelatinoso", "Cosmico", "Pigro", "Morbido", "Instabile", "Sbadato", "Fosforescente", "Ipnotico", "Brontolone",
  "Magnetico", "Vibrante", "Galattico", "Sonnolento", "Elastico", "Zuccherato", "Turbolento", "Spaziale", "Cremoso", "Bizzarro",
  "Rumoroso", "Fluttuante", "Sbilenco", "Iridescente", "Scoppiettante", "Tremolante", "Timido", "Furtivo", "Ribelle", "Peloso",
  "Cortese", "Gommoso", "Scintillante", "Granuloso", "Allegro", "Mattiniero", "Dispettoso", "Fumoso", "Nebuloso", "Ondulato",
  "Piccante", "Salato", "Bollente", "Gelato", "Sospettoso", "Vorace", "Pomposo", "Zigzagante", "Sognante", "Pelato",
  "Smemorato", "Chiacchierone", "Birichino", "Scontroso", "Vellutato", "Esplosivo", "Pasticcione", "Fortunato", "Perplesso", "Saltellante",
];

/** Valori dei selettori («Imposta … su TURBO»): parole facili da gridare. */
export const SELECTOR_VALUES = ["TURBO", "ECO", "SALTO", "FRENO", "LENTO", "RAPIDO", "NOTTE", "GIORNO", "ALFA", "BETA", "GAMMA", "DELTA", "CALDO", "FREDDO", "ZERO", "MAX"];

/** Il sostantivo è femminile? (euristica: finisce in «a», «à», «ù» o «ione») */
export const isFeminine = (noun: string): boolean => /(a|à|ù|ione)$/i.test(noun.trim());

/** «Valvola» + «Gelatinoso» → «Valvola Gelatinosa»; i sostantivi maschili e gli aggettivi in «-e» non cambiano. */
export function makeName(noun: string, adjective: string): string {
  const adj = isFeminine(noun) && /o$/i.test(adjective) ? `${adjective.slice(0, -1)}a` : adjective;
  return `${noun} ${adj}`;
}

/** L'articolo determinativo del nome («la Valvola Gelatinosa», «l'Ugello Morbido», «lo Scudo», «il Reattore»). */
export function withArticle(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (/^[aeiouàèéìòù]/i.test(first)) return `l'${name}`;
  if (isFeminine(first)) return `la ${name}`;
  return /^(s[^aeiou]|z|gn|ps|x|y)/i.test(first) ? `lo ${name}` : `il ${name}`;
}
