// Reads the `name` table (copyright, manufacturer, license …) of a TTF/OTF,
// WOFF or WOFF2 file. WOFF and WOFF2 compress their tables, so a plain grep
// over the file never sees these strings.
import { brotliDecompressSync, inflateSync } from 'node:zlib';

// WOFF2 spec §5.2, index = position in this list.
const WOFF2_KNOWN_TAGS = (
  'cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp ' +
  'hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL ' +
  'SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx ' +
  'opbd prop trak Zapf Silf Glat Gloc Feat Sill'
)
  .split(' ')
  .map((tag) => tag.replace('_', ' '));

const SFNT_VERSIONS = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);

function sfntNameTable(buf) {
  const count = buf.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    if (buf.toString('latin1', at, at + 4) !== 'name') continue;
    const offset = buf.readUInt32BE(at + 8);
    return buf.subarray(offset, offset + buf.readUInt32BE(at + 12));
  }
  return null;
}

function woffNameTable(buf) {
  const count = buf.readUInt16BE(12);
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20;
    if (buf.toString('latin1', at, at + 4) !== 'name') continue;
    const offset = buf.readUInt32BE(at + 4);
    const compLength = buf.readUInt32BE(at + 8);
    const data = buf.subarray(offset, offset + compLength);
    return compLength < buf.readUInt32BE(at + 12) ? inflateSync(data) : data;
  }
  return null;
}

function readUintBase128(buf, at) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[at + i];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: at + i + 1 };
  }
  throw new Error('invalid UIntBase128');
}

function woff2NameTable(buf) {
  const count = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  let at = 48;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const flags = buf[at++];
    let tag = WOFF2_KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) {
      tag = buf.toString('latin1', at, at + 4);
      at += 4;
    }
    const version = flags >> 6;
    const orig = readUintBase128(buf, at);
    at = orig.next;
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    let length = orig.value;
    if (transformed) {
      const transform = readUintBase128(buf, at);
      at = transform.next;
      length = transform.value;
    }
    entries.push({ tag, length });
  }
  const data = brotliDecompressSync(buf.subarray(at, at + compressedSize));
  let offset = 0;
  for (const { tag, length } of entries) {
    if (tag === 'name') return data.subarray(offset, offset + length);
    offset += length;
  }
  return null;
}

function parseNameTable(table) {
  const names = new Map();
  const count = table.readUInt16BE(2);
  const stringsAt = table.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const platform = table.readUInt16BE(at);
    const nameId = table.readUInt16BE(at + 6);
    const start = stringsAt + table.readUInt16BE(at + 10);
    const raw = table.subarray(start, start + table.readUInt16BE(at + 8));
    const text =
      platform === 1
        ? raw.toString('latin1')
        : Buffer.from(raw.subarray(0, raw.length & ~1))
            .swap16()
            .toString('utf16le');
    names.set(nameId, [...(names.get(nameId) ?? []), text]);
  }
  return names;
}

/** @returns {Map<number, string[]>} strings per name ID; empty when the font has no `name` table */
export function readFontNames(bytes) {
  const signature = bytes.length >= 4 ? bytes.toString('latin1', 0, 4) : '';
  let table;
  if (signature === 'wOFF') table = woffNameTable(bytes);
  else if (signature === 'wOF2') {
    if (bytes.readUInt32BE(4) === 0x74746366 /* ttcf */) throw new Error('unsupported font format');
    table = woff2NameTable(bytes);
  } else if (bytes.length >= 12 && SFNT_VERSIONS.has(bytes.readUInt32BE(0))) {
    table = sfntNameTable(bytes);
  } else throw new Error('unsupported font format');
  return table ? parseNameTable(table) : new Map();
}
