const mongoose = require('mongoose');

const RideSchema = new mongoose.Schema({
  rideId: {
    type: String,
    required: true,
    unique: true
  },
  passenger: {
    name: { type: String, default: "Mteja" },
    phone: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  driver: {
    name: String,
    phone: String,
    vehicle: String,
    plate: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  pickup: {
    address: { type: String, required: true },
    lat: Number,
    lng: Number
  },
  destination: {
    address: { type: String, required: true },
    lat: Number,
    lng: Number
  },
  rideType: {
    type: String,
    enum: ['boda', 'bajaj', 'standard', 'xl'],
    default: 'standard'
  },
  distanceKm: {
    type: Number,
    default: 0
  },
  fare: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'mpesa', 'tigo', 'airtel', 'card'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    default: 'COMPLETED'
  },
  status: {
    type: String,
    enum: ['REQUESTED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED'],
    default: 'COMPLETED'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Ride', RideSchema);

