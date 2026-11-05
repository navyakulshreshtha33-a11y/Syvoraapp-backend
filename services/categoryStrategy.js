// =========================================
// CATEGORY STRATEGY
// =========================================

function getTargetMeasurement(category, measurements) {

    category = (category || "").toLowerCase();

    // --------------------------
    // JEANS / PANTS
    // --------------------------

    if (
        category.includes("jeans") ||
        category.includes("pant") ||
        category.includes("trouser") ||
        category.includes("cargo") ||
        category.includes("jean") ||
        category.includes("shorts") ||
        category.includes("short")

    ) {
        return measurements.waist;
    }

    // --------------------------
    // SHIRT
    // --------------------------

    if (category.includes("shirt") ||
category.includes("shirts") ) {
        return measurements.chest + 1;
    }

    // --------------------------
    // TSHIRT
    // --------------------------

    if (
        category.includes("tshirt") ||
        category.includes("t-shirt") ||
        category.includes("tee")
    ) {
        return measurements.chest + 0.5;
    }

    // --------------------------
    // KURTA / KURTI
    // --------------------------

    if (
        category.includes("kurta") ||
        category.includes("kurti")
    ) {
        return measurements.chest + 1;
    }

    // --------------------------
    // TOP
    // --------------------------

    if (category.includes("top")) {
        return measurements.chest;
    }

    // --------------------------
    // DRESS
    // --------------------------

    if (category.includes("dress")) {
        return measurements.chest + 1.5;
    }

    // --------------------------
    // JACKET / HOODIE
    // --------------------------

    if (
        category.includes("jacket") ||
        category.includes("hoodie") ||
        category.includes("sweatshirt")
    ) {
        return measurements.chest + 2;
    }

    // --------------------------
    // BLAZER / COAT
    // --------------------------

    if (
        category.includes("blazer") ||
        category.includes("coat")
    ) {
        return measurements.chest + 1.5;
    }

    // --------------------------
    // DEFAULT
    // --------------------------

    return measurements.chest;
}

module.exports = {
    getTargetMeasurement
};