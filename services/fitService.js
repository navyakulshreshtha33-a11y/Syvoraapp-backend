// services/fitService.js - Robust Fit Engine
const { z } = require('zod');

const fitInputSchema = z.object({
  chest: z.number().min(20).max(70).optional().nullable(),
  shoulder: z.number().min(10).max(30).optional().nullable(),
  length: z.number().min(10).max(70).optional().nullable(),
  waist: z.number().min(20).max(70).optional().nullable(),
  hips: z.number().min(20).max(70).optional().nullable(),
  thigh: z.number().min(10).max(40).optional().nullable(),
  inseam: z.number().min(10).max(50).optional().nullable(),
});

function toNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

// 🚀 Helper to normalize flat (pit-to-pit / half-width) measurements to full circumference
function normalizeGarmentSize(garmentSize) {
  if (!garmentSize) return garmentSize;
  const normalized = { ...garmentSize };

  // Adult clothing mein agar chest < 32" hai (e.g., 20", 21", 22"), toh wo flat pit-to-pit hai, isliye x 2
  if (normalized.chest !== null && normalized.chest !== undefined) {
    const chestNum = Number(normalized.chest);
    if (!isNaN(chestNum) && chestNum > 0 && chestNum < 32) {
      normalized.chest = chestNum * 2;
    }
  }

  // Adult bottoms/waist mein agar waist < 26" / flat format ho toh normalization handle karta hai
  if (normalized.waist !== null && normalized.waist !== undefined) {
    const waistNum = Number(normalized.waist);
    if (!isNaN(waistNum) && waistNum > 0 && waistNum < 24) {
      normalized.waist = waistNum * 2;
    }
  }

  return normalized;
}

function getFitStatus(garmentVal, userVal) {
  const g = toNumber(garmentVal);
  const u = toNumber(userVal);

  if (g === null || u === null) {
    return { status: 'Ignored', diff: 0, text: '-' };
  }

  // Positive diff means Garment is bigger than User
  // Negative diff means Garment is smaller than User
  const diff = Number((g - u).toFixed(2));
  
  if (diff < -0.5) return { status: 'Tight', diff, text: `${Math.abs(diff).toFixed(1)}" tight` };
  if (diff <= 1.5) return { status: 'Perfect', diff, text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}" perfect` };
  if (diff <= 3.5) return { status: 'Loose', diff, text: `+${diff.toFixed(1)}" loose` };
  return { status: 'Very Loose', diff, text: `+${diff.toFixed(1)}" very loose` };
}

function checkFit(user, garmentSize, category) {
  // 🚀 Safely normalize flat measurements (pit-to-pit) before calculating fit
  const safeGarmentSize = normalizeGarmentSize(garmentSize);

  try {
    fitInputSchema.parse(user || {});
    fitInputSchema.parse(safeGarmentSize || {});
  } catch (e) {
    console.error('Fit validation failed');
    return { error: 'Invalid measurements', main: { status: 'Error', text: '-' } };
  }

  const cat = String(category || '').toLowerCase().trim().replace(/[^a-z]/g, '');
  const TOP_CATS = ['tshirt','top','shirt','kurta','dress','kurti','suit','blouse','saree'];
  const BOTTOM_CATS = ['jeans','pant','trouser','shorts','skirt','lehenga','palazzo'];

  const isTop = TOP_CATS.includes(cat);
  const isBottom = BOTTOM_CATS.includes(cat);

  const chestFit = getFitStatus(safeGarmentSize.chest, user?.chest);
  const shoulderFit = getFitStatus(safeGarmentSize.shoulder, user?.shoulder);
  const waistFit = getFitStatus(safeGarmentSize.waist, user?.waist);
  const hipsFit = getFitStatus(safeGarmentSize.hips, user?.hips);
  const thighFit = getFitStatus(safeGarmentSize.thigh, user?.thigh);

  if (isTop) {
    const main = chestFit.status !== 'Ignored' ? chestFit : (shoulderFit.status !== 'Ignored' ? shoulderFit : { status: 'Ignored', diff: 0, text: '-' });
    return { 
      chest: chestFit, shoulder: shoulderFit, waist: { status: 'Ignored', diff: 0, text: '-' }, 
      hips: { status: 'Ignored', diff: 0, text: '-' }, thigh: { status: 'Ignored', diff: 0, text: '-' }, 
      main, type: 'TOP' 
    };
  }

  if (isBottom) {
    // Bottom wear strictly priorities waist, then hips, then thigh
    let main = waistFit;
    if (waistFit.status === 'Ignored') {
      main = hipsFit.status !== 'Ignored' ? hipsFit : thighFit;
    }
    return { 
      chest: { status: 'Ignored', diff: 0, text: '-' }, shoulder: { status: 'Ignored', diff: 0, text: '-' }, 
      waist: waistFit, hips: hipsFit, thigh: thighFit, 
      main, type: 'BOTTOM' 
    };
  }
  
  const main = chestFit.status !== 'Ignored' ? chestFit : waistFit;
  return { chest: chestFit, shoulder: shoulderFit, waist: waistFit, hips: hipsFit, thigh: thighFit, main, type: 'BOTH' };
}

module.exports = { checkFit, getFitStatus };