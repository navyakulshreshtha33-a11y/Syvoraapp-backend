function getFitStatus(garmentVal, userVal) {
  if (!garmentVal || !userVal || isNaN(garmentVal) || isNaN(userVal)) {
    return { status: 'Ignored', diff: 0, text: '-' };
  }
  const diff = garmentVal - userVal;
  if (diff < -0.5) return { status: 'Tight', diff, text: `${Math.abs(diff).toFixed(1)} inch tight` };
  if (diff <= 1) return { status: 'Perfect', diff, text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} inch perfect` };
  if (diff <= 3) return { status: 'Loose', diff, text: `+${diff.toFixed(1)} inch loose` };
  return { status: 'Very Loose', diff, text: `+${diff.toFixed(1)} inch very loose` };
}

function checkFit(user, garmentSize, category) {
  const cat = (category || '').toLowerCase();
  
  const TOP_CATS = ['tshirt','top','shirt','kurta','dress','kurti','suit'];
  const BOTTOM_CATS = ['jeans','pant','trouser','shorts','skirt','pant'];

  const isTop = TOP_CATS.includes(cat);
  const isBottom = BOTTOM_CATS.includes(cat);

  const chestFit = getFitStatus(garmentSize.chest, user.chest);
  const waistFit = getFitStatus(garmentSize.waist, user.waist);
  const hipsFit = getFitStatus(garmentSize.hips, user.hips);

  if (isTop) {
    return {
      chest: chestFit,
      waist: { status: 'Ignored', diff: 0, text: '-' },
      hips: { status: 'Ignored', diff: 0, text: '-' },
      main: chestFit,
      type: 'TOP'
    };
  }

  if (isBottom) {
    return {
      chest: { status: 'Ignored', diff: 0, text: '-' },
      waist: waistFit,
      hips: hipsFit,
      main: waistFit,
      type: 'BOTTOM'
    };
  }

  // Suit/Dress me dono
  return {
    chest: chestFit,
    waist: waistFit,
    hips: hipsFit,
    main: chestFit,
    type: 'BOTH'
  };
}

module.exports = { checkFit, getFitStatus };