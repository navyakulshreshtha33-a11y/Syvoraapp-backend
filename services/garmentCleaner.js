


const { Client } = require('@gradio/client');
let cleanerApp = null;

async function getCleanerClient() {
  if(cleanerApp) return cleanerApp;
  cleanerApp = await Client.connect("briaai/BRIA-RMBG-2.0");
  return cleanerApp;
}
async function cleanGarmentBuffer(buffer) {
  try {
    console.log("[CLEANER] Garment white bg start...");
    const app = await getCleanerClient();
    const blob = new Blob([buffer]);
    const result = await app.predict("/predict", [blob]);
    let cleanedUrl = result.data?.[0]?.url || result.data?.[0];
    if (typeof cleanedUrl !== 'string') cleanedUrl = cleanedUrl?.url;
    if (!cleanedUrl) throw new Error("Clean fail");
    const res = await fetch(cleanedUrl);
    const transparentBuffer = Buffer.from(await res.arrayBuffer());

    const sharp = require('sharp');
    // White background pe daal - Leffa ko yahi chahiye Indian kurta ke liye
    const whiteBg = await sharp({ create: { width: 1024, height: 1280, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer();
    const garmentResized = await sharp(transparentBuffer).resize(1024, 1280, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    const final = await sharp(whiteBg).composite([{ input: garmentResized }]).jpeg({ quality: 95 }).toBuffer();
    console.log("[CLEANER] Garment clean DONE");
    return final;
  } catch(e) {
    console.log("[CLEANER] Fail, original:", e.message);
    return buffer;
  }
}