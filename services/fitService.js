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