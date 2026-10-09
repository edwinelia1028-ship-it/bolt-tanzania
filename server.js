require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

// Hifadhidata ya Kudumu ya Ndani (Local Persistent DB)
const db = require('./db');
// Mfumo wa SMS Notifications
const sms = require('./sms');
// Mfumo wa Malipo Halisi ya Simu (M-Pesa, Tigo Pesa, Selcom, AzamPay)
const payment = require('./payment');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Kurasa Maalum za Watumiaji (Dedicated Dashboards)
app.get('/driver', (req, res) => res.sendFile(path.join(__dirname, 'driver.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ==========================================
// MADEREVA WA SASA (Live Active Drivers)
// ==========================================
let drivers = {
  "drv_101": {
    id: "drv_101",
    name: "Juma Rashid",
    phone: "+255 754 123 456",
    vehicle: "Toyota IST (Nyeupe)",
    plate: "T 482 DXY",
    rating: 4.9,
    type: "standard",
    location: { lat: -6.8120, lng: 39.2820 },
    isOnline: true,
    isBusy: false,
    socketId: null
  },
  "drv_102": {
    id: "drv_102",
    name: "Hamisi Selemani",
    phone: "+255 712 987 654",
    vehicle: "Boxer 150 (Nyekundu)",
    plate: "MC 123 ABC",
    rating: 4.8,
    type: "boda",
    location: { lat: -6.8220, lng: 39.2780 },
    isOnline: true,
    isBusy: false,
    socketId: null
  }
};

let activeRides = {};

function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// 1. API ya Kukadiria Nauli (Fare Estimation)
app.post('/api/rides/estimate', (req, res) => {
  const { pickup, destination, rideType } = req.body;

  const rates = {
    boda: { base: 1000, perKm: 500, minFare: 2000 },
    bajaj: { base: 1500, perKm: 800, minFare: 3000 },
    standard: { base: 2500, perKm: 1200, minFare: 5000 },
    xl: { base: 4000, perKm: 1800, minFare: 8000 }
  };

  const selectedRate = rates[rideType] || rates.standard;
  const distanceKm = calculateDistanceInKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const calculatedFare = Math.max(selectedRate.base + (distanceKm * selectedRate.perKm), selectedRate.minFare);

  res.json({
    success: true,
    distanceKm: distanceKm,
    estimatedMinutes: Math.round(distanceKm * 3) + 2,
    fare: Math.round(calculatedFare / 100) * 100,
    currency: "TZS"
  });
});

// 2. API ya Kutafuta Maeneo (Nominatim Places Search)
app.get('/api/places/search', async (req, res) => {
  const query = req.query.q;
  if (!query || query.trim().length < 2) {
    return res.json({ success: true, results: [] });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tz&limit=5&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BoltCloneApp/1.0' }
    });
    const data = await response.json();
    
    const results = data.map(item => ({
      name: item.display_name.split(',')[0],
      fullAddress: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    }));

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: "Imeshindwa kutafuta eneo" });
  }
});

// 2.5 API ya Reverse Geocoding (Kupata jina la mtaa kutoka GPS lat/lng)
app.get('/api/places/reverse', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ success: false });

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BoltCloneApp/1.0' }
    });
    const data = await response.json();
    const name = data.display_name ? data.display_name.split(',').slice(0, 3).join(', ') : `Eneo Langu (${parseFloat(lat).toFixed(3)}, ${parseFloat(lng).toFixed(3)})`;
    res.json({ success: true, name, fullAddress: data.display_name });
  } catch (error) {
    res.json({ success: true, name: `Eneo Langu (${parseFloat(lat).toFixed(3)}, ${parseFloat(lng).toFixed(3)})` });
  }
});

// 3. ULINZI WA MSIMAMIZI (Admin Authentication & Password Protection)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'bolt2026';
const ADMIN_TOKEN = 'bolt_admin_session_token_2026';

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({
      success: true,
      token: ADMIN_TOKEN,
      message: "Umefanikiwa kuingia kama Msimamizi!"
    });
  }
  return res.status(401).json({
    success: false,
    message: "Jina la mtumiaji au nenosiri si sahihi!"
  });
});

// API YA TAKWIMU ZA MSIMAMIZI (Admin Dashboard Stats & 15% Commission)
app.get('/api/admin/stats', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "Huna ruhusa ya kuona ukurasa huu. Tafadhali ingiza nenosiri."
    });
  }

  try {
    const rides = db.getAllRides();
    const payments = db.getAllPayments();
    const availableDrivers = Object.values(drivers);

    const totalRevenue = rides.reduce((sum, r) => sum + (Number(r.fare) || 0), 0);
    const commissionRate = 0.15; // 15% Bolt/Eddie Ride Commission
    const companyEarnings = Math.round(totalRevenue * commissionRate);
    const driversPayout = totalRevenue - companyEarnings;

    const breakdown = rides.map(r => ({
      rideId: r.rideId,
      date: r.createdAt,
      passenger: r.passenger?.name || "Mteja",
      driver: r.driver?.name || "Juma Rashid",
      pickup: r.pickup?.address || "Pickup",
      destination: r.destination?.address || "Destination",
      fare: r.fare,
      commission: Math.round(r.fare * commissionRate),
      driverNet: Math.round(r.fare * (1 - commissionRate)),
      paymentMethod: r.paymentMethod || "mpesa",
      status: r.status
    }));

    // Orodha ya Maombi ya Abiria ya Sasa (Active & Pending Passenger Requests)
    const activeRequests = Object.values(activeRides).map(r => ({
      rideId: r.id,
      passenger: r.passengerName || "Mteja",
      pickup: r.pickup?.address || "Posta",
      destination: r.destination?.address || "Mlimani City",
      rideType: r.rideType,
      fare: r.fare,
      status: r.status,
      driverId: r.driverId,
      driverName: drivers[r.driverId]?.name || (r.status === 'SEARCHING' ? 'Inatafuta Dereva...' : 'Dereva'),
      requestedAt: r.requestedAt || new Date().toISOString()
    }));

    res.json({
      success: true,
      stats: {
        totalRides: rides.length,
        totalRevenue,
        commissionRate: "15%",
        companyEarnings,
        driversPayout,
        activeDriversCount: availableDrivers.filter(d => d.isOnline).length,
        totalPaymentsRecorded: payments.length,
        activeRequestsCount: activeRequests.length
      },
      activeRequests,
      transactions: breakdown
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ success: false, error: "Hitilafu ya kupata takwimu za msimamizi" });
  }
});

// 4. API YA USAJILI WA WATUMIAJI (Abiria au Dereva)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, email, password, role, vehicleDetails } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: "Jina, simu na nenosiri vinahitajika!" });
    }

    const cleanPhone = phone.trim();
    const existing = db.findUserByPhone(cleanPhone);
    if (existing) {
      return res.status(400).json({ success: false, message: "Namba hii ya simu tayari imesajiliwa!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = db.addUser({
      name,
      phone: cleanPhone,
      email: email || '',
      password: hashedPassword,
      role: role || 'passenger',
      driverDetails: role === 'driver' ? vehicleDetails : null
    });

    // Kama amejisajili kama dereva, msajili pia kwenye orodha ya madereva wa mtandao
    if (role === 'driver') {
      drivers[newUser.id] = {
        id: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        vehicle: vehicleDetails?.vehicle || "Toyota IST",
        plate: vehicleDetails?.plate || "T 000 ABC",
        rating: 5.0,
        type: vehicleDetails?.type || "standard",
        location: { lat: -6.8120, lng: 39.2820 },
        isOnline: true,
        isBusy: false,
        socketId: null
      };
    }

    res.json({
      success: true,
      message: "Umefanikiwa kusajiliwa!",
      user: {
        id: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        role: newUser.role,
        driverDetails: newUser.driverDetails
      }
    });
  } catch (err) {
    console.error("Auth register error:", err);
    res.status(500).json({ success: false, message: "Hitilafu ya usajili." });
  }
});

// 5. API YA KUINGIA (Login: Dereva, Msimamizi, au Abiria)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = (phone || '').trim();

    // 1. Ruhusu Msimamizi (Admin) kuingia kupitia fomu hii pia
    if ((cleanPhone.toLowerCase() === ADMIN_USER || cleanPhone === 'admin' || cleanPhone === '0626198847') && password === ADMIN_PASS) {
      return res.json({
        success: true,
        message: "Karibu Msimamizi wa Eddie Ride!",
        role: "admin",
        token: ADMIN_TOKEN,
        user: { id: "admin_1", name: "Eddie Msimamizi", phone: "0626198847", role: "admin" }
      });
    }

    // 2. Hakiki dereva au abiria wa kawaida
    const user = db.findUserByPhone(cleanPhone);
    if (!user) {
      return res.status(401).json({ success: false, message: "Namba ya simu au nenosiri si sahihi!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Namba ya simu au nenosiri si sahihi!" });
    }

    // Kama ni dereva, hakikisha yupo kwenye orodha ya madereva
    if (user.role === 'driver' && !drivers[user.id]) {
      drivers[user.id] = {
        id: user.id,
        name: user.name,
        phone: user.phone,
        vehicle: user.driverDetails?.vehicle || "Toyota IST",
        plate: user.driverDetails?.plate || "T 000 ABC",
        rating: 5.0,
        type: user.driverDetails?.type || "standard",
        location: { lat: -6.8120, lng: 39.2820 },
        isOnline: true,
        isBusy: false,
        socketId: null
      };
    }

    res.json({
      success: true,
      message: "Umefanikiwa kuingia!",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        driverDetails: user.driverDetails
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hitilafu ya kuingia." });
  }
});

// 6. API YA HISTORIA YA SAFARI
app.get('/api/rides/history', (req, res) => {
  try {
    const rides = db.getAllRides();
    res.json({ success: true, count: rides.length, rides });
  } catch (err) {
    console.error("Ride history error:", err);
    res.status(500).json({ success: false, error: "Imeshindwa kupata historia" });
  }
});

// 7. API YA MALIPO YA SIMU (M-PESA / TIGO PESA / AIRTEL MONEY / SELCOM STK PUSH)
app.post('/api/payments/stk-push', async (req, res) => {
  const { phoneNumber, provider, amount, rideId, description } = req.body;

  if (!phoneNumber || !amount) {
    return res.status(400).json({
      success: false,
      message: "Tafadhali weka namba sahihi ya simu na kiasi cha nauli!"
    });
  }

  try {
    const paymentResult = await payment.initiateSTKPush({
      phoneNumber,
      amount,
      provider,
      rideId,
      description
    });
    res.json(paymentResult);
  } catch (error) {
    console.error("Payment error:", error);
    res.status(500).json({
      success: false,
      message: "Hitilafu ya kuanzisha malipo ya simu."
    });
  }
});

// 7.5 API YA WEBHOOK / CALLBACK KUTOKA SELCOM / AZAMPAY / VODACOM
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const result = await payment.handlePaymentWebhook(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7.6 API YA KUANGALIA TAARIFA ZA GATEWAYS ZINAZOTUMIKA
app.get('/api/payments/gateway-info', (req, res) => {
  res.json(payment.getPaymentGatewayInfo());
});

// 8. API ya Kuangalia Madereva Walio Hewani
app.get('/api/drivers/available', (req, res) => {
  const available = Object.values(drivers).filter(d => d.isOnline && !d.isBusy);
  res.json({ success: true, count: available.length, drivers: available });
});

// 9. API ya Kusoma Ripoti za SMS
app.get('/api/sms/logs', (req, res) => {
  res.json({ success: true, logs: sms.getSMSLogs() });
});

// 10. API ya Kuangalia Salio la Beem Africa SMS Gateway
app.get('/api/sms/balance', async (req, res) => {
  const balanceInfo = await sms.getBeemBalance();
  res.json(balanceInfo);
});

// ==========================================
// SOCKET.IO REAL-TIME LOGIC
// ==========================================
io.on('connection', (socket) => {
  console.log(`[Mtumiaji Ameunganishwa] Socket ID: ${socket.id}`);

  socket.on('driver:online', (driverData) => {
    const driverId = driverData.id || "drv_101";
    if (drivers[driverId]) {
      drivers[driverId].socketId = socket.id;
      drivers[driverId].isOnline = true;
      if (driverData.location) drivers[driverId].location = driverData.location;
    } else {
      drivers[driverId] = {
        id: driverId,
        name: driverData.name || "Dereva",
        phone: driverData.phone || "+255 700 000 000",
        vehicle: driverData.vehicle || "Toyota IST",
        plate: driverData.plate || "T 000 ABC",
        rating: 5.0,
        type: driverData.type || "standard",
        location: driverData.location || { lat: -6.8120, lng: 39.2820 },
        isOnline: true,
        isBusy: false,
        socketId: socket.id
      };
    }
    socket.join('drivers_room');
  });

  socket.on('driver:update_location', (data) => {
    const { driverId, location } = data;
    if (drivers[driverId]) {
      drivers[driverId].location = location;
      if (drivers[driverId].activeRideId && activeRides[drivers[driverId].activeRideId]) {
        const ride = activeRides[drivers[driverId].activeRideId];
        io.to(ride.passengerSocketId).emit('ride:driver_moved', { location });
      }
    }
  });

  socket.on('passenger:request_ride', (rideRequest) => {
    const rideId = "RIDE_" + Date.now();
    const newRide = {
      id: rideId,
      passengerSocketId: socket.id,
      passengerName: rideRequest.passengerName || "Mteja",
      pickup: rideRequest.pickup,
      destination: rideRequest.destination,
      rideType: rideRequest.rideType || "standard",
      fare: rideRequest.fare,
      distanceKm: rideRequest.distanceKm || 5.0,
      paymentMethod: rideRequest.paymentMethod || 'mpesa',
      status: "SEARCHING",
      driverId: null,
      requestedAt: new Date().toISOString()
    };

    activeRides[rideId] = newRide;

    // Arifu Admin kuwa kuna ombi jipya la safari
    io.emit('admin:ride_requested', newRide);

    let nearestDriver = null;
    let minDistance = Infinity;

    for (const dId in drivers) {
      const driver = drivers[dId];
      if (driver.isOnline && !driver.isBusy && driver.type === newRide.rideType) {
        const dist = calculateDistanceInKm(
          newRide.pickup.lat, newRide.pickup.lng,
          driver.location.lat, driver.location.lng
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestDriver = driver;
        }
      }
    }

    // Tuma SMS kwa dereva aliye karibu
    sms.notifyDriverNewRide(nearestDriver?.phone || "0626198847", newRide.pickup.address || "Posta", newRide.destination.address || "Mlimani City", newRide.fare);

    if (nearestDriver && nearestDriver.socketId) {
      io.to(nearestDriver.socketId).emit('driver:incoming_ride', {
        rideId: rideId,
        pickup: newRide.pickup,
        destination: newRide.destination,
        fare: newRide.fare,
        distanceToPickup: minDistance
      });
    } else {
      io.to('drivers_room').emit('driver:incoming_ride', {
        rideId: rideId,
        pickup: newRide.pickup,
        destination: newRide.destination,
        fare: newRide.fare
      });
    }
  });

  socket.on('driver:accept_ride', ({ rideId, driverId }) => {
    const ride = activeRides[rideId];
    const driver = drivers[driverId];

    if (ride && driver && !driver.isBusy) {
      ride.status = "ACCEPTED";
      ride.driverId = driverId;
      driver.isBusy = true;
      driver.activeRideId = rideId;

      // Arifu Admin kuwa dereva amekubali safari
      io.emit('admin:ride_updated', { rideId, status: 'ACCEPTED', driver: driver.name });

      // Tuma SMS kwa simu ya abiria
      const smsText = `HABARI: Dereva wako wa Eddie Ride, ${driver.name} (${driver.vehicle} - ${driver.plate}) anakufuata sasa. Nauli: TZS ${Number(ride.fare).toLocaleString()}. Msaada: 0626198847.`;
      sms.notifyPassengerRideAccepted("0626198847", driver.name, driver.vehicle, driver.plate, ride.fare);

      io.to(ride.passengerSocketId).emit('passenger:ride_accepted', {
        rideId: rideId,
        driver: {
          name: driver.name,
          phone: driver.phone,
          vehicle: driver.vehicle,
          plate: driver.plate,
          rating: driver.rating,
          location: driver.location
        },
        fare: ride.fare
      });

      // Tuma arifa ya SMS kwa abiria
      io.to(ride.passengerSocketId).emit('passenger:sms_alert', { message: smsText });

      socket.emit('driver:ride_confirmed', { ride });
    }
  });

  socket.on('ride:complete', ({ rideId }) => {
    const ride = activeRides[rideId];
    if (ride) {
      ride.status = "COMPLETED";
      const driver = drivers[ride.driverId];
      if (driver) {
        driver.isBusy = false;
        driver.activeRideId = null;
      }

      const completedRideRecord = {
        rideId: ride.id,
        passenger: { name: ride.passengerName, phone: "+255 700 000 000" },
        driver: driver ? { name: driver.name, vehicle: driver.vehicle, plate: driver.plate } : undefined,
        pickup: { address: ride.pickup.address || "Posta", lat: ride.pickup.lat, lng: ride.pickup.lng },
        destination: { address: ride.destination.address || "Mlimani City", lat: ride.destination.lat, lng: ride.destination.lng },
        rideType: ride.rideType,
        distanceKm: ride.distanceKm,
        fare: ride.fare,
        paymentMethod: ride.paymentMethod,
        status: "COMPLETED",
        createdAt: new Date().toISOString()
      };

      db.addRide(completedRideRecord);

      io.to(ride.passengerSocketId).emit('passenger:ride_completed', { fare: ride.fare, rideId: ride.id });
      io.emit('admin:ride_updated', { rideId: ride.id, status: 'COMPLETED' });
      delete activeRides[rideId];
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Mtumiaji Ameondoka] Socket ID: ${socket.id}`);
  });
});

// Anzisha Seva
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 BOLT BACKEND INAFANYA KAZI KIKAMILIFU!`);
  console.log(`💾 Hifadhidata ya Kudumu: bolt_database.json`);
  console.log(`👑 Dashibodi ya Msimamizi (15% Kamisheni): /api/admin/stats`);
  console.log(`👉 Fungua: http://localhost:${PORT}`);
  console.log(`===============================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Hitilafu: Port ${PORT} inatumika na mchakato mwingine wa Node!`);
    console.error(`👉 Tatua kwa kuandika amri hii kwenye PowerShell: Stop-Process -Name node -Force\n`);
  }
});