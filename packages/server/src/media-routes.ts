import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, MEDIA_FILE_PATTERN, type AdminError, type MediaItem } from "@gioco/shared";
import type { AdminAuth } from "./admin-auth.js";

/** Estensione dedotta dal tipo MIME dichiarato, altrimenti dal nome originale. */
function extensionFor(contentType: string, originalName: string): string | null {
  const mime = contentType.split(";")[0]!.trim().toLowerCase();
  const byMime = Object.entries(AUDIO_TYPES).find(([, m]) => m === mime)?.[0];
  if (byMime) return byMime;
  const ext = extname(originalName).slice(1).toLowerCase();
  return ext in AUDIO_TYPES ? ext : null;
}

/**
 * Mediateca dei brani. Il caricamento è riservato alla regia; la lettura è pubblica (lo schermo non fa login)
 * ma i nomi sono UUID casuali, quindi un brano non si trova se non si conosce il suo nome.
 * I file stanno accanto al database (`<data>/media`).
 */
export function registerMediaRoutes(app: FastifyInstance, auth: AdminAuth, mediaDir: string): void {
  // I brani stanno in `files/` (pubblico); i nomi originali in `names/` (mai servito: potrebbero rivelare il titolo).
  const filesDir = join(mediaDir, "files");
  const namesDir = join(mediaDir, "names");
  mkdirSync(filesDir, { recursive: true });
  mkdirSync(namesDir, { recursive: true });

  // Lettura con supporto a Range (necessario per far partire la musica da un punto qualsiasi).
  void app.register(fastifyStatic, {
    root: filesDir,
    prefix: "/media/",
    decorateReply: false,
    index: false,
    list: false,
    maxAge: "1h",
  });

  void app.register(async (api) => {
    api.addHook("onRequest", async (req, reply) => {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!auth.verify(token)) return reply.code(401).send({ error: "unauthorized" satisfies AdminError });
    });
    // Il corpo del caricamento è il file grezzo (nessun multipart: niente dipendenze in più).
    api.addContentTypeParser(/^audio\//, { parseAs: "buffer", bodyLimit: MAX_AUDIO_BYTES }, (_req, body, done) => done(null, body));

    api.post("/api/admin/media", { bodyLimit: MAX_AUDIO_BYTES }, async (req, reply) => {
      const name = decodeURIComponent(String(req.headers["x-file-name"] ?? "brano")).slice(0, 120);
      const ext = extensionFor(String(req.headers["content-type"] ?? ""), name);
      const body = req.body;
      if (!ext || !Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: "invalid" satisfies AdminError, detail: "Formato audio non supportato (usa mp3, m4a, ogg, wav…)." });
      }
      const file = `${randomUUID()}.${ext}`;
      writeFileSync(join(filesDir, file), body);
      writeFileSync(join(namesDir, `${file}.json`), JSON.stringify({ name }));
      const item: MediaItem = { file, name, size: body.length };
      return reply.code(201).send(item);
    });

    api.get("/api/admin/media", async (): Promise<MediaItem[]> =>
      readdirSync(filesDir)
        .filter((f) => MEDIA_FILE_PATTERN.test(f))
        .map((file) => {
          let name = file;
          try {
            name = (JSON.parse(readFileSync(join(namesDir, `${file}.json`), "utf8")) as { name: string }).name;
          } catch {
            /* nome originale perso: si mostra il nome del file */
          }
          return { file, name, size: statSync(join(filesDir, file)).size, mtime: statSync(join(filesDir, file)).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .map(({ file, name, size }) => ({ file, name, size })),
    );
  });
}

