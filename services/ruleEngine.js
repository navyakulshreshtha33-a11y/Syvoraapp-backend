const { getTargetMeasurement } = require("./categoryStrategy");

// ======================================
// HEIGHT TO INCHES
// ======================================

function parseHeight(height) {

    const match = String(height)
        .trim()
        .match(/(\d+)'\s*(\d+)/);

    if (!match) return 64;

    const feet = Number(match[1]);
    const inches = Number(match[2]);

    return (feet * 12) + inches;
}


// ======================================
// ESTIMATE MEASUREMENTS
// ======================================

function estimateMeasurements(
    height,
    weight,
    gender,
    bodyType
) {

    const userHeight = parseHeight(height);

    let refHeight;
    let refWeight;

    let chest;
    let waist;
    let shoulder;
    let hip;


    // ======================================
    // MALE
    // ======================================

    if (gender.toLowerCase() === "male") {

        refHeight = 68;      // 5'8
        refWeight = 65;

        chest = 38;
        waist = 32;
        shoulder = 17;
        hip = 38;

    }


    // ======================================
    // FEMALE
    // ======================================

    else {

        refHeight = 64;      // 5'4
        refWeight = 54;

        // Recalibrated female base
        chest = 35;
        waist = 30;
        shoulder = 15;
        hip = 39;

    }


    const heightDiff = userHeight - refHeight;
    const weightDiff = weight - refWeight;


    // ======================================
    // HEIGHT EFFECT
    // ======================================

    chest += heightDiff * 0.25;

    if (gender.toLowerCase() === "female") {

        waist += heightDiff * 0.15;

    } else {

        waist += heightDiff * 0.10;

    }

    shoulder += heightDiff * 0.08;
    hip += heightDiff * 0.15;


    // ======================================
    // WEIGHT EFFECT
    // ======================================

    chest += weightDiff * 0.20;

    if (gender.toLowerCase() === "female") {

        waist += weightDiff * 0.35;

    } else {

        waist += weightDiff * 0.30;

    }

    hip += weightDiff * 0.25;


    // ======================================
    // BODY TYPE ADJUSTMENT
    // ======================================

    switch ((bodyType || "").toLowerCase()) {


        case "slim":

            chest -= 1;
            waist -= 1;

            break;


        case "athletic":

            chest += 1.5;
            shoulder += 1;
            waist -= 0.5;

            break;


        case "broad":

            chest += 2;
            shoulder += 1;

            // Female broad body adjustment
            if (gender.toLowerCase() === "female") {

                waist += 2;

            } else {

                waist += 1;

            }

            hip += 1;

            break;


        case "heavy":

            chest += 3;
            waist += 3;
            hip += 2;

            break;

    }


    return {

        chest: Number(chest.toFixed(1)),
        waist: Number(waist.toFixed(1)),
        shoulder: Number(shoulder.toFixed(1)),
        hip: Number(hip.toFixed(1))

    };

}


// ======================================
// BRAND ADJUSTMENT
// ======================================

const brandAdjustments = {

    // Runs Small

    "zara": 1,
    "forever 21": 1,
    "forever21": 1,
    "h&m": 0.5,
    "hm": 0.5,
    "mango": 0.5,
    "vero moda": 0.5,
    "only": 0.5,
    "jack & jones": 0.5,


    // Runs Large

    "us polo": -0.5,
    "u.s. polo assn.": -0.5,
    "puma": -0.5,
    "adidas": -0.5,
    "reebok": -0.5,


    // Standard

    "roadster": 0,
    "hrx": 0,
    "nike": 0,
    "levis": 0,
    "levi's": 0,
    "spykar": 0,
    "pepe jeans": 0,
    "wrangler": 0,
    "highlander": 0,
    "campus sutra": 0,
    "bewakoof": 0,
    "souled store": 0,
    "allen solly": 0,
    "van heusen": 0,
    "louis philippe": 0,
    "park avenue": 0,
    "raymond": 0,
    "arrow": 0,
    "fabindia": 0,
    "biba": 0,
    "libas": 0,
    "w": 0,
    "max": 0,
    "ajio": 0

};


// ======================================
// BEST SIZE
// ======================================

function getBestSize(userData, productData) {


    const measurements = estimateMeasurements(
        userData.userHeight,
        Number(userData.userWeight),
        userData.gender,
        userData.bodyType
    );


    // ======================================
    // TARGET MEASUREMENT
    // ======================================

    let target = getTargetMeasurement(
        productData.category,
        measurements
    );


    console.log("========== SYVORA DEBUG ==========");

    console.log(
        "Height:",
        userData.userHeight
    );

    console.log(
        "Weight:",
        userData.userWeight
    );

    console.log(
        "Gender:",
        userData.gender
    );

    console.log(
        "Body Type:",
        userData.bodyType
    );

    console.log(
        "Fit Type:",
        userData.fitType
    );

    console.log(
        "Category:",
        productData.category
    );

    console.log(
        "Brand:",
        productData.brand
    );

    console.log(
        "Measurements:",
        measurements
    );

    console.log(
        "Target BEFORE brand/fit:",
        target
    );


    // ======================================
    // BRAND
    // ======================================

    const brand =
        (productData.brand || "").toLowerCase();

    target +=
        brandAdjustments[brand] ?? 0;


    // ======================================
    // FIT TYPE
    // ======================================

    switch (
        (userData.fitType || "").toLowerCase()
    ) {

        case "slim":

            target -= 1;

            break;


        case "oversized":

            target += 2;

            break;


        default:

            break;

    }


    console.log(
        "Target AFTER brand/fit:",
        target
    );


    // ======================================
    // DEFAULT SIZE CHART
    // ======================================

    let chart;


    if (productData.sizeType === "numeric") {

        chart = {

            24: 24,
            26: 26,
            28: 28,
            30: 30,
            32: 32,
            34: 34,
            36: 36,
            38: 38,
            40: 40,
            42: 42,
            44: 44,
            46: 46,
            48: 48

        };

    }


    else {

        chart = {

            XXS: 32,
            XS: 34,
            S: 36,
            M: 38,
            L: 40,
            XL: 42,
            XXL: 44,
            "3XL": 46,
            "4XL": 48,
            "5XL": 50

        };

    }


    console.log(
        "Chart:",
        chart
    );


    // ======================================
    // IDEAL SIZE
    // ======================================

    let idealSize = null;
    let minDiff = Infinity;


    for (const size in chart) {

        const diff =
            Math.abs(
                chart[size] - target
            );


        if (diff < minDiff) {

            minDiff = diff;
            idealSize = size;

        }

    }


    // ======================================
    // CONFIDENCE
    // ======================================

    let confidence = Math.round(
        98 - (minDiff * 5)
    );


    confidence = Math.max(
        70,
        Math.min(98, confidence)
    );


    // ======================================
    // AVAILABLE SIZE CHECK
    // ======================================

    const available =
        (productData.availableSizes || [])
        .map(String);


    console.log(
        "Ideal Size:",
        idealSize
    );

    console.log(
        "Available Sizes:",
        available
    );


    // ======================================
    // IDEAL SIZE AVAILABLE
    // ======================================

    if (
        available.includes(
            String(idealSize)
        )
    ) {

        return {

            idealSize,

            recommendedSize:
                idealSize,

            available: true,

            confidence,

            measurements

        };

    }


    // ======================================
    // FIND CLOSEST AVAILABLE
    // ======================================

    let nearest = null;
    let nearestDiff = Infinity;


    for (const size of available) {

        if (!(size in chart))
            continue;


        const diff =
            Math.abs(
                chart[size] -
                chart[idealSize]
            );


        if (diff < nearestDiff) {

            nearestDiff = diff;
            nearest = size;

        }

    }


    // ======================================
    // NO AVAILABLE SIZE
    // ======================================

    if (!nearest) {

        return {

            idealSize,

            recommendedSize: null,

            available: false,

            measurements,

            confidence,

            message:
                `Your ideal size is ${idealSize}, but it is not available.`

        };

    }


    // ======================================
    // CLOSEST AVAILABLE SIZE
    // ======================================

    return {

        idealSize,

        recommendedSize:
            nearest,

        available: false,

        measurements,

        confidence,

        message:
            `Your ideal size is ${idealSize}, but it is not available. Closest available size is ${nearest}.`

    };

}


// ======================================
// EXPORT
// ======================================

module.exports = {

    parseHeight,
    estimateMeasurements,
    getBestSize

};