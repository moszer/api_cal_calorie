// server.js
import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
// import fs from 'node:fs'; // Not strictly needed if using buffer directly
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
        let textResponse = response.text(); // Use let so it can be modified

        console.log('--- Raw Response from Gemini API ---');
        console.log(textResponse);
        console.log('--- End of Raw Response ---');

        // Attempt to strip Markdown code block if present (e.g., ```json\n{...}\n```)
        const markdownJsonRegex = /^```json\s*([\s\S]*?)\s*```$/m; // Handle multiline and optional leading/trailing whitespace
        const match = textResponse.match(markdownJsonRegex);
        if (match && match[1]) {
            console.log('Markdown JSON block detected, attempting to extract JSON.');
            textResponse = match[1].trim(); // Use the captured group and trim whitespace
        } else {
            // Fallback for cases where it might just start with ``` and end with ``` without "json"
            const genericMarkdownRegex = /^```\s*([\s\S]*?)\s*```$/m;
            const genericMatch = textResponse.match(genericMarkdownRegex);
            if (genericMatch && genericMatch[1]) {
                console.log('Generic Markdown block detected, attempting to extract content.');
                textResponse = genericMatch[1].trim();
            }
        }


        // Attempt to parse the text response from Gemini as JSON
        try {
            const jsonOutput = JSON.parse(textResponse);
            res.status(200).json(jsonOutput);
        } catch (jsonError) {
            console.error('Error parsing JSON from Gemini. Raw text that failed to parse:', textResponse); // Log the text that failed
            console.error('Parsing Error details:', jsonError); // Log the actual parsing error
            res.status(500).json({
                error: 'Could not process calorie information from AI (incorrect format)',
                rawResponse: textResponse // Send raw response for debugging
            });
        }

    } catch (error) {
        console.error('Error calling Gemini API or during processing:', error);
        // Handle various types of errors that might occur
        if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
            // This checks for specific blocking reasons from Gemini's response structure
            console.error('Request blocked by Gemini. Reason:', error.response.promptFeedback.blockReason);
            console.error('Safety Ratings:', error.response.promptFeedback.safetyRatings);
            return res.status(400).json({
                error: `Request was blocked by Gemini due to safety policy: ${error.response.promptFeedback.blockReason}`,
                details: `Safety Ratings: ${JSON.stringify(error.response.promptFeedback.safetyRatings)}`
            });
        }
        if (error.message && error.message.includes('SAFETY')) { // General safety message check
             return res.status(400).json({ error: 'Request was blocked due to Gemini\'s safety policy (potentially inappropriate content in image or prompt)', details: error.message });
        } else if (error.message && error.message.includes('No candidates found')) {
             return res.status(500).json({ error: 'Gemini API could not generate a response for this image or prompt (No candidates found)', details: error.message });
        } else if (error.message && (error.message.includes('quota') || (error.response && error.response.status === 429))) {
            return res.status(429).json({ error: 'API quota exceeded. Please try again later.' });
        }
         else {
            return res.status(500).json({ error: 'Internal server error while processing the image', details: error.message });
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
    // If no error, or if headers have already been sent, pass to Express default error handler
    if (res.headersSent) {
        return next(err);
    }
    // Ensure 'next' is called if it's not an error we handle here, or if it's meant for further processing
    next();
});


app.listen(port, '0.0.0.0', () => { // Added '0.0.0.0' for easier testing from real devices on the same network
    console.log(`API Server is running at http://localhost:${port} (and on your local network IP)`);
    console.log("Don't forget to set your GEMINI_API_KEY in the .env file.");
});