// Eddie Ride - Real SMS Notification Engine
// Inasaidia Beem Africa SMS Gateway (Tanzania) pamoja na Smart Fallback
require('dotenv').config();

const SUPPORT_PHONE = "0626198847";
const BRAND_NAME = "Eddie Ride";

// Beem Africa Credentials kutoka kwenye .env au Mazingira ya Seva (Render)
const BEEM_API_KEY = process.env.BEEM_API_KEY || "";
const BEEM_SECRET_KEY = process.env.BEEM_SECRET_KEY || "";
const BEEM_SENDER_ID = process.env.BEEM_SENDER_ID || "INFO";

let smsLogs = [];

/**
 * Rekebisha namba ya simu kuwa katika mfumo wa Kimataifa wa Tanzania (255XXXXXXXXX)
 */
function formatTanzaniaPhone(phone) {
  if (!phone) return "255626198847";
  let clean = phone.toString().replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '255' + clean.substring(1);
  } else if (clean.startsWith('255')) {
    clean = clean;
  } else if (clean.length === 9) {
    clean = '255' + clean;
  }
  return clean;
}

/**
 * Tuma SMS Halisi kupitia Beem Africa API (https://apisms.beem.africa/v1/send)
 */
async function sendSMS(toPhone, message) {
  const destAddr = formatTanzaniaPhone(toPhone);
  const smsId = "SMS_" + Date.now();

  let deliveryStatus = "SIMULATED";
  let gatewayResponse = null;

  // Ikiwa API Keys za Beem Africa zimewekwa
  if (BEEM_API_KEY && BEEM_SECRET_KEY && BEEM_API_KEY.trim().length > 5) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${BEEM_API_KEY.trim()}:${BEEM_SECRET_KEY.trim()}`).toString('base64');
      
      const payload = {
        source_addr: BEEM_SENDER_ID,
        schedule_time: "",
        encoding: 0,
        message: message,
        recipients: [
          {
            recipient_id: 1,
            dest_addr: destAddr
          }
        ]
      };

      console.log(`📡 [BEEM AFRICA] Inatuma SMS halisi kwenda +${destAddr}...`);

      const response = await fetch('https://apisms.beem.africa/v1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      });

      gatewayResponse = await response.json();
      console.log(`📥 [BEEM AFRICA RESPONSE]:`, gatewayResponse);

      if (gatewayResponse && (gatewayResponse.code === 100 || gatewayResponse.successful)) {
        deliveryStatus = "DELIVERED (BEEM SMS)";
      } else {
        deliveryStatus = `BEEM: ${gatewayResponse.message || 'Angalia Salio'}`;
      }
    } catch (apiError) {
      console.error(`❌ [BEEM AFRICA ERROR]:`, apiError.message);
      deliveryStatus = "HITILAFU YA MTANDAO";
    }
  } else {
    // Ikiwa mtumiaji hajaweka API keys bado, inafanya kazi katika mfumo wa majaribio salama
    deliveryStatus = "DELIVERED (Majaribio)";
    console.log(`===============================================`);
    console.log(`📩 [SMS IMETUMWA]: +${destAddr}`);
    console.log(`📝 Ujumbe: "${message}"`);
    console.log(`💡 Kidokezo: Weka BEEM_API_KEY na BEEM_SECRET_KEY ili iende kwenye simu halisi.`);
    console.log(`===============================================`);
  }

  const smsRecord = {
    id: smsId,
    to: destAddr,
    message: message,
    status: deliveryStatus,
    timestamp: new Date().toISOString(),
    provider: BEEM_API_KEY ? "Beem Africa" : "Mfumo wa Ndani (Demo)"
  };

  smsLogs.unshift(smsRecord);
  if (smsLogs.length > 50) smsLogs.pop(); // Hifadhi SMS 50 za mwisho

  return { success: true, smsRecord, gatewayResponse };
}

/**
 * Angalia Salio la Beem Africa (Beem SMS Balance)
 */
async function getBeemBalance() {
  if (!BEEM_API_KEY || !BEEM_SECRET_KEY) {
    return {
      configured: false,
      message: "Beem Africa haijaunganishwa bado. Weka API Keys zako kwenye .env au Render."
    };
  }

  try {
    const authHeader = 'Basic ' + Buffer.from(`${BEEM_API_KEY.trim()}:${BEEM_SECRET_KEY.trim()}`).toString('base64');
    const response = await fetch('https://apisms.beem.africa/public/v1/vendors/balance', {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    return {
      configured: true,
      success: true,
      balance: data.data?.credit_bal || "0",
      currency: "TZS / SMS Credits"
    };
  } catch (err) {
    return {
      configured: true,
      success: false,
      error: err.message
    };
  }
}

// 1. SMS kwa Dereva anapopata safari mpya
async function notifyDriverNewRide(driverPhone, pickup, destination, fare) {
  const msg = `HABARI DEREVA: Una safari mpya ya [${BRAND_NAME}] kutoka ${pickup} kwenda ${destination}. Nauli: TZS ${Number(fare).toLocaleString()}. Fungua app kukubali. Msaada: ${SUPPORT_PHONE}`;
  return await sendSMS(driverPhone, msg);
}

// 2. SMS kwa Abiria dereva anapokubali
async function notifyPassengerRideAccepted(passengerPhone, driverName, vehicle, plate, fare) {
  const msg = `HABARI: Dereva wako wa [${BRAND_NAME}], ${driverName} (${vehicle} - ${plate}) anakufuata sasa. Nauli: TZS ${Number(fare).toLocaleString()}. Msaada: ${SUPPORT_PHONE}. Asante!`;
  return await sendSMS(passengerPhone, msg);
}

// 3. SMS ya Risiti ya Malipo kwa Abiria
async function notifyPaymentReceipt(passengerPhone, amount, paymentMethod, txId) {
  const msg = `[${BRAND_NAME} RISITI]: Malipo ya TZS ${Number(amount).toLocaleString()} kupitia ${paymentMethod.toUpperCase()} yamethibitishwa. Kumbukumbu: ${txId}. Huduma: ${SUPPORT_PHONE}.`;
  return await sendSMS(passengerPhone, msg);
}

function getSMSLogs() {
  return smsLogs;
}

module.exports = {
  sendSMS,
  notifyDriverNewRide,
  notifyPassengerRideAccepted,
  notifyPaymentReceipt,
  getSMSLogs,
  getBeemBalance,
  SUPPORT_PHONE,
  BRAND_NAME
};
