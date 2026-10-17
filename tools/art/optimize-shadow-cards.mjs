// Ricava dalle carte originali (art/shadow-tournament/*.png, 832×1248) le versioni leggere per l'app:
//   - <carta>-full.webp: carta intera ridotta, solo per lo schermo condiviso;
//   - <carta>-thumb.webp: solo titolo e illustrazione, per la mano sul telefono (qualche decina di KB).
// Si usa Edge (già presente, via Playwright) e il canvas del browser: nessuna dipendenza in più.
// Si lancia con `pnpm art:shadow`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(root, "art", "shadow-tournament");
const out = join(root, "packages", "client", "public", "assets", "shadow");
mkdirSync(out, { recursive: true });

const CARDS = { Attacco: "attack", Difesa: "defense", Raggiro: "trick" };
// full: 480×720; thumb: la parte alta della carta (0–800 px su 1248) a 260 px di larghezza
const VARIANTS = {
  full: { sx: 0, sy: 0, sw: 832, sh: 1248, w: 480, h: 720, q: 0.82 },
  thumb: { sx: 0, sy: 0, sw: 832, sh: 800, w: 260, h: 250, q: 0.8 },
};

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");
for (const [file, id] of Object.entries(CARDS)) {
  const b64 = readFileSync(join(src, `${file}.png`)).toString("base64");
  for (const [name, v] of Object.entries(VARIANTS)) {
    const dataUrl = await page.evaluate(
      async ({ b64, v }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.getElementById("c");
        c.width = v.w;
        c.height = v.h;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, v.sx, v.sy, v.sw, v.sh, 0, 0, v.w, v.h);
        return c.toDataURL("image/webp", v.q);
      },
      { b64, v },
    );
    const buf = Buffer.from(dataUrl.split(",")[1], "base64");
    writeFileSync(join(out, `${id}-${name}.webp`), buf);
    console.log(`${id}-${name}.webp  ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
await browser.close();
