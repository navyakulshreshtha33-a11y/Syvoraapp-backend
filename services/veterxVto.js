const { PredictionServiceClient } = require('@aiplatform/google-cloud-aiplatform');
const { helpers } = require('@aiplatform/google-cloud-aiplatform');

// Client setup using service account credentials from .env
const clientOptions = {
  apiEndpoint: `${process.env.GCP_VERTEX_REGION || 'us-central1'}-aiplatform.googleapis.com`,
};
const predictionServiceClient = new PredictionServiceClient(clientOptions);

async function callVertexVirtualTryOn(personBuffer, garmentBuffer, category) {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_VERTEX_REGION || 'us-central1';
  
  // Vertex AI Imagen / VTO model endpoint path
  // Note: Model ID project ke anusar Imagen ya Vertex VTO endpoint par set hoti hai
  const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/imagegeneration`; // ya appropriate VTO model

  const personBase64 = personBuffer.toString('base64');
  const garmentBase64 = garmentBuffer.toString('base64');

  const parameters = helpers.toValue({
    sampleCount: 1,
    mode: "vto", // Virtual Try-On specific parameter
    category: category
  });

  const instances = [
    helpers.toValue({
      prompt: "Virtual try-on of garment on person",
      personImage: { bytesBase64Encoded: personBase64 },
      garmentImage: { bytesBase64Encoded: garmentBase64 }
    })
  ];

  const request = {
    endpoint,
    instances,
    parameters
  };

  const [response] = await predictionServiceClient.predict(request);
  const predictions = response.predictions;
  
  if (!predictions || predictions.length === 0) {
    throw new Error("Vertex AI did not return any predictions");
  }

  const prediction = helpers.fromValue(predictions[0]);
  const base64Image = prediction.bytesBase64Encoded || prediction.image?.bytesBase64Encoded;
  
  if (!base64Image) {
    throw new Error("Invalid output format from Vertex AI");
  }

  return Buffer.from(base64Image, 'base64');
}

module.exports = { callVertexVirtualTryOn };