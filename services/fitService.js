// services/fitService.js - Updated for Flexible & Partial Measurements
const { z } = require('zod');

// Flexible Zod validation: all fields optional & nullable so users can fill partially
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
  try {
    fitInputSchema.parse(user || {});
    fitInputSchema.parse(garmentSize || {});
  } catch (e) {
    console.error('Fit validation failed');
    return { error: 'Invalid measurements', main: { status: 'Error', text: '-' } };
  }

  const cat = String(category || '').toLowerCase().trim().replace(/[^a-z]/g, '');
  const TOP_CATS = ['tshirt','top','shirt','kurta','dress','kurti','suit','blouse','saree'];
  const BOTTOM_CATS = ['jeans','pant','trouser','shorts','skirt','lehenga','palazzo'];

  const isTop = TOP_CATS.includes(cat);
  const isBottom = BOTTOM_CATS.includes(cat);

  const chestFit = getFitStatus(garmentSize.chest, user?.chest);
  const shoulderFit = getFitStatus(garmentSize.shoulder, user?.shoulder);
  const waistFit = getFitStatus(garmentSize.waist, user?.waist);
  const hipsFit = getFitStatus(garmentSize.hips, user?.hips);
  const thighFit = getFitStatus(garmentSize.thigh, user?.thigh);

  if (isTop) {
    // Determine main status based on what's available (prefer chest)
    const main = chestFit.status !== 'Ignored' ? chestFit : (shoulderFit.status !== 'Ignored' ? shoulderFit : { status: 'Ignored', diff: 0, text: '-' });
    return { 
      chest: chestFit, shoulder: shoulderFit, waist: { status: 'Ignored', diff: 0, text: '-' }, 
      hips: { status: 'Ignored', diff: 0, text: '-' }, thigh: { status: 'Ignored', diff: 0, text: '-' }, 
      main, type: 'TOP' 
    };
  }

  if (isBottom) {
    // For bottoms, waist is primary, hips/thigh secondary
    const main = waistFit.status !== 'Ignored' ? waistFit : (hipsFit.status !== 'Ignored' ? hipsFit : thighFit);
    return { 
      chest: { status: 'Ignored', diff: 0, text: '-' }, shoulder: { status: 'Ignored', diff: 0, text: '-' }, 
      waist: waistFit, hips: hipsFit, thigh: thighFit, 
      main, type: 'BOTTOM' 
    };
  }
  
  // Default / BOTH (e.g., Kurta, Dress)
  const main = chestFit.status !== 'Ignored' ? chestFit : waistFit;
  return { chest: chestFit, shoulder: shoulderFit, waist: waistFit, hips: hipsFit, thigh: thighFit, main, type: 'BOTH' };
}

module.exports = { checkFit, getFitStatus };