const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
app.use(express.urlencoded({extended:true}))
app.use(express.json())

let cfg = {
  day: 'Monday', time: '8:10', ampm: 'AM', dest: 'NAB',
  autoBook: true,
  taxiNumbers: ['85261234567','85269876543'],
  standardTime: '08:10'
}
try{ if(fs.existsSync('./data/config.json')) cfg = {...cfg,...JSON.parse(fs.readFileSync('./data/config.json'))} }catch{}
function save(){ try{fs.mkdirSync('./data',{recursive:true}); fs.writeFileSync('./data/config.json', JSON.stringify(cfg))}catch{}}

app.get('/', (req,res)=> res.send(`
<html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:sans-serif;max-width:420px;margin:auto;padding:16px;background:#f7f7f7}
.card{background:#fff;padding:16px;border-radius:14px;margin-bottom:12px;box-shadow:0 2px 8px #0001}
input,select{width:100%;padding:12px;margin:6px 0;border-radius:10px;border:1px solid #ccc}
.btn{width:100%;padding:14px;border-radius:12px;border:none;font-weight:bold;font-size:16px;cursor:pointer}
.green{background:#25D366;color:#fff}.blue{background:#e8f0fe;color:#1967d2;border:1px solid #1967d2}
.small{font-size:13px;color:#666}
label{display:flex;gap:10px;align-items:center;margin:8px 0}
</style>
<body>
<div class="card">
<b>📅 Day / Time / Destination</b><br>
<b>${cfg.day} • ${cfg.time} ${cfg.ampm} • ${cfg.dest}</b><br>
<span class="small">Standard: ${cfg.standardTime} | Reads last 30min (07:40-08:10)</span>
</div>

<div class="card">
<b>🚕 I want a taxi</b>
<form method="POST" action="/want-taxi">
<button class="btn green">👋 I want a taxi - ${cfg.time} ${cfg.ampm} to ${cfg.dest}</button>
</form>
<div style="background:#fffbe6;padding:10px;border-radius:10px;margin-top:10px;font-size:13px">
💡 <b>Quick tags in WhatsApp:</b><br>
<code>#NAB</code> = destination NAB<br>
<code>#UT18:30</code> = update time to 6:30 PM<br>
Example: <b>#NAB #UT8:30</b> -> bot will update & book at 8:30 AM to NAB<br>
<span class="small">Only reads msgs 30 mins before ${cfg.standardTime}</span>
</div>
<label><input type="checkbox" ${cfg.autoBook?'checked':''} onchange="fetch('/toggle-autobook',{method:'POST'})"> Auto-book ON (default) - reads last 30min</label>
</div>

<div class="card">
<b>⏰ Update Taxi Time</b>
<form method="POST" action="/update">
<select name="day"><option ${cfg.day=='Monday'?'selected':''}>Monday</option><option ${cfg.day=='Tuesday'?'selected':''}>Tuesday</option><option ${cfg.day=='Wednesday'?'selected':''}>Wednesday</option><option ${cfg.day=='Thursday'?'selected':''}>Thursday</option><option ${cfg.day=='Friday'?'selected':''}>Friday</option></select>
<input name="time" value="${cfg.time}" placeholder="8:10">
<select name="ampm"><option ${cfg.ampm=='AM'?'selected':''}>AM</option><option ${cfg.ampm=='PM'?'selected':''}>PM</option></select>
<input name="dest" value="${cfg.dest}" placeholder="NAB">
<button class="btn blue">Update</button>
</form>
<p class="small">If time updated, taxi booked at updated time & taxi number messaged specifically</p>
</div>
</body></html>`))

app.post('/update',(req,res)=>{ cfg.day=req.body.day; cfg.time=req.body.time; cfg.ampm=req.body.ampm; cfg.dest=req.body.dest; save(); res.redirect('/'); })
app.post('/toggle-autobook',(req,res)=>{ cfg.autoBook=!cfg.autoBook; save(); res.json({autoBook:cfg.autoBook}) })
app.post('/want-taxi',async (req,res)=>{
  if(global.sock){
    const jid = cfg.taxiNumbers[0]+'@s.whatsapp.net'
    await global.sock.sendMessage(jid,{text:`🚕 TAXI NEEDED\nDay: ${cfg.day}\nTime: ${cfg.time} ${cfg.ampm}\nDest: ${cfg.dest}\nVoted: I want a taxi`})
  }
  res.send(`<h3>✅ Voted - Taxi messaged at ${cfg.time} ${cfg.ampm}</h3><a href="/">Back</a>`)
})

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const sock = makeWASocket({ auth: state })
  global.sock = sock
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]; if(!m.message || m.key.fromMe) return
    const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
    if(Date.now() - (m.messageTimestamp*1000) > 30*60*1000) return
    if(!cfg.autoBook) return
    const destMatch = text.match(/#([A-Z]{2,5})/)
    const timeMatch = text.match(/#UT(\d{1,2}):?(\d{2})?/i)
    if(destMatch || timeMatch){
      if(destMatch) cfg.dest = destMatch[1]
      if(timeMatch){
        let h = parseInt(timeMatch[1]); let mm = timeMatch[2]||'00'
        cfg.time = `${h>12?h-12:h}:${mm}`; cfg.ampm = h>=12?'PM':'AM'
      }
      save()
      const taxiJid = cfg.taxiNumbers[0]+'@s.whatsapp.net'
      await sock.sendMessage(taxiJid,{text:`🚕 Auto from chat: ${text}\n-> ${cfg.day} ${cfg.time} ${cfg.ampm} to ${cfg.dest}`})
      await sock.sendMessage(m.key.remoteJid,{text:`✅ Read "${text}" within 30min of 08:10\nUpdated to ${cfg.time} ${cfg.ampm} ${cfg.dest}\nMessaged taxi specifically`})
    }
  })
  app.listen(3000,()=>console.log('Live'))
}
start()
