// models/creditTransactionModel.js
import mongoose from 'mongoose';

const creditTransactionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['consume', 'refill', 'adjustment'],
    },
    description: {
      type: String,
      required: true,
    },
    endpointPath: {
      type: String,
    },
    balanceAfter: {
      type: Number,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);

export default CreditTransaction;
