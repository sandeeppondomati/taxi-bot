const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

const TAXI_GROUP_NAME = 'Taxi'; // CHANGE if your group name is different
const DRIVER_MO = '85254776211@c.us';
const DRIVER_IVAN = '85269900500@c.us';
const TIMEZONE = 'Asia/Hong_Kong';

let taxiGroupId = null;
let lastPollId = null;
let pollVotes = {};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
    }
});

client.on('qr', qr => qrcode.generate(qr, {small: true}));
client.on('ready', async () => {
    console.log('✅ Bot Ready for Taxi Group');
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === TAXI_GROUP_NAME);
    if(group){ taxiGroupId = group.id._serialized; console.log('Group found:', TAXI_GROUP_NAME); }
});

async function sendPoll(isAfternoon=false){
    if(!taxiGroupId) return;
    const now = new Date().toLocaleDateString('en-GB', {timeZone: TIMEZONE});
    const title = isAfternoon? `Afternoon Taxi ${now} - Need ride?` : `Morning Taxi ${now} - Need ride?`;
    const poll = new Poll(title, ['Yes','No'], { allowMultipleAnswers: false });
    const sent = await client.sendMessage(taxiGroupId, poll);
    lastPollId = sent.id._serialized;
    pollVotes = {};
}

async function countAndBook(){
    if(!taxiGroupId ||!lastPollId) return;
    let yesVoters = [];
    try {
        const msg = await client.getMessageById(lastPollId);
        const pollData = msg.pollVotes;
        if(pollData){
           pollData.forEach(v => {
               if(v.selectedOptions[0]?.name === 'Yes') yesVoters.push(v);
           });
        }
    } catch(e){}

    // Fallback: use tracked votes
    if(yesVoters.length === 0) yesVoters = Object.values(pollVotes).filter(v=>v==='Yes');
    const count = yesVoters.length;

    if(count > 2){
        const bookingText = `Hi Booking: ${count} pax today at LKF, Time: 9PM, Loc: LKF Tower. Please confirm.`;
        await client.sendMessage(DRIVER_MO, bookingText);
        await client.sendMessage(DRIVER_IVAN, bookingText);
        await client.sendMessage(taxiGroupId, `✅ Booked! ${count} seats confirmed. Sent to Mo & Ivan.`);
    } else {
        await client.sendMessage(taxiGroupId, `❌ Only ${count} voted YES. Need >2 to book, so no taxi booked today.`);
    }
}

// 3PM and 8PM HKT polls
cron.schedule('0 15 * * *', () => sendPoll(false), { timezone: TIMEZONE });
cron.schedule('0 20 * * *', () => sendPoll(true), { timezone: TIMEZONE });
// Count at 9PM and 10PM and book if >2
cron.schedule('0 21 * * *', () => countAndBook(), { timezone: TIMEZONE });
cron.schedule('0 22 * * *', () => countAndBook(), { timezone: TIMEZONE });

client.on('vote_update', vote => {
    if(vote.parentMessageId === lastPollId){
        pollVotes[vote.voter] = vote.selectedOptions[0]?.name;
    }
});

client.on('message', async msg => {
    if(msg.from === DRIVER_MO || msg.from === DRIVER_IVAN){
        if(taxiGroupId){
            const driverName = msg.from === DRIVER_MO? 'Mo' : 'Ivan';
            await client.sendMessage(taxiGroupId, `🚕 ${driverName}: ${msg.body}`);
        }
    }
    if(msg.body.toLowerCase() === '!testpoll'){ await sendPoll(); }
    if(msg.body.toLowerCase() === '!count'){ await countAndBook(); }
});

client.initialize();
