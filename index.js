const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const TAXI_GROUP_NAME = 'Taxi';
const DRIVER_MO = '85254776211@c.us';
const DRIVER_IVAN = '85269900500@c.us';
const TIMEZONE = 'Asia/Hong_Kong';

let taxiGroupId = null;
let lastPollId = null;
let pollVotes = {};

async function start(){
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: await chromium.executablePath(),
        args: chromium.args,
        headless: chromium.headless
    }
});

client.on('qr', qr => { 
    console.log('SCAN THIS LINK - OPEN IN BROWSER:');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
    qrcode.generate(qr, {small: true});
});
client.on('ready', async () => {
    console.log('✅ Bot Ready');
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === TAXI_GROUP_NAME);
    if(group) taxiGroupId = group.id._serialized;
});
async function sendPoll(){
    if(!taxiGroupId) return;
    const date = new Date().toLocaleDateString('en-GB', {timeZone: TIMEZONE});
    const poll = new Poll(`Taxi ${date} 9PM LKF?`, ['Yes','No'], { allowMultipleAnswers: false });
    const sent = await client.sendMessage(taxiGroupId, poll);
    lastPollId = sent.id._serialized; pollVotes = {};
}
async function countAndBook(){
    const yesCount = Object.values(pollVotes).filter(v=>v==='Yes').length;
    if(yesCount > 2){
        const text = `Hi Booking: ${yesCount} pax today 9PM LKF Tower. Confirm pls.`;
        await client.sendMessage(DRIVER_MO, text);
        await client.sendMessage(DRIVER_IVAN, text);
        await client.sendMessage(taxiGroupId, `✅ ${yesCount} pax >2, BOOKED`);
    } else {
        if(taxiGroupId) await client.sendMessage(taxiGroupId, `❌ Only ${yesCount} YES. Need >2, no taxi.`);
    }
}
cron.schedule('0 15 * * *', sendPoll, { timezone: TIMEZONE });
cron.schedule('0 20 * * *', sendPoll, { timezone: TIMEZONE });
cron.schedule('0 21 * * *', countAndBook, { timezone: TIMEZONE });
cron.schedule('0 22 * * *', countAndBook, { timezone: TIMEZONE });

client.on('vote_update', vote => {
    const id = vote.parentMessageId || vote.parentMsgId;
    if(id == lastPollId){
        pollVotes[vote.voter || vote.sender] = vote.selectedOptions[0]?.name;
    }
});
client.on('message', async msg => {
    if(msg.from === DRIVER_MO || msg.from === DRIVER_IVAN){
        const name = msg.from === DRIVER_MO? 'Mo' : 'Ivan';
        if(taxiGroupId) await client.sendMessage(taxiGroupId, `🚕 ${name}: ${msg.body}`);
    }
    if(msg.body === '!testpoll') await sendPoll();
    if(msg.body === '!count') await countAndBook();
});
client.initialize();
}
start();
