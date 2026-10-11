// Analizza un mazzo del Duello dei Cavalieri con molte simulazioni tra bot casuali.
//
//   pnpm duel:balance                          → mazzo base
//   pnpm duel:balance mio-mazzo.json           → mazzo esportato dalla Libreria (o {"cards": [...]})
//   pnpm duel:balance mio-mazzo.json --hp 25 --duels 4000 --battles 6
//
// Il file può essere l'export di un'istanza «mazzo» o di un'intera libreria (si usa il primo mazzo trovato).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeDeck } from "../../packages/minigames/src/knight-duel/analysis.js";
import { DEFAULT_DECK, type Deck, deckSchema } from "../../packages/minigames/src/knight-duel/cards.js";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

function loadDeck(): { deck: Deck; label: string } {
  if (!file) return { deck: DEFAULT_DECK, label: "mazzo base" };
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file); // INIT_CWD: la cartella da cui si è lanciato pnpm
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const candidates = (Array.isArray(raw) ? raw : [raw]) as { typeId?: string; config?: unknown; cards?: unknown }[];
  for (const c of candidates) {
    const body = c.typeId === "deck" ? c.config : c.cards ? c : undefined;
    const parsed = deckSchema.safeParse(body);
    if (parsed.success) return { deck: parsed.data, label: file };
    if (c.typeId === "deck" || c.cards) {
      console.error("Mazzo non valido:\n" + parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
      process.exit(1);
    }
  }
  console.error(`Nessun mazzo trovato in ${file}`);
  process.exit(1);
}

const { deck, label } = loadDeck();
const opts = { duels: flag("duels", 2000), hp: flag("hp", 20), maxBattles: flag("battles", 6), minigamesPerBattle: flag("minigames", 2) };
const a = analyzeDeck(deck, opts);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`\nAnalisi di «${label}»: ${deck.cards.length} carte, ${a.duels} duelli simulati (${opts.hp} PV, ${opts.maxBattles} battaglie, ${opts.minigamesPerBattle} minigiochi per battaglia)\n`);
console.log(`  Durata: mediana ${a.medianBattles} battaglie · KO ${pct(a.koRate)} · oltranza ${pct(a.suddenDeathRate)}`);
console.log(`  Equilibrio tra i lati: ${pct(a.side0WinRate)} / ${pct(1 - a.side0WinRate)}\n`);
console.log("  Carta".padEnd(30) + "giocata in".padStart(12) + "vittorie".padStart(11) + "  giudizio");
for (const c of [...a.cards].sort((x, y) => y.winRate - x.winRate)) {
  console.log(`  ${c.name.padEnd(28)}${String(c.played).padStart(10)}${pct(c.winRate).padStart(11)}  ${c.flag === "ok" ? "" : c.flag.toUpperCase()}`);
}
console.log(a.warnings.length ? `\nAvvisi:\n${a.warnings.map((w) => `  ! ${w}`).join("\n")}` : "\nNessun avviso: il mazzo sembra equilibrato.");
console.log("\nNota: i bot non sfruttano Spia e Sabotaggio e non ragionano; i risultati sono una guida, non una verità.\n");
