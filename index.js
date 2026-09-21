const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const http = require('http');

// Keep Render alive
http.createServer((req,res)=>res.end('Taxi Bot Running')).listen(process.env.PORT||3000);

const GROUP_NAME = 'Taxi Sharing for Kwun Tong';
const FOUR_SEATER_NUMBER = '85254776211@c.us'; // Mo
const SIX_SEATER_NUMBER = '85269900500@c.us'; // Ivan

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox','--disable-setuid-sandbox'] }
});

client.on('qr', qr => {
  console.log('SCAN THIS QR:');
  qrcode.generate(qr, {small:true});
});

client.on('ready', () => {
  console.log('✅ Bot Ready for Taxi Group');
});

async function getGroup(){
  const chats = await client.getChats();
  return chats.find(c=>c.isGroup && c.name===GROUP_NAME);
}

async function sendPoll(question){
  const group = await getGroup();
  if(!group){ console.log('Group not found'); return
