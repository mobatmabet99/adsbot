import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^-?\d+$/,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 255,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'KICKED'],
      default: 'ACTIVE',
      required: true,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    promotionsEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

export default Group;
