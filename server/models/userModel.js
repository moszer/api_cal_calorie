// models/userModel.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function() {
        return !this.googleId; // Password is required only if googleId is not present
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // This allows null values and only enforces uniqueness on non-null values
    },
    apiKey: {
      type: String,
      unique: true,
    },
    apiCreditsUsed: {
      type: Number,
      default: 0,
    },
    apiCreditsTotal: {
      type: Number,
      default: 100,
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  // Only hash the password if it's modified and exists (Google users won't have a password)
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Check if password matches
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
