// utils/googleTokenVerifier.js
import axios from 'axios';
import logger from './logger.js';

/**
 * Verify a Google ID token
 * @param {string} idToken - The ID token to verify
 * @returns {Promise<Object>} - The payload from the verified token
 */
const verifyGoogleIdToken = async (idToken) => {
  try {
    // Google's token info endpoint
    const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
      params: { id_token: idToken }
    });
    
    // Verify the audience (client ID)
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (response.data.aud !== clientId) {
      logger.error(`Token audience mismatch: ${response.data.aud} vs ${clientId}`);
      throw new Error('Token audience mismatch');
    }
    
    return {
      sub: response.data.sub,
      email: response.data.email,
      email_verified: response.data.email_verified === 'true',
      name: response.data.name || '',
    };
  } catch (error) {
    logger.error(`Google token verification error: ${error.message}`);
    if (error.response) {
      logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    throw new Error('Failed to verify Google token');
  }
};

export default verifyGoogleIdToken;
