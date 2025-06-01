// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import creditService from '../services/creditService.js';

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token (exclude password)
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
      }
      
      // For JWT token auth, we don't consume credits (only for API key auth)
      // But we add credit info to the request for reference
      req.creditInfo = {
        remaining: req.user.apiCreditsTotal - req.user.apiCreditsUsed,
        used: req.user.apiCreditsUsed
      };

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  }

  // Check for API key
  else if (req.headers['x-api-key']) {
    try {
      const apiKey = req.headers['x-api-key'];
      
      // Find user with this API key
      const user = await User.findOne({ apiKey }).select('-password');
      
      if (!user) {
        res.status(401);
        throw new Error('Invalid API key');
      }
      
      // When using API key authentication, we'll need to make sure the user object is refreshed
      // since we need to see the latest credit usage. API keys are primarily for external API usage.
      
      // Get the freshest user data to ensure accurate credit tracking
      const freshUser = await User.findById(user._id);
      
      // Update our reference to use the fresh user data
      user = freshUser;
      
      // Set the user in the request (we'll directly modify credits in the estimate-calories endpoint)
      req.user = user;
      // Add credit info to request for potential use in controllers
      req.creditInfo = {
        remaining: user.apiCreditsTotal - user.apiCreditsUsed,
        used: user.apiCreditsUsed,
        total: user.apiCreditsTotal
      };
      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('API key authentication failed');
    }
  }

  // No token or API key
  else {
    res.status(401);
    throw new Error('Not authorized, no token or API key');
  }
};

// Admin middleware
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    res.status(401);
    throw new Error('Not authorized as an admin');
  }
};

export { protect, admin };
