/** Stesso formato dei codici di zona del plugin (4-8 lettere maiuscole e cifre). */
const CODE = /^[A-Z0-9]{4,8}$/;

/**
 * Ricava il codice di zona da ciò che contiene un QR: il link `…/play?zona=CODICE` stampato dalla regia,
 * oppure il solo codice. Qualunque altra cosa (un QR qualsiasi inquadrato per caso) dà `null`.
 */
export function extractZoneCode(text: string): string | null {
  const raw = text.trim();
  let candidate = raw;
  try {
    const param = new URL(raw).searchParams.get("zona");
    if (param) candidate = param;
    else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null; // un link senza zona
  } catch {
    /* non è un indirizzo: può essere il codice nudo */
  }
  const code = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CODE.test(code) ? code : null;
}
