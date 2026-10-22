const { Client } = require('@gradio/client');
let cleanerApp = null;

async function getCleanerClient() {
  if(cleanerApp) return cleanerApp;
  cleanerApp = await Client.connect("briaai/BRIA-RMBG-2.0");
  return cleanerApp;
}

// FAST check: background plain hai ya nahi (corner pixels check)
async function isPlainBackground(buffer) {
  try {
    const sharp = require('sharp');
    const { data, info } = await sharp(buffer).resize(100, 100).raw().toBuffer({ resolveWithObject: true });
    
    // 4 corners ke pixels ka color check
    const getPixel = (x, y) => {
      const idx = (y * info.width + x) * info.channels;
      return [data[idx], data[idx+1], data[idx+2]];
    };
    const corners = [getPixel(0,0), getPixel(99,0), getPixel(0,99), getPixel(99,99), getPixel(5,5)];
    
    // saare corners almost white/light hai toh plain
    const isLight = (p) => p[0] > 200 && p[1] > 200 && p[2] > 200;
    const lightCount = corners.filter(isLight).length;
    
    // variance check
    let variance = 0;
    for(let i=1; i<corners.length; i++){
      variance += Math.abs(corners[i][0]-corners[0][0]) + Math.abs(corners[i][1]-corners[0][1]) + Math.abs(corners[i][2]-corners[0][2]);
    }
    return lightCount >= 4 || variance < 100; // plain
  } catch {
    return false; // check fail toh clean kar denge
  }
}

async function cleanPersonBuffer(buffer) {
  try {
    console.log("[CLEANER] Person white bg start...");
    const app = await getCleanerClient();
    const blob = new Blob([buffer]);
    const result = await app.predict("/predict", [blob]);
    let cleanedUrl = result.data?.[0]?.url || result.data?.[0];
    if (typeof cleanedUrl !== 'string') cleanedUrl = cleanedUrl?.url;
    if (!cleanedUrl) throw new Error("Clean fail");
    
    const res = await fetch(cleanedUrl);
    const transparentBuffer = Buffer.from(await res.arrayBuffer());

    const sharp = require('sharp');
    // white background create
    const whiteBg = await sharp({ create: { width: 1024, height: 1280, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer();
    const personResized = await sharp(transparentBuffer).resize(1024, 1280, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    
    const final = await sharp(whiteBg).composite([{ input: personResized }]).jpeg({ quality: 95 }).toBuffer();
    console.log("[CLEANER] Person clean DONE");
    return final;
  } catch(e) {
    console.log("[CLEANER] Fail, original:", e.message);
    return buffer;
  }
}

module.exports = { cleanPersonBuffer, isPlainBackground };