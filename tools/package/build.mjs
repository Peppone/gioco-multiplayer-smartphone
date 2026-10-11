// Crea il pacchetto portabile per Windows: una cartella (e uno zip) che l'host decomprime e avvia con un doppio clic.
//
//   pnpm package:win          → dist/gioco-ros-win/  e  dist/gioco-ros-win.zip
//
// Contenuto: Node.js (copiato da questo computer), il server in un solo file, il client già compilato,
// il modulo nativo di SQLite, cloudflared (se presente in bin/) e i lanciatori .bat.
import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "dist", "gioco-ros-win");
const step = (msg) => console.log(`\n▶ ${msg}`);
const mb = (path) => `${(statSync(path).size / 1024 / 1024).toFixed(1)} MB`;

if (process.platform !== "win32") {
  console.error("Questo script crea il pacchetto per Windows e va eseguito su Windows (copia node.exe e il modulo nativo win32-x64).");
  process.exit(1);
}

step("Pulizia della cartella di destinazione");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "app"), { recursive: true });

step("Compilazione del client");
execSync("pnpm --filter @gioco/client build", { cwd: root, stdio: "inherit" });
cpSync(join(root, "packages/client/dist"), join(out, "client"), { recursive: true });

step("Server in un solo file (esbuild)");
await build({
  entryPoints: [join(root, "packages/server/src/index.ts")],
  outfile: join(out, "app/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  sourcemap: false,
  // Il modulo nativo di SQLite resta fuori dal bundle: si copia a parte.
  external: ["better-sqlite3"],
  banner: {
    js: [
      'import { createRequire as __createRequire } from "node:module";',
      'import { fileURLToPath as __fileURLToPath } from "node:url";',
      'import { dirname as __dirname_ } from "node:path";',
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __dirname_(__filename);",
    ].join("\n"),
  },
  logLevel: "warning",
});
console.log(`  server.mjs: ${mb(join(out, "app/server.mjs"))}`);

step("Modulo nativo di SQLite (win32-x64)");
const sqliteDir = execSync("node -e \"console.log(require.resolve('better-sqlite3/package.json', { paths: ['" + join(root, "packages/server").replace(/\\/g, "/") + "'] }))\"", { cwd: root }).toString().trim();
const sqliteRoot = dirname(sqliteDir);
const dest = join(out, "app/node_modules/better-sqlite3");
mkdirSync(join(dest, "prebuilds"), { recursive: true });
copyFileSync(join(sqliteRoot, "package.json"), join(dest, "package.json"));
cpSync(join(sqliteRoot, "lib"), join(dest, "lib"), { recursive: true });
copyFileSync(join(sqliteRoot, "prebuilds/win32-x64.node"), join(dest, "prebuilds/win32-x64.node"));
if (existsSync(join(sqliteRoot, "LICENSE"))) copyFileSync(join(sqliteRoot, "LICENSE"), join(dest, "LICENSE"));

step("Node.js");
mkdirSync(join(out, "node"), { recursive: true });
copyFileSync(process.execPath, join(out, "node/node.exe"));
const nodeLicense = join(dirname(process.execPath), "LICENSE");
if (existsSync(nodeLicense)) copyFileSync(nodeLicense, join(out, "node/LICENSE"));
console.log(`  node ${process.version}: ${mb(join(out, "node/node.exe"))}`);

step("cloudflared (tunnel per i telefoni in 4G/5G)");
const cf = join(root, "bin/cloudflared.exe");
mkdirSync(join(out, "bin"), { recursive: true });
if (existsSync(cf)) {
  copyFileSync(cf, join(out, "bin/cloudflared.exe"));
  console.log(`  incluso (${mb(cf)})`);
} else {
  console.log("  NON trovato in bin/: il pacchetto funziona in rete locale; per giocare dal 4G aggiungi cloudflared.exe nella cartella bin/ del pacchetto.");
}

step("Lanciatori e documentazione");
const bat = (extra) =>
  [
    "@echo off",
    "chcp 65001 >nul",
    'cd /d "%~dp0"',
    'set "GIOCO_ROOT=%~dp0"',
    "set CLIENT_DIR=client",
    "set OPEN_BROWSER=1",
    ...extra,
    "echo.",
    "echo Avvio di Gioco... (non chiudere questa finestra durante la serata)",
    "echo.",
    '"%~dp0node\\node.exe" "%~dp0app\\server.mjs"',
    "echo.",
    "echo Il gioco si e' fermato. Premi un tasto per chiudere.",
    "pause >nul",
    "",
  ].join("\r\n");
writeFileSync(join(out, "Avvia Gioco.bat"), bat([]));
writeFileSync(join(out, "Avvia senza internet (solo rete locale).bat"), bat(["set NO_TUNNEL=1"]));
writeFileSync(
  join(out, "Reimposta password regia.bat"),
  [
    "@echo off",
    "chcp 65001 >nul",
    'cd /d "%~dp0"',
    'set "GIOCO_ROOT=%~dp0"',
    '"%~dp0node\\node.exe" "%~dp0app\\server.mjs" --reset-admin',
    "echo.",
    "pause",
    "",
  ].join("\r\n"),
);
for (const file of ["docs/GUIDA-HOST.md"]) {
  if (existsSync(join(root, file))) copyFileSync(join(root, file), join(out, "GUIDA-HOST.md"));
}
writeFileSync(
  join(out, "LEGGIMI.txt"),
  [
    "GIOCO - avvio rapido",
    "========================",
    "",
    "1. Doppio clic su  \"Avvia Gioco.bat\"  (si apre una finestra nera: non chiuderla).",
    "2. Si aprono due pagine nel browser:",
    "     /admin   = la regia (la prima volta crea la password)",
    "     /screen  = lo schermo da mostrare sul proiettore o sulla TV",
    "3. Sullo schermo compaiono due QR code: i giocatori li inquadrano con il telefono.",
    "     QR 'internet' = funziona anche con i dati cellulari (serve cloudflared.exe nella cartella bin)",
    "     QR 'rete locale' = funziona se telefoni e PC sono sulla stessa rete Wi-Fi",
    "",
    "Se hai dimenticato la password della regia: \"Reimposta password regia.bat\" (i dati restano).",
    "",
    "Se non c'e' internet usa  \"Avvia senza internet (solo rete locale).bat\"",
    "(il PC puo' fare da hotspot, oppure collegatevi tutti allo stesso Wi-Fi).",
    "",
    "I dati (giocatori, serate, punteggi) sono nella cartella  data  : copiala per fare un backup.",
    "Se il PC si spegne a meta' partita, riavvia il gioco: la partita riprende.",
    "",
    "Per tutto il resto leggi GUIDA-HOST.md.",
    "",
  ].join("\r\n"),
);
writeFileSync(
  join(out, "LICENZE-TERZE-PARTI.txt"),
  [
    "Gioco include software e risorse di terze parti:",
    "",
    "- Node.js (MIT) - node/LICENSE",
    "- better-sqlite3 (MIT) e SQLite (pubblico dominio) - app/node_modules/better-sqlite3/LICENSE",
    "- cloudflared di Cloudflare (Apache-2.0) - https://github.com/cloudflare/cloudflared",
    "- Sprite 'Tiny Dungeon' di Kenney (CC0, pubblico dominio) - client/assets/kenney/LICENSE-CC0.txt",
    "- Font Montserrat, Press Start 2P, Bangers, Orbitron (SIL Open Font License 1.1) distribuiti con @fontsource",
    "- Librerie JavaScript (React, Fastify, Socket.IO, Zod, Framer Motion, Howler.js, ecc.) con licenze MIT/ISC/BSD",
    "",
    "Gli effetti sonori sono sintetizzati dal programma (tools/sounds/generate.mjs).",
    "",
  ].join("\r\n"),
);

step("Archivio zip");
const zip = join(root, "dist", "gioco-ros-win.zip");
rmSync(zip, { force: true });
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal"`, { stdio: "inherit" });
console.log(`\nFatto: ${out}\n       ${zip} (${mb(zip)})\n`);
