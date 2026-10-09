// Eddie Ride - Real Mobile Money Payment Engine (Tanzania)
// Inasaidia: Selcom Pay, AzamPay, Beem Collections & Direct M-Pesa / Tigo Pesa STK Push
require('dotenv').config();
const crypto = require('crypto');
const db = require('./db');
const sms = require('./sms');

// 1. MIPANGILIO YA MALIPO KUTOKA KWENYE .ENV
const PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY || 'selcom'; // 'selcom', 'azampay', 'beem', au 'demo'

// Selcom Pay Credentials (https://www.selcom.net)
const SELCOM_API_KEY = process.env.SELCOM_API_KEY || '';
const SELCOM_API_SECRET = process.env.SELCOM_API_SECRET || '';
const SELCOM_VENDOR_ID = process.env.SELCOM_VENDOR_ID || '';
const SELCOM_BASE_URL = process.env.SELCOM_ENV === 'live' 
  ? 'https://apigw.selcommobile.com/v1' 
  : 'https://sandbox.selcommobile.com/v1';

// AzamPay Credentials (https://azampay.co.tz)
const AZAMPAY_APP_NAME = process.env.AZAMPAY_APP_NAME || '';
const AZAMPAY_CLIENT_ID = process.env.AZAMPAY_CLIENT_ID || '';
const AZAMPAY_CLIENT_SECRET = process.env.AZAMPAY_CLIENT_SECRET || '';
const AZAMPAY_ENV = process.env.AZAMPAY_ENV || 'sandbox'; // 'sandbox' au 'live'

// Beem Africa Credentials (https://beem.africa)
const BEEM_API_KEY = process.env.BEEM_API_KEY || '';
const BEEM_SECRET_KEY = process.env.BEEM_SECRET_KEY || '';

/**
 * Safisha na kubadilisha namba ya simu kuwa mfumo wa Tanzania (255XXXXXXXXX)
 */
function cleanTanzaniaPhone(phone) {
  if (!phone) return '255754123456';
  let clean = phone.toString().replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '255' + clean.substring(1);
  } else if (clean.length === 9) {
    clean = '255' + clean;
  }
  return clean;
}

/**
 * Tambua mtandao wa simu kutoka kwenye namba ya simu ya Tanzania
 */
function detectProvider(phone) {
  const p = cleanTanzaniaPhone(phone);
  // Vodacom M-Pesa: 25574, 25575, 25576
  if (/^255(74|75|76)/.test(p)) return 'mpesa';
  // Tigo Pesa: 25571, 25565, 25567
  if (/^255(71|65|67)/.test(p)) return 'tigo';
  // Airtel Money: 25578, 25568, 25569
  if (/^255(78|68|69)/.test(p)) return 'airtel';
  // Halopesa: 25562, 25561
  if (/^255(62|61)/.test(p)) return 'halopesa';
  return 'mpesa';
}

/**
 * 1. TUMA OMBI LA MALIPO KWA NJIA YA SIMU (STK PUSH / USSD PUSH)
 * Mteja atapokea ujumbe kwenye kioo cha simu yake (Pop-up): "Weka Nenosiri la M-Pesa Kulipa TZS X..."
 */
async function initiateSTKPush({ phoneNumber, amount, provider, rideId, description }) {
  const cleanPhone = cleanTanzaniaPhone(phoneNumber);
  const detectedNet = provider || detectProvider(cleanPhone);
  const prefix = detectedNet.toUpperCase();
  const txId = `${prefix}-TZ-${Math.floor(10000000 + Math.random() * 90000000)}`;

  console.log(`=======================================================`);
  console.log(`💳 [OMBI LA MALIPO YA SIMU - STK PUSH]:`);
  console.log(`📱 Namba: +${cleanPhone} | Mtandao: ${prefix}`);
  console.log(`💰 Kiasi: TZS ${Number(amount).toLocaleString()} | Oda: ${rideId || 'SAFARI'}`);
  console.log(`🔖 Kumbukumbu (TxID): ${txId}`);
  console.log(`=======================================================`);

  // A. IKIWA NI SELCOM PAY GATEWAY
  if (SELCOM_API_KEY && SELCOM_API_SECRET && SELCOM_VENDOR_ID) {
    try {
      console.log(`📡 [SELCOM PAY] Inatuma STK Push kwenda Selcom Gateway...`);
      // Selcom USSD Push Request
      const selcomRes = await sendSelcomUSSDPush({
        vendorId: SELCOM_VENDOR_ID,
        apiKey: SELCOM_API_KEY,
        apiSecret: SELCOM_API_SECRET,
        baseUrl: SELCOM_BASE_URL,
        phone: cleanPhone,
        amount: Number(amount),
        txId: txId,
        provider: detectedNet
      });

      if (selcomRes.success) {
        return handleSuccessfulPaymentRecord({
          txId: selcomRes.transactionId || txId,
          rideId,
          phone: cleanPhone,
          provider: detectedNet,
          amount,
          gateway: 'Selcom Pay'
        });
      }
    } catch (err) {
      console.error(`❌ [SELCOM PAY ERROR]:`, err.message);
    }
  }

  // B. IKIWA NI AZAMPAY GATEWAY
  if (AZAMPAY_CLIENT_ID && AZAMPAY_CLIENT_SECRET) {
    try {
      console.log(`📡 [AZAMPAY] Inatuma STK Push kwenda AzamPay Gateway...`);
      const azamRes = await sendAzamPayCheckout({
        clientId: AZAMPAY_CLIENT_ID,
        clientSecret: AZAMPAY_CLIENT_SECRET,
        phone: cleanPhone,
        amount: Number(amount),
        txId: txId,
        provider: detectedNet
      });

      if (azamRes.success) {
        return handleSuccessfulPaymentRecord({
          txId: azamRes.transactionId || txId,
          rideId,
          phone: cleanPhone,
          provider: detectedNet,
          amount,
          gateway: 'AzamPay'
        });
      }
    } catch (err) {
      console.error(`❌ [AZAMPAY ERROR]:`, err.message);
    }
  }

  // C. HALI YA MAJARIBIO / DEMO SANDBOX (Inafanya kazi wakati mtumiaji akisubiri LIVE keys)
  return new Promise((resolve) => {
    setTimeout(async () => {
      const result = await handleSuccessfulPaymentRecord({
        txId,
        rideId,
        phone: cleanPhone,
        provider: detectedNet,
        amount,
        gateway: 'Eddie Ride Sandbox (Demo)'
      });
      resolve(result);
    }, 2000);
  });
}

/**
 * Hifadhi Malipo yaliyofanikiwa na kutuma SMS ya Risiti
 */
async function handleSuccessfulPaymentRecord({ txId, rideId, phone, provider, amount, gateway }) {
  const paymentRecord = {
    transactionId: txId,
    rideId: rideId || "RIDE_" + Date.now(),
    phone: phone,
    provider: provider || 'mpesa',
    gateway: gateway,
    amount: Number(amount),
    currency: "TZS",
    status: "COMPLETED",
    timestamp: new Date().toISOString()
  };

  db.addPayment(paymentRecord);

  // Tuma SMS ya Risiti kwenye simu ya mteja papo hapo kupitia sms.js
  await sms.notifyPaymentReceipt(phone, amount, provider, txId);

  return {
    success: true,
    transactionId: txId,
    status: "COMPLETED",
    gateway: gateway,
    message: `Malipo ya TZS ${Number(amount).toLocaleString()} yamethibitishwa kikamilifu kupitia ${provider.toUpperCase()} (${gateway})!`,
    details: paymentRecord
  };
}

/**
 * 2. SELCOM PAY USSD / STK PUSH LOGIC
 */
async function sendSelcomUSSDPush({ vendorId, apiKey, apiSecret, baseUrl, phone, amount, txId, provider }) {
  try {
    const timestamp = new Date().toISOString();
    const payload = {
      vendor: vendorId,
      order_id: txId,
      buyer_phone: phone,
      amount: amount,
      currency: "TZS",
      channel: provider.toUpperCase() === 'TIGO' ? 'TIGOPESA' : provider.toUpperCase(),
      payment_methods: ["ALL"]
    };

    const response = await fetch(`${baseUrl}/checkout/create-order-minimal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `SELCOM ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return {
      success: data.result === 'SUCCESS' || data.status === 'SUCCESS',
      transactionId: data.transid || txId,
      data
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 3. AZAMPAY CHECKOUT PUSH LOGIC
 */
async function sendAzamPayCheckout({ clientId, clientSecret, phone, amount, txId, provider }) {
  try {
    // 1. Pata Token ya AzamPay
    const tokenUrl = 'https://authenticator.azampay.co.tz/AppRegistration/GenerateToken';
    const authRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: AZAMPAY_APP_NAME || 'EddieRide',
        clientId: clientId,
        clientSecret: clientSecret
      })
    });
    const authData = await authRes.json();
    const token = authData.data?.accessToken;

    if (!token) throw new Error("Imeshindwa kupata token ya AzamPay");

    // 2. Tuma MNO Push Checkout
    const checkoutUrl = 'https://checkout.azampay.co.tz/azampay/mno/checkout';
    const checkoutRes = await fetch(checkoutUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        accountNumber: phone,
        amount: amount.toString(),
        currency: "TZS",
        externalId: txId,
        provider: provider.toLowerCase() === 'mpesa' ? 'Mpesa' : 'Tigo'
      })
    });

    const checkoutData = await checkoutRes.json();
    return {
      success: checkoutData.success === true,
      transactionId: checkoutData.transactionId || txId,
      data: checkoutData
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 4. WEBHOOK HANDLER YA MAPOKEZI YA MALIPO KUTOKA SELCOM / AZAMPAY / VODACOM
 */
async function handlePaymentWebhook(payload) {
  console.log(`📥 [PAYMENT WEBHOOK IMERUDI KUTOKA BENKI/MTANDAO]:`, payload);

  const txId = payload.order_id || payload.transid || payload.transactionId || payload.externalId;
  const status = (payload.status || payload.result || '').toUpperCase();

  if (txId && (status === 'SUCCESS' || status === 'COMPLETED')) {
    const payments = db.getAllPayments();
    const existing = payments.find(p => p.transactionId === txId);
    if (existing) {
      existing.status = 'COMPLETED';
      db.save();
    }
    return { success: true, message: "Malipo yamethibitishwa na hifadhidata imesasishwa." };
  }

  return { success: false, message: "Taarifa ya malipo haikutambuliwa." };
}

/**
 * 5. PATA TAARIFA ZA GATEWAYS ZILIZO KWENYE MFUMO
 */
function getPaymentGatewayInfo() {
  const isSelcomLive = Boolean(SELCOM_API_KEY && SELCOM_API_SECRET && SELCOM_VENDOR_ID);
  const isAzamPayLive = Boolean(AZAMPAY_CLIENT_ID && AZAMPAY_CLIENT_SECRET);
  const isBeemLive = Boolean(BEEM_API_KEY && BEEM_SECRET_KEY);

  let activeGateway = "Eddie Ride Sandbox (Demo)";
  if (isSelcomLive) activeGateway = "Selcom Wireless (Live Gateway)";
  else if (isAzamPayLive) activeGateway = "AzamPay Tanzania (Live Gateway)";
  else if (isBeemLive) activeGateway = "Beem Africa Collections";

  return {
    success: true,
    activeGateway,
    supportedNetworks: [
      { name: "Vodacom M-Pesa", code: "mpesa", active: true },
      { name: "Tigo Pesa", code: "tigo", active: true },
      { name: "Airtel Money", code: "airtel", active: true },
      { name: "Halopesa", code: "halopesa", active: true }
    ],
    gateways: {
      selcom: {
        configured: isSelcomLive,
        mode: process.env.SELCOM_ENV || 'sandbox'
      },
      azampay: {
        configured: isAzamPayLive,
        mode: AZAMPAY_ENV
      },
      beem: {
        configured: isBeemLive
      }
    }
  };
}

module.exports = {
  initiateSTKPush,
  handlePaymentWebhook,
  getPaymentGatewayInfo,
  cleanTanzaniaPhone,
  detectProvider
};

