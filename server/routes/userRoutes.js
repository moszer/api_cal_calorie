// routes/userRoutes.js
import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/userModel.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';
import verifyGoogleIdToken from '../utils/googleTokenVerifier.js';

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    // Generate unique API key
    const apiKey = uuidv4();

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      apiKey,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        apiKey: user.apiKey,
        token: generateToken(user._id),
      });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    // Check if user exists and password matches
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        apiKey: user.apiKey,
        token: generateToken(user._id),
      });
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        apiKey: user.apiKey,
        apiCreditsUsed: user.apiCreditsUsed,
        apiCreditsTotal: user.apiCreditsTotal,
        apiCreditsRemaining: user.apiCreditsTotal - user.apiCreditsUsed,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
});

// @desc    Regenerate API key
// @route   POST /api/users/api-key
// @access  Private
router.post('/api-key', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      // Generate new API key
      user.apiKey = uuidv4();
      await user.save();

      res.json({
        apiKey: user.apiKey,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
});

// @desc    Get all users
// @route   GET /api/users
// @access  Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (user) {
      res.json(user);
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.isAdmin = req.body.isAdmin !== undefined ? req.body.isAdmin : user.isAdmin;
      
      const updatedUser = await user.save();
      
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
});

// @desc    Google OAuth login
// @route   GET /api/users/auth/google
// @access  Public
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// @desc    Handle iOS Google Sign-In
// @route   POST /api/users/auth/google/ios
// @access  Public
router.post('/auth/google/ios', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ message: 'ID token is required' });
    }
    
    // Verify the Google ID token
    const payload = await verifyGoogleIdToken(idToken);
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    
    logger.info(`iOS Google Sign-In: ${email} (${googleId})`);
    
    // Find or create user
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    
    if (!user) {
      // Create new user
      const apiKey = uuidv4();
      user = await User.create({
        name,
        email,
        googleId,
        apiKey,
        apiCreditsUsed: 0,
        apiCreditsTotal: 100,
      });
      logger.info(`Created new user via iOS Google Sign-In: ${email}`);
    } else if (!user.googleId) {
      // User exists but doesn't have Google ID - link accounts
      user.googleId = googleId;
      if (!user.apiKey) {
        user.apiKey = uuidv4();
      }
      await user.save();
      logger.info(`Linked existing account to Google: ${email}`);
    }
    
    // Generate JWT token
    const token = generateToken(user._id);
    
    // Return user info and token
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      apiKey: user.apiKey,
      apiCreditsUsed: user.apiCreditsUsed,
      apiCreditsTotal: user.apiCreditsTotal,
      token,
    });
    
  } catch (error) {
    logger.error(`iOS Google auth error: ${error.message}`);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

// @desc    Google OAuth callback
// @route   GET /api/users/auth/google/callback
// @access  Public
router.get(
  '/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    try {
      // Generate JWT token for the authenticated user
      const token = generateToken(req.user._id);

      // Redirect to client with token and user data as query parameters
      const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3001'}/auth/google/callback`;
      const queryParams = new URLSearchParams({
        token,
        name: req.user.name,
        email: req.user.email,
        userId: req.user._id,
        apiKey: req.user.apiKey,
        isAdmin: req.user.isAdmin
      }).toString();

      res.redirect(`${redirectUrl}?${queryParams}`);
    } catch (error) {
      logger.error('Google OAuth callback error', { error: error.message });
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3001'}/login?error=auth_failed`);
    }
  }
);

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (user) {
      // Prevent deleting self
      if (user._id.toString() === req.user._id.toString()) {
        res.status(400);
        throw new Error('Cannot delete your own account');
      }
      
      await User.deleteOne({ _id: user._id });
      res.json({ message: 'User removed' });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Reset user's API credits used
// @route   POST /api/users/:id/reset-count
// @access  Admin
router.post('/:id/reset-count', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (user) {
      // Store the previous usage for the response
      const previousUsed = user.apiCreditsUsed;
      
      // Reset the used credits to 0
      user.apiCreditsUsed = 0;
      await user.save();
      
      res.json({
        message: 'API credits reset successfully',
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          previousUsed,
          currentUsed: 0,
          apiCreditsTotal: user.apiCreditsTotal,
          apiCreditsRemaining: user.apiCreditsTotal
        }
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Get user's API usage statistics
// @route   GET /api/users/:id/api-stats
// @access  Admin
router.get('/:id/api-stats', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (user) {
      // In a real-world scenario, you might have more detailed stats
      // stored in a separate collection
      res.json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          apiKey: user.apiKey ? '********-****-****-****-************' : 'Not generated',
          hasApiKey: !!user.apiKey
        },
        apiStats: {
          totalRequests: user.apiRequestCount,
          lastReset: user.updatedAt, // Using updatedAt as a proxy for last reset
        }
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
