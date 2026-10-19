// services/garmentCleaner.js
const { client } = require('@gradio/client');

const TOKENS = (process.env.HF_TOKEN || '').split(',').map(t=>t.trim()).filter(Boolean);
let cleanerApp = null;

async function getCleanerClient() {
  if(cleanerApp) return cleanerApp;
  const token = TOKENS[0];
  cleanerApp = await client("briaai/BRIA-RMBG-2.0", { hf_token: token });
  return cleanerApp;
}

async function cleanGarmentBuffer(buffer) {
  try {
    console.log("[CLEANER] White background kar raha hu...");
    const app = await getCleanerClient();
    const blob = new Blob([buffer]);
    const result = await app.predict("/predict", [blob]);
    
    let cleanedUrl = result.data?.[0]?.url || result.data?.[0];
    if (typeof cleanedUrl !== 'string') cleanedUrl = cleanedUrl?.url;
    if (!cleanedUrl) throw new Error("Clean fail");

    const res = await fetch(cleanedUrl);
    const arrayBuffer = await res.arrayBuffer();
    console.log("[CLEANER] Clean DONE");
    return Buffer.from(arrayBuffer);
  } catch(e) {
    console.log("[CLEANER] Fail, original use karunga:", e.message);
    return buffer; // fail hua to original hi return
  }
}

module.exports = { cleanGarmentBuffer };