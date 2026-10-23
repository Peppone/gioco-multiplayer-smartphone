import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MEDIA_FILE_PATTERN, type MediaItem } from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { AdminService } from "./admin-service.js";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";

let dir = "";
let app: ReturnType<typeof buildApp>;
let token = "";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "gioco-media-"));
  const { db } = openDb(":memory:");
  app = buildApp({
    port: 3000,
    lanAddress: null,
    getTunnel: () => ({ status: "off" }),
    admin: { auth: new AdminAuth(db), service: new AdminService(db) },
    mediaDir: dir,
  });
  token = (await app.inject({ method: "POST", url: "/api/admin/setup", payload: { password: "segretissima" } })).json().token;
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const upload = (body: Buffer, type = "audio/mpeg", name = "Brano Segreto.mp3", auth = true) =>
  app.inject({
    method: "POST",
    url: "/api/admin/media",
    payload: body,
    headers: { "content-type": type, "x-file-name": encodeURIComponent(name), ...(auth && { authorization: `Bearer ${token}` }) },
  });

describe("mediateca dei brani", () => {
  it("il caricamento richiede il login della regia", async () => {
    expect((await upload(Buffer.from("abc"), "audio/mpeg", "x.mp3", false)).statusCode).toBe(401);
  });

  it("salva il brano con un nome casuale e lo restituisce a tutti, con supporto a Range", async () => {
    const data = Buffer.from("0123456789".repeat(100));
    const res = await upload(data);
    expect(res.statusCode).toBe(201);
    const item = res.json() as MediaItem;
    expect(item.file).toMatch(MEDIA_FILE_PATTERN);
    expect(item.file).not.toContain("Segreto");
    expect(item.name).toBe("Brano Segreto.mp3");

    const full = await app.inject({ method: "GET", url: `/media/${item.file}` });
    expect(full.statusCode).toBe(200);
    expect(full.rawPayload.equals(data)).toBe(true);
    const part = await app.inject({ method: "GET", url: `/media/${item.file}`, headers: { range: "bytes=10-19" } });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe("0123456789");
  });

  it("il nome originale non è raggiungibile dal pubblico", async () => {
    const item = (await upload(Buffer.from("abc"))).json() as MediaItem;
    for (const url of [`/media/${item.file}.json`, `/media/../names/${item.file}.json`, `/media/`]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  it("l'elenco (solo regia) mostra il nome originale, il più recente per primo", async () => {
    await upload(Buffer.from("a"), "audio/mpeg", "Primo.mp3");
    await upload(Buffer.from("bb"), "audio/ogg", "Secondo.ogg");
    expect((await app.inject({ method: "GET", url: "/api/admin/media" })).statusCode).toBe(401);
    const list = (await app.inject({ method: "GET", url: "/api/admin/media", headers: { authorization: `Bearer ${token}` } })).json() as MediaItem[];
    expect(list.map((m) => m.name).sort()).toEqual(["Primo.mp3", "Secondo.ogg"]);
    expect(list.find((m) => m.name === "Secondo.ogg")!.file.endsWith(".ogg")).toBe(true);
  });

  it("accetta un video mp4 (se ne usa solo l'audio): estensione .mp4, tipo video/mp4 e Range", async () => {
    const data = Buffer.from("ftypisom".repeat(500));
    const res = await upload(data, "video/mp4", "Videoclip.mp4");
    expect(res.statusCode).toBe(201);
    const item = res.json() as MediaItem;
    expect(item.file).toMatch(MEDIA_FILE_PATTERN);
    expect(item.file.endsWith(".mp4")).toBe(true);
    expect(item.name).toBe("Videoclip.mp4");

    const full = await app.inject({ method: "GET", url: `/media/${item.file}` });
    expect(full.statusCode).toBe(200);
    expect(full.headers["content-type"]).toContain("video/mp4");
    expect(full.rawPayload.equals(data)).toBe(true);
    const part = await app.inject({ method: "GET", url: `/media/${item.file}`, headers: { range: "bytes=0-7" } });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe("ftypisom");
    const list = (await app.inject({ method: "GET", url: "/api/admin/media", headers: { authorization: `Bearer ${token}` } })).json() as MediaItem[];
    expect(list.map((m) => m.name)).toEqual(["Videoclip.mp4"]);
  });

  it("un mp4 dichiarato come audio/mp4 resta un .m4a; altri video non si accettano", async () => {
    const audioMp4 = (await upload(Buffer.from("abc"), "audio/mp4", "Brano.mp4")).json() as MediaItem;
    expect(audioMp4.file.endsWith(".m4a")).toBe(true);
    for (const type of ["video/webm", "video/quicktime", "video/x-matroska"]) {
      expect((await upload(Buffer.from("abc"), type, "Clip.mov")).statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  it("rifiuta file che non sono audio o sono vuoti", async () => {
    expect((await upload(Buffer.from("<html>"), "text/html", "x.html")).statusCode).toBeGreaterThanOrEqual(400);
    expect((await upload(Buffer.alloc(0))).statusCode).toBe(400);
  });
});
