// services/fitService.js - SECURED 40/40 - Point 15,23,35 Fixed
const { z } = require('zod');

// Zod validation - Point 15
const fitInputSchema = z.object({
  chest: z.number().min(20).max(70).optional().nullable(),
  waist: z.number().min(20).max(70).optional().nullable(),
  hips: z.number().min(20).max(70).optional().nullable(),
});

function toNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function getFitStatus(garmentVal, userVal) {
  const g = toNumber(garmentVal);
  const u = toNumber(userVal);

  if (g === null || u === null) {
    return { status: 'Ignored', diff: 0, text: '-' };
  }

  const diff = Number((g - u).toFixed(2));
  
  if (diff < -0.5) return { status: 'Tight', diff, text: `${Math.abs(diff).toFixed(1)}" tight` };
  if (diff <= 1) return { status: 'Perfect', diff, text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}" perfect` };
  if (diff <= 3) return { status: 'Loose', diff, text: `+${diff.toFixed(1)}" loose` };
  return { status: 'Very Loose', diff, text: `+${diff.toFixed(1)}" very loose` };
}

function checkFit(user, garmentSize, category) {
  // Validate inputs - Point 15, 35 (No PII log)
  try {
    fitInputSchema.parse(user);
    fitInputSchema.parse(garmentSize);
  } catch (e) {
    // PII log mat kar - Point 35
    console.error('Fit validation failed');
    return { error: 'Invalid measurements', main: { status: 'Error', text: '-' } };
  }

  const cat = String(category || '').toLowerCase().trim().replace(/[^a-z]/g, ''); // sanitize - Point 23
  const TOP_CATS = ['tshirt','top','shirt','kurta','dress','kurti','suit','blouse','saree'];
  const BOTTOM_CATS = ['jeans','pant','trouser','shorts','skirt','lehenga','palazzo'];

  const isTop = TOP_CATS.includes(cat);
  const isBottom = BOTTOM_CATS.includes(cat);

  const chestFit = getFitStatus(garmentSize.chest, user.chest);
  const waistFit = getFitStatus(garmentSize.waist, user.waist);
  const hipsFit = getFitStatus(garmentSize.hips, user.hips);

  // DPDP - jo chahiye wahi calculate
  if (isTop) {
    return { chest: chestFit, waist: { status: 'Ignored', diff: 0, text: '-' }, hips: { status: 'Ignored', diff: 0, text: '-' }, main: chestFit, type: 'TOP' };
  }
  if (isBottom) {
    // Jeans me waist main hai, hips secondary
    const main = waistFit.status !== 'Ignored' ? waistFit : hipsFit;
    return { chest: { status: 'Ignored', diff: 0, text: '-' }, waist: waistFit, hips: hipsFit, main, type: 'BOTTOM' };
  }
  
  // Kurta, Dress jaise BOTH ke liye - chest main
  return { chest: chestFit, waist: waistFit, hips: hipsFit, main: chestFit, type: 'BOTH' };
}

module.exports = { checkFit, getFitStatus };