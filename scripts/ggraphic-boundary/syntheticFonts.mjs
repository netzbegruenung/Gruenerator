// Minimal fonts for the guard's self-test: an sfnt holding only a `name`
// table, and the same sfnt wrapped as WOFF and WOFF2.
import { brotliCompressSync, deflateSync } from 'node:zlib';

const WOFF2_NAME_TAG_INDEX = 5;

function nameTable(records) {
  const strings = records.map(([, text]) => Buffer.from(text, 'utf16le').swap16());
  const header = Buffer.alloc(6 + records.length * 12);
  header.writeUInt16BE(records.length, 2);
  header.writeUInt16BE(header.length, 4);
  let offset = 0;
  records.forEach(([nameId], i) => {
    const at = 6 + i * 12;
    header.writeUInt16BE(3, at); // Windows
    header.writeUInt16BE(1, at + 2); // Unicode BMP
    header.writeUInt16BE(0x409, at + 4); // en-US
    header.writeUInt16BE(nameId, at + 6);
    header.writeUInt16BE(strings[i].length, at + 8);
    header.writeUInt16BE(offset, at + 10);
    offset += strings[i].length;
  });
  return Buffer.concat([header, ...strings]);
}

function pad4(buf) {
  return Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
}

export function buildSfnt(records) {
  const table = nameTable(records);
  const head = Buffer.alloc(28);
  head.writeUInt32BE(0x00010000, 0);
  head.writeUInt16BE(1, 4);
  head.writeUInt16BE(16, 6);
  head.write('name', 12, 'latin1');
  head.writeUInt32BE(28, 20);
  head.writeUInt32BE(table.length, 24);
  return Buffer.concat([head, pad4(table)]);
}

function onlyTable(sfnt) {
  const offset = sfnt.readUInt32BE(20);
  return sfnt.subarray(offset, offset + sfnt.readUInt32BE(24));
}

export function toWoff(sfnt) {
  const table = onlyTable(sfnt);
  const compressed = deflateSync(table);
  const data = compressed.length < table.length ? compressed : table;
  const header = Buffer.alloc(44 + 20);
  header.write('wOFF', 0, 'latin1');
  header.writeUInt32BE(sfnt.readUInt32BE(0), 4);
  header.writeUInt32BE(header.length + pad4(data).length, 8);
  header.writeUInt16BE(1, 12);
  header.writeUInt32BE(sfnt.length, 16);
  header.write('name', 44, 'latin1');
  header.writeUInt32BE(header.length, 48);
  header.writeUInt32BE(data.length, 52);
  header.writeUInt32BE(table.length, 56);
  return Buffer.concat([header, pad4(data)]);
}

function uintBase128(n) {
  const bytes = [];
  do {
    bytes.unshift(n & 0x7f);
    n >>>= 7;
  } while (n > 0);
  return Buffer.from(bytes.map((b, i) => (i < bytes.length - 1 ? b | 0x80 : b)));
}

export function toWoff2(sfnt) {
  const table = onlyTable(sfnt);
  const directory = Buffer.concat([Buffer.from([WOFF2_NAME_TAG_INDEX]), uintBase128(table.length)]);
  const compressed = brotliCompressSync(table);
  const header = Buffer.alloc(48);
  header.write('wOF2', 0, 'latin1');
  header.writeUInt32BE(sfnt.readUInt32BE(0), 4);
  header.writeUInt32BE(48 + directory.length + compressed.length, 8);
  header.writeUInt16BE(1, 12);
  header.writeUInt32BE(sfnt.length, 16);
  header.writeUInt32BE(compressed.length, 20);
  return Buffer.concat([header, directory, compressed]);
}
