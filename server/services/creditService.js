// services/creditService.js
import User from '../models/userModel.js';
import CreditTransaction from '../models/creditTransactionModel.js';

/**
 * Service for handling API credit operations
 */
export const creditService = {
  /**
   * Consume credits for an API request
   * @param {Object} user - User document
   * @param {String} endpointPath - API endpoint path
   * @returns {Promise<Object>} Result of the operation
   */
  async consumeCredits(user, endpointPath) {
    // Default credit cost is 1, but you can vary it based on endpoint
    const creditCost = this.getEndpointCreditCost(endpointPath);
    
    try {
      // Find user with fresh data
      const freshUser = await User.findById(user._id);
      
      // Check if user has enough credits
      const remainingCredits = freshUser.apiCreditsTotal - freshUser.apiCreditsUsed;
      
      if (remainingCredits < creditCost) {
        return {
          success: false,
          message: `Insufficient API credits. You need ${creditCost} credits but have only ${remainingCredits} remaining.`,
          statusCode: 429 // Too Many Requests
        };
      }
      
      // Update user's credit usage
      freshUser.apiCreditsUsed += creditCost;
      await freshUser.save();
      
      // Record the transaction
      await CreditTransaction.create({
        user: freshUser._id,
        amount: -creditCost,
        type: 'consume',
        description: `API request to ${endpointPath}`,
        endpointPath,
        balanceAfter: freshUser.apiCreditsTotal - freshUser.apiCreditsUsed
      });
      
      return {
        success: true,
        remainingCredits: freshUser.apiCreditsTotal - freshUser.apiCreditsUsed,
        creditsUsed: freshUser.apiCreditsUsed
      };
    } catch (error) {
      console.error('Error consuming credits:', error);
      return {
        success: false,
        message: 'Error processing API credits',
        statusCode: 500
      };
    }
  },
  
  /**
   * Add credits to a user's account
   * @param {String} userId - User ID
   * @param {Number} amount - Amount of credits to add
   * @param {String} description - Description of the refill
   * @returns {Promise<Object>} Result of the operation
   */
  async addCredits(userId, amount, description = 'Credit refill') {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return {
          success: false,
          message: 'User not found',
          statusCode: 404
        };
      }
      
      // Check if adding these credits would exceed the maximum limit
      // You can set a maximum limit to prevent abuse
      const MAX_CREDITS = 1000;
      const newTotal = user.apiCreditsTotal + amount;
      
      if (newTotal > MAX_CREDITS) {
        return {
          success: false,
          message: `Cannot exceed maximum credit limit of ${MAX_CREDITS}`,
          statusCode: 400
        };
      }
      
      // Add credits to user's total
      user.apiCreditsTotal += amount;
      await user.save();
      
      // Record the transaction
      await CreditTransaction.create({
        user: user._id,
        amount: amount,
        type: 'refill',
        description,
        balanceAfter: user.apiCreditsTotal - user.apiCreditsUsed
      });
      
      return {
        success: true,
        totalCredits: user.apiCreditsTotal,
        remainingCredits: user.apiCreditsTotal - user.apiCreditsUsed
      };
    } catch (error) {
      console.error('Error adding credits:', error);
      return {
        success: false,
        message: 'Error adding API credits',
        statusCode: 500
      };
    }
  },
  
  /**
   * Reset a user's used credits (for admin use)
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Result of the operation
   */
  async resetCredits(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return {
          success: false,
          message: 'User not found',
          statusCode: 404
        };
      }
      
      // Store previous value for the response
      const previousUsed = user.apiCreditsUsed;
      
      // Reset used credits
      user.apiCreditsUsed = 0;
      await user.save();
      
      // Record the transaction
      await CreditTransaction.create({
        user: user._id,
        amount: previousUsed, // Adding back the previously used credits
        type: 'adjustment',
        description: 'Admin reset of used credits',
        balanceAfter: user.apiCreditsTotal
      });
      
      return {
        success: true,
        previousUsed,
        currentUsed: 0,
        remainingCredits: user.apiCreditsTotal
      };
    } catch (error) {
      console.error('Error resetting credits:', error);
      return {
        success: false,
        message: 'Error resetting API credits',
        statusCode: 500
      };
    }
  },
  
  /**
   * Get credit transaction history for a user
   * @param {String} userId - User ID
   * @param {Number} limit - Maximum number of transactions to return
   * @returns {Promise<Object>} Result of the operation with transaction history
   */
  async getTransactionHistory(userId, limit = 20) {
    try {
      const transactions = await CreditTransaction.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit);
      
      return {
        success: true,
        transactions
      };
    } catch (error) {
      console.error('Error fetching credit history:', error);
      return {
        success: false,
        message: 'Error fetching credit transaction history',
        statusCode: 500
      };
    }
  },
  
  /**
   * Get credit cost for specific endpoints
   * This allows you to charge different amounts for different API endpoints
   * @param {String} endpointPath - API endpoint path
   * @returns {Number} Credit cost for the endpoint
   */
  getEndpointCreditCost(endpointPath) {
    // Define custom costs for specific endpoints
    const costMap = {
      '/api/estimate-calories': 1, // Default cost
      // Add more endpoints with different costs as needed
    };
    
    return costMap[endpointPath] || 1; // Default to 1 if not specified
  }
};

export default creditService;
