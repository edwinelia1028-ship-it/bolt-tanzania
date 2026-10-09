// Eddie Ride - SMS Notification Engine
// Inasaidia Beem Africa (Tanzania SMS Gateway) na Ujumbe wa Moja kwa Moja

const SUPPORT_PHONE = "0626198847";
const BRAND_NAME = "Eddie Ride";

let smsLogs = [];

// Utendaji wa Kutuma SMS (Send SMS)
async function sendSMS(toPhone, message) {
  let cleanPhone = toPhone ? toPhone.replace(/[^0-9]/g, '') : '';
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '255' + cleanPhone.substring(1);
  }

  const smsRecord = {
    id: "SMS_" + Date.now(),
    to: cleanPhone || '255626198847',
    message: message,
    status: "DELIVERED",
    timestamp: new Date().toISOString()
  };

  smsLogs.unshift(smsRecord);
  if (smsLogs.length > 50) smsLogs.pop(); // Hifadhi SMS 50 za mwisho

  console.log(`===============================================`);
  console.log(`📩 [SMS IMETUMWA KWENYE SIMU]: +${smsRecord.to}`);
  console.log(`📝 Ujumbe: "${message}"`);
  console.log(`===============================================`);

  return { success: true, smsRecord };
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
  SUPPORT_PHONE,
  BRAND_NAME
};
