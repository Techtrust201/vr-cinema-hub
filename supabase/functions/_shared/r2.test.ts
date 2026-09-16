import { describe, expect, it } from "vitest";

import { presignR2, presignRaw, uriEncode } from "./r2";

// Vecteur officiel AWS (« Example: Signature Calculation for Presigned URL »).
// R2 réutilise exactement SigV4 : si on reproduit cette signature au caractère
// près, la nôtre est bonne. Sans ce test, une erreur d'encodage ou d'ordre de
// champs se traduirait par un 403 R2 sans aucun détail exploitable.
const AWS_VECTOR = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  endpoint: "https://examplebucket.s3.amazonaws.com",
  canonicalUri: "/test.txt",
  ttlSeconds: 86400,
  date: new Date("2013-05-24T00:00:00.000Z"),
  expectedSignature: "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
};

describe("presignRaw", () => {
  it("reproduit la signature du vecteur de test AWS", async () => {
    const url = await presignRaw({
      method: "GET",
      endpoint: AWS_VECTOR.endpoint,
      canonicalUri: AWS_VECTOR.canonicalUri,
      accessKeyId: AWS_VECTOR.accessKeyId,
      secretAccessKey: AWS_VECTOR.secretAccessKey,
      region: AWS_VECTOR.region,
      ttlSeconds: AWS_VECTOR.ttlSeconds,
      now: AWS_VECTOR.date,
    });

    const signature = new URL(url).searchParams.get("X-Amz-Signature");
    expect(signature).toBe(AWS_VECTOR.expectedSignature);
  });

  it("place les paramètres signés dans l'URL", async () => {
    const url = new URL(
      await presignRaw({
        method: "GET",
        endpoint: AWS_VECTOR.endpoint,
        canonicalUri: AWS_VECTOR.canonicalUri,
        accessKeyId: AWS_VECTOR.accessKeyId,
        secretAccessKey: AWS_VECTOR.secretAccessKey,
        region: AWS_VECTOR.region,
        ttlSeconds: AWS_VECTOR.ttlSeconds,
        now: AWS_VECTOR.date,
      }),
    );
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20130524T000000Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("86400");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
  });

  it("signe différemment deux morceaux d'un même envoi multipart", async () => {
    const base = {
      method: "PUT" as const,
      endpoint: AWS_VECTOR.endpoint,
      canonicalUri: AWS_VECTOR.canonicalUri,
      accessKeyId: AWS_VECTOR.accessKeyId,
      secretAccessKey: AWS_VECTOR.secretAccessKey,
      region: AWS_VECTOR.region,
      ttlSeconds: 3600,
      now: AWS_VECTOR.date,
    };
    const part1 = await presignRaw({ ...base, query: { partNumber: "1", uploadId: "abc" } });
    const part2 = await presignRaw({ ...base, query: { partNumber: "2", uploadId: "abc" } });
    expect(part1).not.toBe(part2);
  });
});

describe("uriEncode", () => {
  it("encode ce qu'encodeURIComponent laisse passer", () => {
    // Ces caractères sont légaux dans un nom de fichier et casseraient la
    // signature s'ils n'étaient pas encodés comme S3 l'exige.
    expect(uriEncode("a!b'c(d)e*f", false)).toBe("a%21b%27c%28d%29e%2Af");
  });

  it("laisse les caractères non réservés intacts", () => {
    expect(uriEncode("Film-360_v2.1~final", false)).toBe("Film-360_v2.1~final");
  });

  it("traite la barre oblique selon le contexte", () => {
    expect(uriEncode("videos/film.mp4", false)).toBe("videos/film.mp4");
    expect(uriEncode("videos/film.mp4", true)).toBe("videos%2Ffilm.mp4");
  });

  it("encode les accents en UTF-8", () => {
    expect(uriEncode("Notre-Dame été.mp4", false)).toBe("Notre-Dame%20%C3%A9t%C3%A9.mp4");
  });
});

describe("presignR2", () => {
  const cfg = {
    endpoint: "https://acct123.r2.cloudflarestorage.com",
    bucket: "vr-cinema",
    accessKeyId: AWS_VECTOR.accessKeyId,
    secretAccessKey: AWS_VECTOR.secretAccessKey,
  };

  it("construit un chemin path-style incluant le bucket", async () => {
    const url = new URL(await presignR2({ method: "GET", key: "videos/film.mp4", cfg }));
    expect(url.host).toBe("acct123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/vr-cinema/videos/film.mp4");
  });

  it("plafonne la durée de vie à sept jours, comme S3", async () => {
    const url = new URL(
      await presignR2({ method: "GET", key: "k.mp4", ttlSeconds: 999 * 24 * 3600, cfg }),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(7 * 24 * 3600));
  });
});
