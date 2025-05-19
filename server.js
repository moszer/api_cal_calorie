// server.js
import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
// import fs from 'node:fs'; // Not strictly needed if using buffer directly, but can be kept if future use cases require it.
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// --- Gemini API Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not found in environment variables");
    process.exit(1); // Exit the program if there's no API key
}
const MODEL_NAME = "gemini-1.5-flash-latest"; // Or "gemini-1.5-flash"
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    // Safety settings can be further configured as needed
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
    ],
});

// --- Multer Configuration (for receiving image files) ---
// Store files in memory temporarily (for production, consider storing on disk or cloud storage)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// --- Helper Function: Convert Buffer to Part for Gemini API ---
function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

// --- API Endpoint: /estimate-calories (POST) ---
app.post('/estimate-calories', upload.single('foodImage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload an image file' });
    }

    try {
        const imageBuffer = req.file.buffer;
        const mimeType = req.file.mimetype; // e.g., 'image/jpeg', 'image/png'

        // --- Create Prompt for Gemini ---
        // This is a crucial part that needs to be customized to get the best results
        const prompt = `
            Analyze this food image and provide the following information in JSON format:
            1.  A list of each food item found in the image.
            2.  The estimated calorie count (kcal) for each food item.
            3.  The estimated total calorie count for all food items in the image.
            4.  A brief description of the nutritional value or characteristics of the overall meal.

            Example of the desired JSON structure:
            {
              "foodItems": [
                { "name": "Food Item 1", "calories": "Approx. X kcal" },
                { "name": "Food Item 2", "calories": "Approx. Y kcal" }
              ],
              "totalCalories": "Approx. Z kcal",
              "description": "Description of the meal..."
            }

            If you cannot identify the food or estimate calories, please indicate "Unable to identify" in the JSON or provide the best possible information.
            Please provide the information in English.
        `;

        const imagePart = fileToGenerativePart(imageBuffer, mimeType);

        console.log('Sending request to Gemini API...');
        // Send prompt and image to Gemini API
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const textResponse = response.text();

        console.log('Received response from Gemini API:', textResponse);

        // Attempt to parse the text response from Gemini as JSON
        try {
            const jsonOutput = JSON.parse(textResponse);
            res.status(200).json(jsonOutput);
        } catch (jsonError) {
            console.error('Error parsing JSON from Gemini:', jsonError);
            // If JSON parsing fails, might send raw text back or a meaningful error message
            res.status(500).json({
                error: 'Could not process calorie information from AI (incorrect format)',
                rawResponse: textResponse // Send raw response for debugging
            });
        }

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        // Handle various types of errors that might occur
        if (error.message && error.message.includes('SAFETY')) {
             res.status(400).json({ error: 'Request was blocked due to Gemini\'s safety policy (potentially inappropriate content in image or prompt)', details: error.message });
        } else if (error.message && error.message.includes('candidates found.') && !error.message.includes('No candidates found.')) { // Specific check for "0 candidates found"
             res.status(500).json({ error: 'Gemini API could not generate a response for this image or prompt (No candidates found)', details: error.message });
        } else if (error.message && (error.message.includes('quota') || (error.response && error.response.status === 429))) { // Check error.response for status code too
            res.status(429).json({ error: 'API quota exceeded. Please try again later.' });
        }
         else {
            res.status(500).json({ error: 'Internal server error while processing the image', details: error.message });
        }
    }
});

// Middleware for handling errors from multer and other errors
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
        // Handle other errors not directly from multer or Gemini
        return res.status(400).json({ error: err.message || 'An unknown error occurred' });
    }
    next(); // If no error, proceed to the next middleware or route handler
});


app.listen(port, () => {
    console.log(`API Server is running at http://localhost:${port}`);
    console.log("Don't forget to set your GEMINI_API_KEY in the .env file.");
});