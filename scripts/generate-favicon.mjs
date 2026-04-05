import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

// SVG design: dark bg, white center circle, 3 ripple rings
const svgTemplate = (size) => {
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 32;
  const r0 = 5 * scale;   // center circle
  const r1 = 9 * scale;   // ring 1
  const r2 = 13 * scale;  // ring 2
  const r3 = 17 * scale;  // ring 3 (outermost, clips at edge)
  const rw = 1.5 * scale; // ring stroke width
  const corner = 6 * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${corner}" ry="${corner}" fill="#0a0a0a"/>
  <!-- outer ripple -->
  <circle cx="${cx}" cy="${cy}" r="${r3}" fill="none" stroke="white" stroke-width="${rw}" opacity="0.15"/>
  <!-- mid ripple -->
  <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="white" stroke-width="${rw}" opacity="0.35"/>
  <!-- inner ripple -->
  <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="white" stroke-width="${rw}" opacity="0.65"/>
  <!-- center circle -->
  <circle cx="${cx}" cy="${cy}" r="${r0}" fill="white"/>
</svg>`;
};

// Generate 32x32 PNG
const svg32 = Buffer.from(svgTemplate(32));
const png32 = await sharp(svg32).png().toBuffer();
writeFileSync(join(publicDir, "favicon-32x32.png"), png32);
console.log("✓ favicon-32x32.png");

// Generate 16x16 PNG
const svg16 = Buffer.from(svgTemplate(16));
const png16 = await sharp(svg16).png().toBuffer();
writeFileSync(join(publicDir, "favicon-16x16.png"), png16);
console.log("✓ favicon-16x16.png");

// Generate favicon.png (32x32 as main)
writeFileSync(join(publicDir, "favicon.png"), png32);
console.log("✓ favicon.png");

// Generate favicon.ico (ICO = 16x16 + 32x32 combined)
// ICO format: ICONDIR + ICONDIRENTRYs + image data
function buildIco(images) {
  const count = images.length;
  const headerSize = 6; // ICONDIR
  const entrySize = 16; // ICONDIRENTRY per image
  const dataOffset = headerSize + entrySize * count;

  const entries = [];
  let offset = dataOffset;
  for (const img of images) {
    entries.push({ data: img.data, width: img.width, height: img.height, offset });
    offset += img.data.length;
  }

  const totalSize = offset;
  const buf = Buffer.alloc(totalSize);
  let pos = 0;

  // ICONDIR
  buf.writeUInt16LE(0, pos); pos += 2;      // reserved
  buf.writeUInt16LE(1, pos); pos += 2;      // type = 1 (ICO)
  buf.writeUInt16LE(count, pos); pos += 2;  // count

  // ICONDIRENTRYs
  for (const e of entries) {
    buf.writeUInt8(e.width === 256 ? 0 : e.width, pos); pos++;
    buf.writeUInt8(e.height === 256 ? 0 : e.height, pos); pos++;
    buf.writeUInt8(0, pos); pos++;   // color count
    buf.writeUInt8(0, pos); pos++;   // reserved
    buf.writeUInt16LE(1, pos); pos += 2; // planes
    buf.writeUInt16LE(32, pos); pos += 2; // bit count
    buf.writeUInt32LE(e.data.length, pos); pos += 4;
    buf.writeUInt32LE(e.offset, pos); pos += 4;
  }

  // image data
  for (const e of entries) {
    e.data.copy(buf, e.offset);
  }

  return buf;
}

const ico = buildIco([
  { data: png16, width: 16, height: 16 },
  { data: png32, width: 32, height: 32 },
]);
writeFileSync(join(publicDir, "favicon.ico"), ico);
console.log("✓ favicon.ico");

console.log("Done!");
