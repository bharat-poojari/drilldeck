import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { buildExtensionPackage } from "./build-extension-package.js";

function readZipEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(offset + 18);
    const fileNameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const fileName = archive.toString("utf8", nameStart, nameStart + fileNameLength);
    const contentsStart = nameStart + fileNameLength + extraLength;
    const contentsEnd = contentsStart + compressedSize;
    entries.set(fileName, inflateRawSync(archive.subarray(contentsStart, contentsEnd)));
    offset = contentsEnd;
  }
  return entries;
}

test("builds a Chrome and Edge extension ZIP with a permission-free MV3 manifest", async t => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "drilldeck-extension-"));
  t.after(() => rm(outputDirectory, { recursive:true, force:true }));
  const archivePath = join(outputDirectory, "extension.zip");
  await buildExtensionPackage(archivePath);

  const entries = readZipEntries(await readFile(archivePath));
  assert.deepEqual([...entries.keys()].sort(), [
    "icon.svg",
    "manifest.json",
    "popup.css",
    "popup.html",
    "popup.js"
  ]);
  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.permissions, undefined);
  assert.match(entries.get("popup.js").toString("utf8"), /https:\/\/drilldeck\.vercel\.app\//);
});
