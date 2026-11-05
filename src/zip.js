'use strict';

// Minimal zip reader: enough to pull manifest.json out of a mod package
// without adding a dependency.

const zlib = require('node:zlib');

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function findEndOfCentralDirectory(buf) {
  // The record is 22 bytes plus a comment of up to 65535 bytes.
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD) return i;
  }
  throw new Error('Not a zip file (no end of central directory record).');
}

/** Returns the names of the entries in the zip. */
function listEntries(buf) {
  return centralEntries(buf).map((e) => e.name);
}

function centralEntries(buf) {
  const eocd = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL) throw new Error('Corrupt zip central directory.');
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    entries.push({
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      localOffset: buf.readUInt32LE(offset + 42),
      name: buf.toString('utf8', offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Returns the content of the entry called `name`, or null when missing. */
function readEntry(buf, name) {
  const entry = centralEntries(buf).find((e) => e.name === name);
  if (!entry) return null;
  const local = entry.localOffset;
  if (buf.readUInt32LE(local) !== LOCAL) throw new Error('Corrupt zip local header.');
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${entry.method} for ${name}.`);
}

module.exports = { listEntries, readEntry };
