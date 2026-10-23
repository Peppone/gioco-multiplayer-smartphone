import { describe, expect, it } from "vitest";
import { AUDIO_TYPES, MEDIA_FILE_PATTERN, mediaContentType } from "./media.js";

describe("tipo del file da caricare", () => {
  it("usa quello del browser se il server lo riconosce", () => {
    expect(mediaContentType("clip.mp4", "video/mp4")).toBe("video/mp4");
    expect(mediaContentType("brano.mp3", "audio/mpeg")).toBe("audio/mpeg");
    expect(mediaContentType("brano.m4a", "audio/mp4; codecs=mp4a.40.2")).toBe("audio/mp4");
  });

  it("se il browser non dice il tipo, o ne dà uno sconosciuto, vale l'estensione", () => {
    expect(mediaContentType("Videoclip.MP4", "")).toBe("video/mp4");
    expect(mediaContentType("clip.mp4", "video/x-m4v")).toBe("video/mp4");
    expect(mediaContentType("brano.m4a", "audio/x-m4a")).toBe("audio/mp4");
    expect(mediaContentType("brano.flac", "")).toBe("audio/flac");
  });

  it("un file senza estensione né tipo si tratta come mp3 (come prima)", () => {
    expect(mediaContentType("brano", "")).toBe("audio/mpeg");
  });
});

describe("nomi della mediateca", () => {
  it("ogni estensione accettata ha un nome valido, anche mp4", () => {
    for (const ext of Object.keys(AUDIO_TYPES)) {
      expect(`11111111-1111-4111-8111-111111111111.${ext}`).toMatch(MEDIA_FILE_PATTERN);
    }
    expect("11111111-1111-4111-8111-111111111111.mp4").toMatch(MEDIA_FILE_PATTERN);
    expect("11111111-1111-4111-8111-111111111111.mov").not.toMatch(MEDIA_FILE_PATTERN);
  });
});
