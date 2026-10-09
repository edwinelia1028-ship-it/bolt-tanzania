const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'bolt_database.json');

// Mfumo wa Hifadhidata ya Kudumu ya Ndani (Permanent Local Database)
class LocalDatabase {
  constructor() {
    this.data = {
      users: [],
      rides: [],
      payments: [],
      settings: {
        currency: "TZS",
        version: "1.0.0"
      }
    };
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
        if (!this.data.payments) this.data.payments = [];
        console.log(`✅ [DATABASE] Imefanikiwa kupakia hifadhidata ya kudumu kutoka: bolt_database.json`);
      } else {
        this.data.rides = [
          {
            rideId: "RIDE_SAMPLE_1",
            passenger: { name: "Amina Bakari", phone: "+255 714 555 123" },
            driver: { name: "Juma Rashid", vehicle: "Toyota IST", plate: "T 482 DXY" },
            pickup: { address: "Posta Mpya, Kivukoni" },
            destination: { address: "Mlimani City Mall, Ubungo" },
            rideType: "standard",
            distanceKm: 7.8,
            fare: 11900,
            paymentMethod: "mpesa",
            status: "COMPLETED",
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
          },
          {
            rideId: "RIDE_SAMPLE_2",
            passenger: { name: "Kelvin John", phone: "+255 765 888 999" },
            driver: { name: "Hamisi Selemani", vehicle: "Boxer 150", plate: "MC 123 ABC" },
            pickup: { address: "Kariakoo Sokoni" },
            destination: { address: "Mwenge Kinyago" },
            rideType: "boda",
            distanceKm: 6.2,
            fare: 4500,
            paymentMethod: "cash",
            status: "COMPLETED",
            createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
          }
        ];
        this.data.payments = [];
        this.save();
        console.log(`📁 [DATABASE] Faili jipya la hifadhidata limetengenezwa: bolt_database.json`);
      }
    } catch (err) {
      console.error("Hitilafu wakati wa kuanzisha database:", err);
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error("Hitilafu ya kuhifadhi data:", err);
    }
  }

  // --- SAFARI (RIDES) ---
  getAllRides() {
    return [...this.data.rides].reverse();
  }

  addRide(ride) {
    this.data.rides.push(ride);
    this.save();
    console.log(`💾 [DATABASE] Safari ${ride.rideId} imehifadhiwa kwenye bolt_database.json!`);
    return ride;
  }

  // --- MALIPO (PAYMENTS) ---
  addPayment(payment) {
    if (!this.data.payments) this.data.payments = [];
    this.data.payments.push(payment);
    this.save();
    console.log(`💰 [DATABASE] Malipo ya ${payment.transactionId} ya TZS ${payment.amount} yamehifadhiwa!`);
    return payment;
  }

  getAllPayments() {
    return this.data.payments ? [...this.data.payments].reverse() : [];
  }

  // --- WATUMIAJI (USERS: PASSENGERS & DRIVERS) ---
  findUserByPhone(phone) {
    return this.data.users.find(u => u.phone === phone);
  }

  addUser(user) {
    const newUser = {
      id: "USR_" + Date.now(),
      createdAt: new Date().toISOString(),
      ...user
    };
    this.data.users.push(newUser);
    this.save();
    console.log(`👤 [DATABASE] Mtumiaji mpya (${newUser.name}) amehifadhiwa!`);
    return newUser;
  }
}

const db = new LocalDatabase();
module.exports = db;
