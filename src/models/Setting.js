import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: 'global',
    },
    delayMin: {
      type: Number,
      min: 0,
      default: 15,
      required: true,
    },
    delayMax: {
      type: Number,
      min: 0,
      default: 30,
      required: true,
    },
    cronSchedule: {
      type: String,
      trim: true,
      default: '0 * * * *',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

settingSchema.pre('validate', function validateDelayRange() {
  if (this.delayMin > this.delayMax) {
    this.invalidate('delayMax', 'delayMax must be greater than or equal to delayMin');
  }
});

const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

export default Setting;
