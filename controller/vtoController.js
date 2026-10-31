const axios = require('axios');
const cloudinary = require('../services/cloudinary.js');

async function callAIVTO(personImageUrl, garmentImageUrl) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }

    // Using Gemini multimodal model which natively handles image inputs via AI Studio API key
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Act as an expert AI fashion stylist and professional image generator. Generate a photorealistic virtual try-on image showing the person from the first image wearing the apparel item from the second image. Maintain lighting, accurate proportions, and high quality studio output. Return the final image."
            },
            {
              file_data: {
                mime_type: "image/jpeg",
                file_uri: personImageUrl
              }
            },
            {
              file_data: {
                mime_type: "image/jpeg",
                file_uri: garmentImageUrl
              }
            }
          ]
        }
      ]
    };

    // Note: If URL-based file_uri isn't supported directly by REST without upload, 
    // let's use standard image generation or fallback cleanly.
  } catch (error) {
    console.error("AI Studio VTO Error:", error.response?.data || error.message);
    throw new Error("Virtual Try-On generation failed from AI service.");
  }
}