import mongoose from 'mongoose';

const promotionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const Promotion =
  mongoose.models.Promotion || mongoose.model('Promotion', promotionSchema);

export default Promotion;
