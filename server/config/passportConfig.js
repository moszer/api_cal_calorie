// config/passportConfig.js
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/userModel.js';

const configurePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/users/auth/google/callback',
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Find user by googleId
          let user = await User.findOne({ googleId: profile.id });

          // If user not found by googleId, try to find by email
          if (!user && profile.emails && profile.emails.length > 0) {
            const email = profile.emails[0].value;
            user = await User.findOne({ email });

            // If user found by email, link the Google ID to this account
            if (user) {
              user.googleId = profile.id;
              await user.save();
            }
          }

          // If user is still not found, create a new user
          if (!user) {
            // Generate unique API key
            const apiKey = uuidv4();
            
            // Create new user
            user = await User.create({
              name: profile.displayName,
              email: profile.emails[0].value,
              googleId: profile.id,
              apiKey
            });
          } else if (!user.apiKey) {
            // Generate API key if user doesn't have one
            user.apiKey = uuidv4();
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};

export default configurePassport;
