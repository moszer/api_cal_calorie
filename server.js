// server.js
import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not found in environment variables. Please create a .env file with GEMINI_API_KEY=YOUR_API_KEY");
    process.exit(1);
}
const MODEL_NAME = "gemini-1.5-flash-latest";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

function fileToGenerativePart(buffer, mimeType) {
    return { inlineData: { data: buffer.toString("base64"), mimeType } };
}

app.post('/estimate-calories', upload.single('foodImage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload an image file' });
    }

    try {
        const imageBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;

        // --- Create Prompt for Gemini (Updated for Macronutrients) ---
        const prompt = `
            Analyze the provided food image. You MUST return a JSON object with the following structure:
            1.  "foodItems": An array of objects. Each object in this array MUST contain:
                a.  "name": A string representing the identified food item (e.g., "Apple", "Slice of Pizza"). Be specific.
                b.  "calories": A string representing the estimated calorie count for that single item (e.g., "Approx. 95 kcal").
                c.  "proteinGrams": A string representing the estimated protein in grams for that item (e.g., "Approx. 0.3g", "12g"). If unknown, use "N/A".
                d.  "carbsGrams": A string representing the estimated carbohydrates in grams for that item (e.g., "Approx. 25g", "30g"). If unknown, use "N/A".
                e.  "fatGrams": A string representing the estimated fat in grams for that item (e.g., "Approx. 0.2g", "15g"). If unknown, use "N/A".
            2.  "totalCalories": A string representing the estimated total calorie count for the entire meal (e.g., "Approx. 500-600 kcal").
            3.  "totalProteinGrams": A string for the total estimated protein in grams for the meal. If unknown, use "N/A".
            4.  "totalCarbsGrams": A string for the total estimated carbohydrates in grams for the meal. If unknown, use "N/A".
            5.  "totalFatGrams": A string for the total estimated fat in grams for the meal. If unknown, use "N/A".
            6.  "description": A brief string describing the overall meal and its nutritional characteristics.

            Example of the EXACT desired JSON output format:
            {
              "foodItems": [
                { 
                  "name": "Grilled Chicken Breast", 
                  "calories": "Approx. 165 kcal",
                  "proteinGrams": "Approx. 31g",
                  "carbsGrams": "Approx. 0g",
                  "fatGrams": "Approx. 3.6g"
                },
                { 
                  "name": "Steamed Broccoli", 
                  "calories": "Approx. 55 kcal",
                  "proteinGrams": "Approx. 3.7g",
                  "carbsGrams": "Approx. 11.2g",
                  "fatGrams": "Approx. 0.6g"
                }
              ],
              "totalCalories": "Approx. 220 kcal",
              "totalProteinGrams": "Approx. 34.7g",
              "totalCarbsGrams": "Approx. 11.2g",
              "totalFatGrams": "Approx. 4.2g",
              "description": "A lean and healthy meal consisting of grilled chicken breast and steamed broccoli, rich in protein and fiber."
            }

            If multiple distinct food items are visible, list each one separately in the "foodItems" array.
            If you cannot identify specific items or estimate nutrients, use "Unknown food item", "N/A" for nutrient fields, or "Unable to estimate calories", but always try to maintain the JSON structure.
            Provide all text in English.
        `;

        const imagePart = fileToGenerativePart(imageBuffer, mimeType);

        console.log('Sending request to Gemini API (with macronutrient prompt)...');
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        let textResponse = response.text(); 

        console.log('--- Raw Response from Gemini API ---');
        console.log(textResponse);
        console.log('--- End of Raw Response ---');

        const markdownJsonRegex = /^```json\s*([\s\S]*?)\s*```$/m;
        const match = textResponse.match(markdownJsonRegex);
        if (match && match[1]) {
            textResponse = match[1].trim();
        } else {
            const genericMarkdownRegex = /^```\s*([\s\S]*?)\s*```$/m;
            const genericMatch = textResponse.match(genericMarkdownRegex);
            if (genericMatch && genericMatch[1]) {
                textResponse = genericMatch[1].trim();
            }
        }
        
        try {
            const jsonOutput = JSON.parse(textResponse);
            
            // Ensure essential fields have default values for client-side consistency
            jsonOutput.foodItems = (Array.isArray(jsonOutput.foodItems) ? jsonOutput.foodItems : []).map(item => ({
                name: item.name || "Unknown Item",
                calories: item.calories || "N/A",
                proteinGrams: item.proteinGrams || "N/A",
                carbsGrams: item.carbsGrams || "N/A",
                fatGrams: item.fatGrams || "N/A",
            }));
            jsonOutput.totalCalories = jsonOutput.totalCalories || "N/A";
            jsonOutput.totalProteinGrams = jsonOutput.totalProteinGrams || "N/A";
            jsonOutput.totalCarbsGrams = jsonOutput.totalCarbsGrams || "N/A";
            jsonOutput.totalFatGrams = jsonOutput.totalFatGrams || "N/A";
            jsonOutput.description = jsonOutput.description || "No description provided.";

            res.status(200).json(jsonOutput);
        } catch (jsonError) {
            console.error('Error parsing JSON from Gemini. Raw text:', textResponse, 'Error:', jsonError);
            res.status(500).json({ error: 'Could not process AI response (format error)', rawResponse: textResponse });
        }

    } catch (error) {
        console.error('Error during API call or processing:', error);
        // ... (keep existing detailed error handling for Gemini blocks, quota, etc.)
        if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
            return res.status(400).json({ error: `Request blocked by Gemini: ${error.response.promptFeedback.blockReason}` });
        }
        // ... other specific error checks
        else {
            return res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
        console.error("Unhandled error in middleware:", err);
        return res.status(400).json({ error: err.message || 'An unknown error occurred' });
    }
    next();
});

app.listen(port, '0.0.0.0', () => {
    console.log(`API Server running at http://localhost:${port} and on your local network IP`);
    console.log("GEMINI_API_KEY is " + (GEMINI_API_KEY ? "set." : "NOT SET. Please check .env file."));
});
