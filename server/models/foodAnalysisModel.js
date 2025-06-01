// models/foodAnalysisModel.js
import mongoose from 'mongoose';

const foodItemSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  calories: {
    type: String,
    default: '0 kcal',
  },
  proteinGrams: {
    type: String,
    default: '0g',
  },
  carbsGrams: {
    type: String,
    default: '0g',
  },
  fatGrams: {
    type: String,
    default: '0g',
  },
  fiberGrams: {
    type: String,
    default: '0g',
  },
  sugarGrams: {
    type: String,
    default: '0g',
  },
  sodiumMg: {
    type: String,
    default: '0mg',
  },
  healthScore: {
    type: Number,
    default: 5,
  },
  dietaryCategory: {
    type: [String],
    default: [],
  },
  potentialAllergens: {
    type: [String],
    default: [],
  },
});

const foodAnalysisSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    foodItems: [foodItemSchema],
    totalCalories: {
      type: String,
      default: '0 kcal',
    },
    totalProteinGrams: {
      type: String,
      default: '0g',
    },
    totalCarbsGrams: {
      type: String,
      default: '0g',
    },
    totalFatGrams: {
      type: String,
      default: '0g',
    },
    totalFiberGrams: {
      type: String,
      default: '0g',
    },
    totalSugarGrams: {
      type: String,
      default: '0g',
    },
    totalSodiumMg: {
      type: String,
      default: '0mg',
    },
    overallHealthScore: {
      type: Number,
      default: 5,
    },
    mealType: {
      type: String,
      default: 'Unknown',
    },
    caloriesDensity: {
      type: String,
      default: 'Unknown',
    },
    portionRecommendation: {
      type: String,
      default: 'No specific recommendation',
    },
    description: {
      type: String,
      default: 'No description provided.',
    },
    image: {
      data: {
        type: String, // Will store base64 encoded image data
        required: false
      },
      contentType: {
        type: String, // Will store the MIME type (e.g., 'image/jpeg')
        required: false
      },
    },
  },
  {
    timestamps: true,
  }
);

const FoodAnalysis = mongoose.model('FoodAnalysis', foodAnalysisSchema);

export default FoodAnalysis;
