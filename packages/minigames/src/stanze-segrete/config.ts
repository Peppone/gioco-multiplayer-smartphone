import { z } from "zod";
import { cellCount, findWordPath, isCorner } from "./map.js";

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

const roomSchema = z.object({
  letter: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]$/, "Una sola lettera maiuscola (o cifra)")
    .meta({ title: "Lettera", description: "La lettera nascosta nella stanza" }),
  note: z.string().trim().max(400).default("").meta({ title: "Nota per il GM", description: "Solo per il Game Master (es. la descrizione da leggere ai giocatori)", widget: "textarea" }),
});

const customActionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,20}$/, "Minuscole, cifre e trattini (max 20)").meta({ title: "Codice", description: "Es. usa-chiave" }),
  label: z.string().trim().min(1).max(30).meta({ title: "Testo del pulsante", description: "Es. «Usa la chiave»" }),
});

const itemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,20}$/, "Minuscole, cifre e trattini (max 20)").meta({ title: "Codice", description: "Es. scopa" }),
  name: z.string().trim().min(1).max(30).meta({ title: "Nome", description: "Lo conoscono i giocatori solo se il Master lo palesa" }),
  icon: z.string().trim().min(1).max(8).default("📦").meta({ title: "Icona", description: "Un'emoji" }),
  text: z.string().trim().max(600).default("").meta({ title: "Testo leggibile", description: "Es. il messaggio di una lettera o di un libro: lo leggono solo i giocatori a cui il Master palesa l'oggetto", widget: "textarea" }),
  note: z.string().trim().max(400).default("").meta({ title: "Nota per il GM", description: "Solo per il Game Master (a cosa serve, cosa succede se usato)", widget: "textarea" }),
  cell: z.number().int().min(0).max(24).nullable().default(null).meta({ title: "Stanza iniziale", description: "Numero (da 0) della stanza in cui si trova; vuoto = in nessuna stanza. Il Master può spostarlo quando vuole" }),
});

/** Oggetti di esempio, da assegnare a una stanza dal Master. */
export const SAMPLE_ITEMS = [
  { id: "scopa", name: "Una scopa", icon: "🧹", text: "", note: "Può servire a spostare qualcosa di leggero o a raggiungere un punto alto.", cell: null },
  { id: "lettera", name: "Una lettera", icon: "✉️", text: "Chi legge questo foglio non è il primo a cercare l'uscita. Fidati solo di ciò che hai visto con i tuoi occhi.", note: "Il testo si legge solo se l'oggetto viene palesato.", cell: null },
  { id: "libro", name: "Un libro", icon: "📖", text: "Sulla prima pagina, a matita: «Le parole si leggono al contrario, dalla fine».", note: "Un indizio sulla soluzione.", cell: null },
  { id: "occhiali", name: "Occhiali futuristici", icon: "🥽", text: "", note: "Indossati, il Master può concedere un'occhiata in più o mostrare una lettera.", cell: null },
  { id: "attrezzi", name: "Una cassetta degli attrezzi", icon: "🧰", text: "", note: "Può servire ad aprire una porta sigillata.", cell: null },
];

/** Mappa di esempio (§3 del piano): MORTA e USCITA intrecciate, la A in alto a sinistra. */
export const SAMPLE_LETTERS = ["A", "C", "S", "T", "I", "U", "R", "O", "M"] as const;

export const stanzeConfigSchema = z
  .object({
    rows: z.number().int().min(2).max(5).default(3).meta(sec("Righe")),
    cols: z.number().int().min(2).max(5).default(3).meta(sec("Colonne")),
    rooms: z
      .array(roomSchema)
      .min(4)
      .max(25)
      .meta({ title: "Stanze", itemLabel: "Stanza", description: "In ordine di riga: la prima è in alto a sinistra. Servono righe × colonne stanze" }),
    anchor: z.number().int().min(0).max(24).default(0).meta(sec("Stanza della lettera iniziale", "Numero (da 0) della stanza della A, deve essere in un angolo. È solo un suggerimento: il GM decide dove mettere i giocatori")),
    words: z.array(z.string().trim().toUpperCase().min(2).max(12)).max(6).default(["MORTA", "USCITA"]).meta(sec("Parole da controllare", "L'editor verifica che si leggano sulla mappa come percorsi di stanze adiacenti")),
    solution: z.string().trim().toUpperCase().min(2).max(12).default("USCITA").meta(sec("Soluzione", "La parola che vale come soluzione")),
    positionsPublic: z.boolean().default(true).meta(sec("Posizioni sullo schermo", "Lo schermo mostra in quale stanza sta ognuno")),
    customActions: z.array(customActionSchema).max(8).default([]).meta({ title: "Azioni libere", itemLabel: "Azione", description: "Richieste al GM (es. «Cerca nella stanza»)" }),
    defaultSightSec: z.number().int().min(2).max(60).default(8).meta(sec("Durata di un'occhiata (s)", "Per quanto resta visibile una lettera")),
    messageMaxLength: z.number().int().min(20).max(500).default(280).meta(sec("Lunghezza massima dei messaggi")),
    messageCooldownSec: z.number().int().min(0).max(60).default(3).meta(sec("Pausa tra due messaggi (s)")),
    presetEvents: z.array(z.string().trim().min(1).max(280)).max(12).default([]).meta({ title: "Eventi pronti", itemLabel: "Evento", description: "Testi da inviare con un tocco" }),
    eventMaxLength: z.number().int().min(20).max(500).default(280).meta(sec("Lunghezza massima degli eventi")),
    items: z.array(itemSchema).max(20).default(SAMPLE_ITEMS).meta({ title: "Oggetti", itemLabel: "Oggetto", description: "Oggetti che il Master può mettere nelle stanze. I giocatori nella stanza sanno che c'è un oggetto, ma non quale, finché il Master non lo palesa" }),
    escapePoints: z.number().int().min(0).max(10_000).default(300).meta(sec("Punti a chi fugge")),
    solvePoints: z.number().int().min(0).max(10_000).default(200).meta(sec("Punti a chi risolve", "A chi propone la soluzione giusta")),
  })
  .superRefine((c, ctx) => {
    const g = { rows: c.rows, cols: c.cols };
    if (c.rooms.length !== cellCount(g)) {
      ctx.addIssue({ code: "custom", path: ["rooms"], message: `Servono ${cellCount(g)} stanze (${c.rows} × ${c.cols}), ce ne sono ${c.rooms.length}` });
      return;
    }
    if (c.anchor >= cellCount(g) || !isCorner(g, c.anchor)) {
      ctx.addIssue({ code: "custom", path: ["anchor"], message: "La stanza della lettera iniziale deve essere in un angolo" });
    }
    const letters = c.rooms.map((r) => r.letter);
    for (const word of c.words) {
      if (!findWordPath(g, letters, word)) {
        ctx.addIssue({ code: "custom", path: ["words"], message: `La parola «${word}» non si legge sulla mappa (stanze adiacenti, senza ripassare)` });
      }
    }
    if (new Set(c.items.map((i) => i.id)).size !== c.items.length) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "I codici degli oggetti devono essere tutti diversi" });
    }
    if (c.items.some((i) => i.cell !== null && i.cell >= cellCount(g))) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "La stanza di un oggetto non esiste sulla mappa" });
    }
    if (new Set(c.customActions.map((a) => a.id)).size !== c.customActions.length) {
      ctx.addIssue({ code: "custom", path: ["customActions"], message: "I codici delle azioni devono essere tutti diversi" });
    }
  });

export type StanzeConfig = z.infer<typeof stanzeConfigSchema>;

export const SAMPLE_CONFIG: StanzeConfig = {
  rows: 3,
  cols: 3,
  rooms: SAMPLE_LETTERS.map((letter) => ({ letter, note: "" })),
  anchor: 0,
  words: ["MORTA", "USCITA"],
  solution: "USCITA",
  positionsPublic: true,
  customActions: [],
  items: SAMPLE_ITEMS,
  defaultSightSec: 8,
  messageMaxLength: 280,
  messageCooldownSec: 3,
  presetEvents: [],
  eventMaxLength: 280,
  escapePoints: 300,
  solvePoints: 200,
};
