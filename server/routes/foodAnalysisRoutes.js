// routes/foodAnalysisRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import FoodAnalysis from '../models/foodAnalysisModel.js';
import logger from '../utils/logger.js';

const router = express.Router();

// @desc    Get all food analyses for the logged in user with optional date filtering
// @route   GET /api/food-analyses
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { date } = req.query;
    let query = { user: req.user._id };
    
    // Filter by createdAt date if provided
    if (date) {
      logger.info(`Filtering food analyses by date`, { date, userId: req.user._id });
      
      // Extract the date part from the ISO string (YYYY-MM-DD)
      const dateOnly = date.split('T')[0];
      
      // Create start and end dates for the day in UTC
      const startDate = new Date(`${dateOnly}T00:00:00.000Z`);
      const endDate = new Date(`${dateOnly}T23:59:59.999Z`);
      
      // Add date range query for createdAt
      query.createdAt = {
        $gte: startDate,
        $lte: endDate
      };
      
      logger.debug(`Date range for query`, { startDate: startDate.toISOString(), endDate: endDate.toISOString() });
    }
    
    const analyses = await FoodAnalysis.find(query)
      .sort({ createdAt: -1 }) // Most recent first
      .select('-__v'); // Exclude version key
    
    logger.info(`Found ${analyses.length} analyses for user`, { 
      count: analyses.length, 
      userId: req.user._id, 
      filtered: !!date
    });
    
    res.status(200).json(analyses);
  } catch (error) {
    logger.error(`Error fetching food analyses for user ${req.user._id}`, error);
    res.status(500).json({ message: 'Failed to fetch food analyses' });
  }
});

// @desc    Get a specific food analysis by ID
// @route   GET /api/food-analyses/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    // Special case for "all" which was causing ObjectId casting errors
    if (req.params.id === 'all') {
      logger.info('Redirecting /all request to base endpoint', { userId: req.user._id });
      // Return all analyses for this user without the ID filter
      const allAnalyses = await FoodAnalysis.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .select('-__v');
      
      logger.info(`Found ${allAnalyses.length} analyses for all request`, { userId: req.user._id });
      return res.status(200).json(allAnalyses);
    }
    
    // Normal case - looking up by ID
    logger.debug(`Fetching food analysis by ID`, { id: req.params.id, userId: req.user._id });
    
    const analysis = await FoodAnalysis.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!analysis) {
      logger.warn(`Food analysis not found`, { id: req.params.id, userId: req.user._id });
      return res.status(404).json({ message: 'Food analysis not found' });
    }
    
    logger.info(`Food analysis retrieved successfully`, { id: req.params.id });
    res.status(200).json(analysis);
  } catch (error) {
    logger.error(`Error fetching food analysis with ID ${req.params.id}`, error);
    
    // Specific error for ObjectId casting issues
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({ 
        message: 'Invalid ID format', 
        details: `The provided ID '${req.params.id}' is not a valid MongoDB ObjectId`
      });
    }
    
    res.status(500).json({ message: 'Failed to fetch food analysis' });
  }
});

// @desc    Delete a food analysis
// @route   DELETE /api/food-analyses/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    logger.debug(`Attempting to delete food analysis`, { id: req.params.id, userId: req.user._id });
    
    const analysis = await FoodAnalysis.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!analysis) {
      logger.warn(`Food analysis not found for deletion`, { id: req.params.id, userId: req.user._id });
      return res.status(404).json({ message: 'Food analysis not found' });
    }
    
    logger.info(`Food analysis deleted successfully`, { id: req.params.id, userId: req.user._id });
    res.status(200).json({ message: 'Food analysis deleted' });
  } catch (error) {
    logger.error(`Error deleting food analysis with ID ${req.params.id}`, error);
    
    // Specific error for ObjectId casting issues
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({ 
        message: 'Invalid ID format', 
        details: `The provided ID '${req.params.id}' is not a valid MongoDB ObjectId`
      });
    }
    
    res.status(500).json({ message: 'Failed to delete food analysis' });
  }
});

export default router;
