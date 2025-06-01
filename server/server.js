// server.js
import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import passport from 'passport';
import connectDB from './config/db.js';
import configurePassport from './config/passportConfig.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import userRoutes from './routes/userRoutes.js';
import foodAnalysisRoutes from './routes/foodAnalysisRoutes.js';
import { protect } from './middleware/authMiddleware.js';
import FoodAnalysis from './models/foodAnalysisModel.js';
import creditService from './services/creditService.js';
import logger from './utils/logger.js';

dotenv.config();

// Connect to MongoDB
connectDB();

// Log server startup
logger.info('Server starting up', { version: '1.0.0' });

const app = express();
const port = process.env.PORT || 8080;

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger.http); // Added HTTP request logger

// Initialize Passport
app.use(passport.initialize());
configurePassport();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY not found in environment variables. Please create a .env file with GEMINI_API_KEY=YOUR_API_KEY", null, 'api');
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

// Routes
app.use('/api/users', userRoutes);
app.use('/api/food-analyses', foodAnalysisRoutes);

// Import and use credit routes
import creditRoutes from './routes/creditRoutes.js';
app.use('/api/credits', creditRoutes);

// Protected route for calorie estimation
app.post('/api/estimate-calories', protect, upload.single('foodImage'), async (req, res) => {
    logger.info(`POST /api/estimate-calories initiated by user: ${req.user._id}`, { filename: req.file ? req.file.originalname : 'No file', userId: req.user._id }, 'api');
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload an image file' });
    }
    
    // Always consume credits for this API endpoint, regardless of auth method
    const creditResult = await creditService.consumeCredits(req.user, '/api/estimate-calories');
    
    // If not enough credits, return error
    if (!creditResult.success) {
        return res.status(creditResult.statusCode || 429).json({ 
            error: creditResult.message,
            credits: {
                used: req.user.apiCreditsUsed,
                total: req.user.apiCreditsTotal,
                remaining: req.user.apiCreditsTotal - req.user.apiCreditsUsed
            }
        });
    } else {
        // Log successful credit consumption
        logger.info('Credit consumption successful', { userId: req.user._id, creditsRemaining: req.user.apiCreditsTotal - req.user.apiCreditsUsed }, 'credits');
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
                f.  "fiberGrams": A string representing the estimated fiber in grams for that item. If unknown, use "N/A".
                g.  "sugarGrams": A string representing the estimated sugar in grams for that item. If unknown, use "N/A".
                h.  "sodiumMg": A string representing the estimated sodium in milligrams for that item. If unknown, use "N/A".
                i.  "healthScore": A number from 1-10 representing how healthy this food item is, where 1 is least healthy and 10 is most healthy.
                j.  "dietaryCategory": An array of strings representing dietary categories this food fits into (e.g., ["Vegetarian", "Low-carb", "Gluten-free"]). If none apply, use an empty array.
                k.  "potentialAllergens": An array of strings for common allergens that may be present (e.g., ["Nuts", "Dairy", "Gluten"]). If none, use an empty array.
            2.  "totalCalories": A string representing the estimated total calorie count for the entire meal (e.g., "Approx. 500-600 kcal").
            3.  "totalProteinGrams": A string for the total estimated protein in grams for the meal. If unknown, use "N/A".
            4.  "totalCarbsGrams": A string for the total estimated carbohydrates in grams for the meal. If unknown, use "N/A".
            5.  "totalFatGrams": A string for the total estimated fat in grams for the meal. If unknown, use "N/A".
            6.  "totalFiberGrams": A string for the total estimated fiber in grams for the meal. If unknown, use "N/A".
            7.  "totalSugarGrams": A string for the total estimated sugar in grams for the meal. If unknown, use "N/A".
            8.  "totalSodiumMg": A string for the total estimated sodium in milligrams for the meal. If unknown, use "N/A".
            9.  "overallHealthScore": A number from 1-10 representing the overall healthiness of the entire meal, where 1 is least healthy and 10 is most healthy.
            10. "mealType": A string suggesting what meal type this food is most appropriate for (e.g., "Breakfast", "Lunch", "Dinner", "Snack").
            11. "caloriesDensity": A string representing calories per gram for the overall meal (e.g., "Medium density (2.5 kcal/g)").
            12. "portionRecommendation": A string with a suggested healthy portion size (e.g., "One serving (approximately 150g) is recommended for an adult").
            13. "description": A brief string describing the overall meal and its nutritional characteristics.

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

        logger.api('Sending request to Gemini API', { userId: req.user._id, prompt_type: 'macronutrient' });
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        let textResponse = response.text(); 

        logger.debug('Raw Response from Gemini API', { userId: req.user._id, responseText: textResponse }, 'api');

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
            logger.debug('Successfully parsed JSON from Gemini response', { userId: req.user._id }, 'api');
            
            // Helper function to convert nutritional values to integers without units
            function averageRangeInString(valueString) {
                // Handle all edge cases - ensure we always return a valid number string
                if (!valueString || 
                    typeof valueString !== 'string' ||
                    valueString === 'N/A' || 
                    valueString === 'Unknown' || 
                    valueString === 'Unable to estimate calories' ||
                    valueString === 'Insufficient data') {
                    return "0"; // Return "0" for non-numeric values
                }
                
                try {
                    // First, try to extract a range (e.g., "100-150 kcal")
                    const rangeMatch = valueString.match(/([\d.]+)\s*-\s*([\d.]+)/);
                    if (rangeMatch) {
                        const low = parseFloat(rangeMatch[1]);
                        const high = parseFloat(rangeMatch[2]);
                        if (!isNaN(low) && !isNaN(high)) {
                            // Both values are valid numbers
                            const avg = Math.round((low + high) / 2);
                            return String(Math.max(0, avg)); // Ensure non-negative
                        }
                    }
                    
                    // Next, try to find any number in the string
                    const numberMatches = valueString.match(/(\d+(\.\d+)?)/);
                    if (numberMatches) {
                        const value = parseFloat(numberMatches[1]);
                        if (!isNaN(value)) {
                            return String(Math.max(0, Math.round(value))); // Ensure non-negative
                        }
                    }
                    
                    // If we get here, no valid numbers were found
                    return "0";
                } catch (error) {
                    logger.warn('Error parsing nutritional value in averageRangeInString', { valueString, errorDetails: error }, 'parser');
                    return "0"; // Fallback to zero for any parsing errors
                }
            }
            
            // Process all food items to average ranges
            if (Array.isArray(jsonOutput.foodItems)) {
                jsonOutput.foodItems = jsonOutput.foodItems.map(item => ({
                    ...item,
                    calories: averageRangeInString(item.calories),
                    proteinGrams: averageRangeInString(item.proteinGrams),
                    carbsGrams: averageRangeInString(item.carbsGrams),
                    fatGrams: averageRangeInString(item.fatGrams),
                    fiberGrams: averageRangeInString(item.fiberGrams),
                    sugarGrams: averageRangeInString(item.sugarGrams),
                    sodiumMg: averageRangeInString(item.sodiumMg)
                }));
            }
            
            // Process total values to average ranges
            jsonOutput.totalCalories = averageRangeInString(jsonOutput.totalCalories);
            jsonOutput.totalProteinGrams = averageRangeInString(jsonOutput.totalProteinGrams);
            jsonOutput.totalCarbsGrams = averageRangeInString(jsonOutput.totalCarbsGrams);
            jsonOutput.totalFatGrams = averageRangeInString(jsonOutput.totalFatGrams);
            jsonOutput.totalFiberGrams = averageRangeInString(jsonOutput.totalFiberGrams);
            jsonOutput.totalSugarGrams = averageRangeInString(jsonOutput.totalSugarGrams);
            jsonOutput.totalSodiumMg = averageRangeInString(jsonOutput.totalSodiumMg);
            
            // Ensure essential fields have default values for client-side consistency
            jsonOutput.foodItems = (Array.isArray(jsonOutput.foodItems) ? jsonOutput.foodItems : []).map(item => ({
                name: item.name || "Unknown Item",
                calories: item.calories || "N/A",
                proteinGrams: item.proteinGrams || "N/A",
                carbsGrams: item.carbsGrams || "N/A",
                fatGrams: item.fatGrams || "N/A",
                fiberGrams: item.fiberGrams || "N/A",
                sugarGrams: item.sugarGrams || "N/A",
                sodiumMg: item.sodiumMg || "N/A",
                healthScore: item.healthScore || 5,
                dietaryCategory: Array.isArray(item.dietaryCategory) ? item.dietaryCategory : [],
                potentialAllergens: Array.isArray(item.potentialAllergens) ? item.potentialAllergens : [],
            }));
            jsonOutput.totalCalories = jsonOutput.totalCalories || "N/A";
            jsonOutput.totalProteinGrams = jsonOutput.totalProteinGrams || "N/A";
            jsonOutput.totalCarbsGrams = jsonOutput.totalCarbsGrams || "N/A";
            jsonOutput.totalFatGrams = jsonOutput.totalFatGrams || "N/A";
            jsonOutput.totalFiberGrams = jsonOutput.totalFiberGrams || "N/A";
            jsonOutput.totalSugarGrams = jsonOutput.totalSugarGrams || "N/A";
            jsonOutput.totalSodiumMg = jsonOutput.totalSodiumMg || "N/A";
            jsonOutput.overallHealthScore = jsonOutput.overallHealthScore || 5;
            jsonOutput.mealType = jsonOutput.mealType || "Unknown";
            jsonOutput.caloriesDensity = jsonOutput.caloriesDensity || "Unknown";
            jsonOutput.portionRecommendation = jsonOutput.portionRecommendation || "No specific recommendation";
            jsonOutput.description = jsonOutput.description || "No description provided.";

            // Save analysis to database with image
            try {
              // Convert image buffer to base64 string for MongoDB storage
              const imageBase64 = req.file.buffer.toString('base64');
              const mimeType = req.file.mimetype;
              
              // Create a new FoodAnalysis record with image data
              const foodAnalysisRecord = await FoodAnalysis.create({
                user: req.user._id, // From the authentication middleware
                ...jsonOutput,
                image: {
                  data: imageBase64,
                  contentType: mimeType
                }
              });
              
              logger.db(`Food analysis saved for user ${req.user._id}. Record ID: ${foodAnalysisRecord._id}`, { userId: req.user._id, analysisId: foodAnalysisRecord._id });
              
              // Add the database ID to the response
              jsonOutput.analysisId = foodAnalysisRecord._id;
              
              res.status(200).json(jsonOutput);
            } catch (dbError) {
              logger.error('Error saving food analysis to database', { userId: req.user._id, error: dbError }, 'db');
              // Still return the result to the user even if DB save fails
              res.status(200).json({
                ...jsonOutput,
                dbSaveError: 'Analysis results could not be saved to database'
              });
            }
        } catch (jsonError) {
            logger.error('Error parsing JSON from Gemini response', { userId: req.user._id, rawText: textResponse, error: jsonError }, 'api');
            res.status(500).json({ error: 'Could not process AI response (format error)', rawResponse: textResponse });
        }

    } catch (error) {
        logger.error('Error during Gemini API call or processing', { userId: req.user._id, error: error }, 'api');
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
        logger.error("Unhandled error in general error middleware", {
            originalUrl: req.originalUrl,
            method: req.method,
            userId: req.user ? req.user._id : 'N/A',
            error: err
        }, 'http');
        return res.status(400).json({ error: err.message || 'An unknown error occurred' });
    }
    next();
});

// Error middleware
app.use(notFound);
app.use(errorHandler);
const hostname = process.env.HOST || 'localhost';

app.listen(port, hostname, () => {
    logger.success(`Server running at http://${hostname}:${port}/`);
    logger.api("GEMINI_API_KEY is " + (GEMINI_API_KEY ? "set and ready" : "NOT SET. Please check .env file."));
    logger.food("Food analysis service initialized and ready");
});
