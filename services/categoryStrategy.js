// // =========================================
// // CATEGORY STRATEGY
// // =========================================

// function getTargetMeasurement(category, measurements) {

//     category = (category || "").toLowerCase();

//     // --------------------------
//     // JEANS / PANTS
//     // --------------------------

//     if (
//         category.includes("jeans") ||
//         category.includes("pant") ||
//         category.includes("trouser") ||
//         category.includes("cargo") ||
//         category.includes("jean") ||
//         category.includes("shorts") ||
//         category.includes("short")

//     ) {
//         return measurements.waist;
//     }

//     // --------------------------
//     // SHIRT
//     // --------------------------

//     if (category.includes("shirt") ||
// category.includes("shirts") ) {
//         return measurements.chest + 1;
//     }

//     // --------------------------
//     // TSHIRT
//     // --------------------------

//     if (
//         category.includes("tshirt") ||
//         category.includes("t-shirt") ||
//         category.includes("tee")
//     ) {
//         return measurements.chest + 0.5;
//     }

//     // --------------------------
//     // KURTA / KURTI
//     // --------------------------

//     if (
//         category.includes("kurta") ||
//         category.includes("kurti")
//     ) {
//         return measurements.chest + 1;
//     }

//     // --------------------------
//     // TOP
//     // --------------------------

//     if (category.includes("top")) {
//         return measurements.chest;
//     }

//     // --------------------------
//     // DRESS
//     // --------------------------

//     if (category.includes("dress")) {
//         return measurements.chest + 1.5;
//     }

//     // --------------------------
//     // JACKET / HOODIE
//     // --------------------------

//     if (
//         category.includes("jacket") ||
//         category.includes("hoodie") ||
//         category.includes("sweatshirt")
//     ) {
//         return measurements.chest + 2;
//     }

//     // --------------------------
//     // BLAZER / COAT
//     // --------------------------

//     if (
//         category.includes("blazer") ||
//         category.includes("coat")
//     ) {
//         return measurements.chest + 1.5;
//     }

//     // --------------------------
//     // DEFAULT
//     // --------------------------

//     return measurements.chest;
// }

// module.exports = {
//     getTargetMeasurement
// };





















// =========================================
// CATEGORY STRATEGY
// =========================================

function toFiniteNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function getTargetMeasurement(category, measurements) {
  const m = measurements || {};
  const chest = toFiniteNumber(m.chest);
  const waist = toFiniteNumber(m.waist);
  const cat = String(category || "").toLowerCase().trim();

  // JEANS / PANTS / SHORTS
  if (
    cat.includes("jeans") ||
    cat.includes("jean") ||
    cat.includes("pant") ||
    cat.includes("trouser") ||
    cat.includes("cargo") ||
    cat.includes("shorts") ||
    cat.includes("short")
  ) {
    return waist !== null ? waist : chest;
  }

  if (chest === null) return null;

  // TSHIRT / TEE (check before shirt)
  if (cat.includes("tshirt") || cat.includes("t-shirt") || cat.includes("tee")) {
    return chest + 0.5;
  }

  // SHIRT
  if (cat.includes("shirt")) {
    return chest + 1;
  }

  // KURTA / KURTI
  if (cat.includes("kurta") || cat.includes("kurti")) {
    return chest + 1;
  }

  // TOP
  if (cat.includes("top")) {
    return chest;
  }

  // DRESS
  if (cat.includes("dress")) {
    return chest + 1.5;
  }

  // JACKET / HOODIE / SWEATSHIRT
  if (cat.includes("jacket") || cat.includes("hoodie") || cat.includes("sweatshirt")) {
    return chest + 2;
  }

  // BLAZER / COAT
  if (cat.includes("blazer") || cat.includes("coat")) {
    return chest + 1.5;
  }

  // DEFAULT
  return chest;
}

module.exports = {
  getTargetMeasurement
};