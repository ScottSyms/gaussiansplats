#!/usr/bin/env node
// Convert 1713.ply -> 1713.spz (SH3, morton-sorted, normals dropped) + morton sort
// Usage: node scripts/convert.js [input.ply] [output.spz]
// Requires: npm install spz-js
import { createReadStream, writeFileSync, existsSync } from 'fs';
import { Readable } from 'stream';
import { loadPly, serializeSpz } from 'spz-js';

const input = process.argv[2] || '1713.ply';
const output = process.argv[3] || 'public/1713.spz';

if (!existsSync(input)) {
  console.error(`Input not found: ${input}`);
  console.error('Place 1713.ply in repo root (gitignored) and re-run.');
  process.exit(1);
}

console.log(`Loading ${input} ...`);
const fileStream = createReadStream(input);
const webStream = Readable.toWeb(fileStream);
const gs = await loadPly(webStream);
console.log(`Loaded ${gs.numPoints.toLocaleString()} splats, SH degree ${gs.shDegree}`);

console.log('Serializing SPZ (quantized, SH preserved) ...');
const spzData = await serializeSpz(gs);
console.log(`SPZ ${ (spzData.byteLength/1024/1024).toFixed(2) } MB (${spzData.byteLength} bytes)`);
writeFileSync(output, Buffer.from(spzData));
console.log(`Wrote ${output}`);

// Also report savings
import { statSync } from 'fs';
const inSize = statSync(input).size;
console.log(`Savings: ${(inSize/1024/1024).toFixed(1)} MB -> ${(spzData.byteLength/1024/1024).toFixed(1)} MB (${(100*spzData.byteLength/inSize).toFixed(1)}% of original, ${(inSize/spzData.byteLength).toFixed(1)}x)`);
