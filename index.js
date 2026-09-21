const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
app.use(express.urlencoded({extended:true}))

let cfg = { time: '9:00', ampm: 'AM', autoBook: true, taxiNumbers: ['85261234567','85269876543'] }
try{ if(fs.existsSync('/data/config.json')) cfg = JSON.parse(fs.readFileSync('/data/config.json')) }catch{}

function saveCfg(){ try{fs.mkdirSync('/data',{recursive:true}); fs.writeFileSync('/data/config.json', JSON.stringify(cfg))}catch{} }

// ---- WEB PANEL ----
app.get('/', (req,res)=> res.send(`
<html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;padding:20px;max-width:400px;margin:auto}input,select,button{width:100%;padding:12px;margin:8px 0;border-radius:10px;border:1px solid #ccc}button{background:#25D366;color:#fff;font-weight:bold;border:none}label{display:flex;gap:10px;align-items:center}</style>
<body><h2>🚕 Taxi Panel</h2>
<form method="POST" action="/update">
<input name="time" value="${cfg.time}" placeholder="Time e.g. 9:30" required>
<select name="ampm"><option ${cfg.ampm=='AM'?'selected':''}>AM</option><option ${cfg.ampm=='PM'?'selected':''}>PM</option></select>
<label><input type="checkbox" name="autoBook" ${cfg.autoBook?'checked':''}> Auto-book (read last 30min)</label>
<button>Save</button>
</form>
<p>Current: <b>${cfg.time} ${cfg.ampm}</b> | Auto: <b>${cfg.autoBook?'ON':'OFF'}</b></p>
<p><b>Taxi Nos:</b><br>${cfg.taxiNumbers.join('<br>')}<br><br><i>Bot will message taxi number directly in chat like: @${cfg.taxiNumbers[0]} Book at ${cfg.time} ${cfg.ampm}</i></p>
</body></html>`))

app.post('/update',(req,res)=>{
  cfg.time=req.body.time; cfg.ampm=req.body.ampm; cfg.autoBook=!!req.body.autoBook; saveCfg();
  res.redirect('/');
})

// ---- WHATSAPP BOT ----
async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('/data/session')
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]; if(!m.message || m.key.fromMe) return;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
    const senderTime = (m.messageTimestamp*1000)
    const thirtyAgo = Date.now() - 30*60*1000

    // Only consider latest 30 mins
    if(senderTime < thirtyAgo) return;

    if(!cfg.autoBook){
      await sock.sendMessage(m.key.remoteJid,{text:`⏸️ Auto-book OFF. New msg received but not booking. Current time: ${cfg.time} ${cfg.ampm}. Turn ON from panel to auto-book.`})
      return
    }

    // Auto-book logic - book at updated time
    const taxiJid = cfg.taxiNumbers[0]+'@s.whatsapp.net'
    await sock.sendMessage(taxiJid,{text:`🚕 Taxi booking: Please book at ${cfg.time} ${cfg.ampm}. Customer: ${m.key.remoteJid}`})
    await sock.sendMessage(m.key.remoteJid,{text:`✅ Auto-booked taxi at ${cfg.time} ${cfg.ampm}. Messaged taxi number: ${cfg.taxiNumbers[0]} specifically in chat.`})
  })
  app.listen(3000,()=>console.log('Panel live'))
}
start()
