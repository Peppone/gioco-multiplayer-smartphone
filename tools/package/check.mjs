// Verifica il pacchetto portabile: avvia il server impacchettato con il suo node.exe (non quello del repository)
// e controlla pagine, asset, handshake Socket.IO e scrittura sul database.
//
//   pnpm package:check            → controlli di base (senza internet)
//   pnpm package:check --tunnel   → verifica anche che cloudflared parta e fornisca l'indirizzo pubblico (serve internet)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = join(root, "dist", "gioco-ros-win");
const nodeExe = join(pkg, "node", "node.exe");
if (!existsSync(nodeExe)) {
  console.error("Pacchetto non trovato: esegui prima `pnpm package:win`.");
  process.exit(1);
}

const withTunnel = process.argv.includes("--tunnel");
const port = 3800 + Math.floor(Math.random() * 150);
const base = `http://localhost:${port}`;
const dataDir = join(pkg, "data");

// Chi gioca dal pacchetto ha lì i dati veri (database e brani): il test non li cancella mai.
// Si mettono da parte e si rimettono a posto alla fine; se non si riesce a spostarli (gioco acceso) ci si ferma.
const parked = join(pkg, "data.in-pausa-per-il-test");
if (existsSync(parked)) {
  if (existsSync(dataDir)) {
    console.error(`Trovo sia "data" sia "data.in-pausa-per-il-test" in ${pkg}: un test precedente si è interrotto. Unisci le due cartelle a mano (quella buona è di solito "data.in-pausa-per-il-test") e riprova.`);
    process.exit(1);
  }
  renameSync(parked, dataDir); // un test interrotto: i dati tornano al loro posto
}
if (existsSync(dataDir)) {
  try {
    renameSync(dataDir, parked);
  } catch (err) {
    console.error(`Non riesco a mettere da parte la cartella dei dati (il gioco è acceso o una finestra la tiene aperta?): ${err instanceof Error ? err.message : err}\nNon ho toccato nulla. Chiudi il gioco e riprova.`);
    process.exit(1);
  }
}
const restoreData = () => {
  rmSync(dataDir, { recursive: true, force: true }); // solo i dati del test
  if (existsSync(parked)) renameSync(parked, dataDir);
};

// Il comando di «Reimposta password regia.bat» funziona dal pacchetto (e crea il database accanto all'app).
const reset = spawnSync(nodeExe, [join(pkg, "app", "server.mjs"), "--reset-admin"], { cwd: tmpdir(), env: { ...process.env, GIOCO_ROOT: pkg + "\\" }, encoding: "utf8" });
const resetOk = reset.status === 0 && reset.stdout.includes("password della regia è stata rimossa");
rmSync(dataDir, { recursive: true, force: true }); // a questo punto contiene solo il database creato dal test

// Si lancia da una cartella qualsiasi: il pacchetto non deve dipendere dalla cartella di lavoro.
const child = spawn(nodeExe, [join(pkg, "app", "server.mjs")], {
  cwd: tmpdir(),
  env: { ...process.env, GIOCO_ROOT: pkg + "\\", CLIENT_DIR: "client", PORT: String(port), ...(withTunnel ? {} : { NO_TUNNEL: "1" }) },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (c) => (log += String(c)));
child.stderr.on("data", (c) => (log += String(c)));

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
check("il comando di reset della password regia funziona", resetOk, (reset.stdout + reset.stderr).slice(0, 200));

try {
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`il server impacchettato non è partito:\n${log}`)), 30_000);
    const poll = setInterval(() => {
      if (log.includes("Gioco avviato")) (clearInterval(poll), clearTimeout(t), res());
    }, 100);
    child.on("exit", (code) => rej(new Error(`il server impacchettato è terminato (${code}):\n${log}`)));
  });

  const get = async (path, init) => {
    const r = await fetch(base + path, init);
    return { status: r.status, type: r.headers.get("content-type") ?? "", text: await r.text().catch(() => "") };
  };

  const info = await get("/api/info");
  check("API in funzione (/api/info)", info.status === 200 && JSON.parse(info.text).tunnel !== undefined);

  const screen = await get("/screen");
  check("il client è servito (/screen)", screen.status === 200 && screen.text.includes('id="root"'));
  const js = screen.text.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  check("lo script principale si carica", !!js && (await get(js)).status === 200, js ?? "nessuno script nella pagina");

  const sprite = await fetch(base + "/assets/kenney/tiny-dungeon.png");
  check("gli sprite sono inclusi", sprite.status === 200);
  const sound = await fetch(base + "/sounds/pixel/buzz.wav");
  check("i suoni sono inclusi", sound.status === 200);

  const hs = await get("/socket.io/?EIO=4&transport=polling");
  check("Socket.IO risponde all'handshake", hs.status === 200 && hs.text.includes("sid"));

  // Scrivere sul database prova che il modulo nativo di SQLite funziona dentro il pacchetto.
  const setup = await get("/api/admin/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "password-di-verifica" }) });
  check("il database funziona (impostazione password admin)", setup.status === 200 && setup.text.includes("token"), setup.text.slice(0, 80));
  check("il database è creato accanto all'app (data/gioco.sqlite)", existsSync(join(dataDir, "gioco.sqlite")));
  if (withTunnel) {
    let status = "starting";
    let url = "";
    for (let i = 0; i < 90 && status === "starting"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const t = JSON.parse((await get("/api/info")).text).tunnel;
      status = t.status;
      url = t.url ?? t.error ?? "";
    }
    check("il tunnel Cloudflare parte dal pacchetto e dà un indirizzo pubblico", status === "ready", url);
    if (status === "ready") {
      // I nuovi indirizzi trycloudflare impiegano qualche secondo a diventare raggiungibili, e il DNS di un router
      // domestico può memorizzare «dominio inesistente»: in quel caso si risolve il nome con il DNS pubblico di Cloudflare.
      const direct = async () => (await fetch(url + "/api/info").catch(() => ({ status: 0 }))).status;
      const viaCloudflareDns = async () => {
        const host = new URL(url).hostname;
        const doh = await fetch(`https://1.1.1.1/dns-query?name=${host}&type=A`, { headers: { accept: "application/dns-json" } }).then((r) => r.json()).catch(() => null);
        const ip = doh?.Answer?.find((x) => x.type === 1)?.data;
        if (!ip) return { status: 0, via: "" };
        const code = await new Promise((res) => {
          const cp = spawn("curl.exe", ["-s", "-o", "NUL", "-w", "%{http_code}", "-m", "15", "--resolve", `${host}:443:${ip}`, url + "/api/info"], { stdio: ["ignore", "pipe", "ignore"] });
          let out = "";
          cp.stdout.on("data", (d) => (out += d));
          cp.on("close", () => res(Number(out)));
          cp.on("error", () => res(0));
        });
        return { status: code, via: " (nome risolto con il DNS di Cloudflare: il DNS locale non lo conosce ancora)" };
      };
      let served = 0;
      let note = "";
      for (let i = 0; i < 6 && served !== 200; i++) {
        served = await direct();
        if (served !== 200) {
          const alt = await viaCloudflareDns();
          served = alt.status;
          note = alt.via;
        }
        if (served !== 200) await new Promise((r) => setTimeout(r, 3000));
      }
      check("l'indirizzo pubblico serve la pagina", served === 200, url);
      if (served === 200 && note) console.log("  nota:" + note);
    }
  }
  check("nessun errore nel log del server", !/error|exception|cannot find/i.test(log), log.split("\n").filter((l) => /error|exception|cannot find/i.test(l)).slice(0, 2).join(" | "));
} catch (err) {
  check("avvio del server impacchettato", false, err instanceof Error ? err.message : String(err));
} finally {
  child.kill("SIGKILL");
  // Il server è stato fermato di colpo: la sua pulizia non è girata, quindi si spegne a mano il cloudflared del test.
  if (withTunnel && existsSync(join(dataDir, "cloudflared.pid"))) {
    try {
      process.kill(Number(readFileSync(join(dataDir, "cloudflared.pid"), "utf8")));
    } catch {
      /* già terminato */
    }
  }
  await new Promise((r) => setTimeout(r, 400));
  restoreData(); // il pacchetto resta com'era, con i suoi dati
}

console.log("\nVerifica del pacchetto:");
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? `  → ${r.detail}` : ""}`);
const ok = results.every((r) => r.ok);
console.log(ok ? "\nIl pacchetto funziona.\n" : "\nIl pacchetto ha problemi.\n");
process.exit(ok ? 0 : 1);
