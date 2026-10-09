require('dotenv').config();
const { getBeemBalance, sendSMS } = require('./sms');

async function test() {
  console.log("==========================================");
  console.log("🔍 Jaribio la Beem Africa SMS Gateway (Eddie Ride)");
  console.log("==========================================");
  console.log("API Key iliyopo:", process.env.BEEM_API_KEY ? (process.env.BEEM_API_KEY.substring(0, 4) + '****') : '(Haijawekwa bado)');
  console.log("Secret Key iliyopo:", process.env.BEEM_SECRET_KEY ? '******' : '(Haijawekwa bado)');
  console.log("Sender ID:", process.env.BEEM_SENDER_ID || 'INFO');

  const res = await getBeemBalance();
  console.log("\n📊 Matokeo ya Salio la Beem:");
  console.log(JSON.stringify(res, null, 2));

  if (process.argv[2] === '--send') {
    const target = process.argv[3] || '0626198847';
    console.log(`\n📲 Inatuma SMS ya majaribio kwenda +255 ${target}...`);
    const sendRes = await sendSMS(target, "Habari! Hili ni jaribio la uthibitisho wa SMS za mfumo wa Eddie Ride kupitia Beem Africa. Mfumo uko tayari!");
    console.log("\nMatokeo ya SMS:");
    console.log(JSON.stringify(sendRes, null, 2));
  } else {
    console.log("\n💡 Ili kutuma SMS ya jaribio kwenye simu yako, endesha: node test-beem.js --send 0626198847");
  }
}

test();
