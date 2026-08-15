/**
 * A zip writer, in about a hundred lines.
 *
 * Foundry ships no archiver, and an export is a folder of files — markup, a
 * stylesheet, pictures, fonts — that has to arrive as one download. Bundling a
 * library for it would cost more than the format does: a zip is a run of file
 * records followed by a directory of where each one started, and the browser
 * already has the only hard part, which is deflate.
 *
 * Two limits are deliberate. There is no zip64, so an archive must stay under
 * four gigabytes and hold fewer than 65,535 files — far past anything a journal
 * export produces, and the alternative is a second header format for a case
 * that cannot arise. And nothing is streamed: an export is assembled in memory
 * because it has to be measured (a picture used twice is stored once) before
 * any of it can be written.
 */

/** Table-driven CRC-32, built once on first use. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** The checksum every zip entry carries, over the *uncompressed* bytes. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Compress with the browser's own deflate.
 *
 * Zip's method 8 is a raw deflate stream with no zlib wrapper, which is exactly
 * what `deflate-raw` produces. Where it is missing the entry is stored instead:
 * a larger file that every unzipper still reads, which is the right way to lose.
 */
async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    // A tiny or incompressible file can come back larger than it went in.
    return packed.length < bytes.length ? packed : null;
  } catch {
    return null;
  }
}

/** Whatever a caller hands us, as bytes. */
function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new TextEncoder().encode(String(data));
}

/**
 * MS-DOS date and time, which is what the format stores.
 * Seconds have one bit taken off them, so odd seconds are not representable.
 */
function dosStamp(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** A little-endian writer, since every field in a zip is little-endian. */
class Bytes {
  #parts = [];
  #length = 0;

  push(bytes) {
    this.#parts.push(bytes);
    this.#length += bytes.length;
    return this;
  }

  u16(value) {
    return this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value) {
    return this.push(new Uint8Array([
      value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff
    ]));
  }

  get length() {
    return this.#length;
  }

  join() {
    const out = new Uint8Array(this.#length);
    let at = 0;
    for (const part of this.#parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/**
 * Build a zip archive.
 * @param {Array<{path: string, data: string|Uint8Array|ArrayBuffer}>} entries
 * @param {Date} [now]  Stamped on every entry; passed in so a test can fix it.
 * @returns {Promise<Blob>}
 */
export async function makeZip(entries, now = new Date()) {
  const { time, day } = dosStamp(now);
  const encoder = new TextEncoder();
  const body = new Bytes();
  const directory = new Bytes();
  let count = 0;

  for (const entry of entries) {
    // Zip paths are always forward-slashed and never absolute.
    const name = encoder.encode(String(entry.path).replace(/^\/+/, "").replaceAll("\\", "/"));
    const raw = toBytes(entry.data);
    const packed = await deflate(raw);
    const method = packed ? 8 : 0;
    const stored = packed ?? raw;
    const crc = crc32(raw);
    const offset = body.length;

    // Local file header, then the bytes themselves.
    body.u32(0x04034b50).u16(20).u16(0x0800).u16(method).u16(time).u16(day);
    body.u32(crc).u32(stored.length).u32(raw.length).u16(name.length).u16(0);
    body.push(name).push(stored);

    // And the central directory entry that says where to find it.
    directory.u32(0x02014b50).u16(20).u16(20).u16(0x0800).u16(method).u16(time).u16(day);
    directory.u32(crc).u32(stored.length).u32(raw.length);
    directory.u16(name.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(offset);
    directory.push(name);
    count += 1;
  }

  const end = new Bytes();
  end.u32(0x06054b50).u16(0).u16(0).u16(count).u16(count);
  end.u32(directory.length).u32(body.length).u16(0);

  return new Blob([body.join(), directory.join(), end.join()], { type: "application/zip" });
}

/** Hand a built archive to the browser as a download. */
export function saveZip(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next turn of the event loop: revoking it immediately can
  // beat the download starting.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
