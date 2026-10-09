const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['passenger', 'driver'],
    default: 'passenger'
  },
  password: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    default: 5.0
  },
  // Taarifa maalum kwa Madereva tu
  driverDetails: {
    vehicleType: {
      type: String,
      enum: ['boda', 'bajaj', 'standard', 'xl'],
      default: 'standard'
    },
    vehicleName: String, // e.g. "Toyota IST" au "Boxer 150"
    plateNumber: String, // e.g. "T 482 DXY"
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    totalEarnings: { type: Number, default: 0 },
    completedRidesCount: { type: Number, default: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);

