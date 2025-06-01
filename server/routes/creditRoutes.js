// routes/creditRoutes.js
import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import creditService from '../services/creditService.js';
import CreditTransaction from '../models/creditTransactionModel.js';

const router = express.Router();

// @desc    Get current user's credit balance and history
// @route   GET /api/credits
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get transaction history
    const historyResult = await creditService.getTransactionHistory(userId);
    
    if (!historyResult.success) {
      return res.status(historyResult.statusCode || 500).json({
        message: historyResult.message
      });
    }
    
    res.json({
      credits: {
        total: req.user.apiCreditsTotal,
        used: req.user.apiCreditsUsed,
        remaining: req.user.apiCreditsTotal - req.user.apiCreditsUsed
      },
      transactions: historyResult.transactions
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Add credits to a user (admin only)
// @route   POST /api/credits/:userId/add
// @access  Admin
router.post('/:userId/add', protect, admin, async (req, res) => {
  try {
    const { amount } = req.body;
    const { userId } = req.params;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Please provide a valid positive amount' });
    }
    
    const result = await creditService.addCredits(
      userId, 
      Number(amount), 
      `Admin credit addition by ${req.user.name}`
    );
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        message: result.message
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reset user's used credits (admin only)
// @route   POST /api/credits/:userId/reset
// @access  Admin
router.post('/:userId/reset', protect, admin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await creditService.resetCredits(userId);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        message: result.message
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all credit transactions (admin only)
// @route   GET /api/credits/all
// @access  Admin
router.get('/all', protect, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const transactions = await CreditTransaction.find({})
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await CreditTransaction.countDocuments();
    
    res.json({
      transactions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get a user's credit transactions (admin only)
// @route   GET /api/credits/:userId/history
// @access  Admin
router.get('/:userId/history', protect, admin, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await creditService.getTransactionHistory(userId, limit);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        message: result.message
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
