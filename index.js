const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
app.use(express.urlencoded({extended:true}))
app.use(express.json())

let cfg = { 
  day: 'Monday', 
  time: '8:10', 
  ampm: 'AM', 
  dest: 'Office', 
  autoBook: true, 
  taxiNumbers: ['85261234567'], // put real number without +
  standardTime: '08:10' 
}
try{ if(fs.existsSync('./data/config.json')) cfg = {...cfg,...JSON.parse(fs.readFileSync('./data/config.json'))} }catch{}
function save(){ try{fs.mkdirSync('./data',{recursive:true}); fs.writeFileSync('./data/config.json', JSON.stringify(cfg))}catch(e){console.log(e)}}

app.get('/', (req,res)=> res.send(`
<html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:sans-serif;max-width:400px;margin:auto;padding:16px;background:#f7f7f7}
.card{background:#fff;padding:18px;border-radius:16px;margin-bottom:12px;box-shadow:0 2px 8px #0001}
.btn{width:100%;padding:16px;border-radius:12px;border:none;font-weight:bold;font-size:17px;cursor:pointer}
.green{background:#25D366;color:#fff}
.small{font-size:13px;color:#555}
</style>
<body>
<div class="card" style="text-align:center">
<b>📅 ${cfg.day} • ${cfg.time} ${cfg.ampm}</b><br>
<span class="small">Std: ${cfg.standardTime} | Auto: ${cfg.autoBook?'ON':'OFF (NAB)'} | Reads 07:40-08:10</span>
</div>

<div class="card">
<b>🚕 I want a taxi</b>
<form method="POST" action="/want-taxi" style="margin-top:12px">
<button class="btn green">👋 I want a taxi - ${cfg.time} ${cfg.ampm}</button>
</form>
<div style="background:#fffbe6;padding:12px;border-radius:10px;margin-top:12px;font-size:14px;line-height:1.6">
💡 <b>Simple tags:</b><br>
<code>#NAB</code> - No Auto Book<br>
<code>#UT</code> - Update Time, e.g. send <b>#UT19:30</b> to book taxi at 19:30<br>
<span class="small">Bot reads only msgs 30min before ${cfg.standardTime}</span>
</div>
<label style="display:flex;gap:8px;margin-top:12px"><input type="checkbox" ${cfg.autoBook?'checked':''} onchange="fetch('/toggle-autobook',{method:'POST'}).then(()=>location.reload())"> Auto-book ON</label>
</div>
</body></html>`))

app.post('/toggle-autobook',(req,res)=>{ cfg.autoBook=!cfg.autoBook; save(); res.json({ok:true}) })

app.post('/want-taxi',async (req,res)=>{
  try{
    if(global.sock){
      try{
        const num = cfg.taxiNumbers[0].replace(/[^0-9]/g,'')
        const jid = num+'@s.whatsapp.net'
        await global.sock.sendMessage(jid,{text:`🚕 TAXI NEEDED\nTime: ${cfg.time} ${cfg.ampm}\nDay: ${cfg.day}\nVoted from panel`})
      }catch(whatsappErr){ console.log('WA err', whatsappErr.message) }
    }
    res.send(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ Vote counted</h2><p>Taxi for ${cfg.time} ${cfg.ampm}</p><a href="/">Back</a></body></html>`)
  }catch(e){
    console.log(e)
    res.send(`<html><body><h3>✅ Vote saved</h3><p>Error: ${e.message}</p><a href="/">Back</a></body></html>`)
  }
})

app.get('/want-taxi',(req,res)=> res.redirect('/'))
app.post('/update',(req,res)=>{ cfg.day=req.body.day; cfg.time=req.body.time; cfg.ampm=req.body.ampm; cfg.dest=req.body.dest; save(); res.redirect('/') })

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const sock = makeWASocket({ auth: state })
  global.sock = sock
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('connection.update', (u)=>{ console.log('Conn', u) })

  sock.ev.on('messages.upsert', async ({messages})=>{
    try{
      const m = messages[0]; if(!m.message || m.key.fromMe) return
      const textRaw = m.message.conversation || m.message.extendedTextMessage?.text || ''
      const text = textRaw.toUpperCase()
      if(Date.now() - (m.messageTimestamp*1000) > 30*60*1000) return

      if(text.includes('#NAB')){
        cfg.autoBook=false; save()
        await sock.sendMessage(m.key.remoteJid,{text:`🚫 #NAB detected in group - No auto-book today`})
        return
      }
      if(!cfg.autoBook) return

      const tm = text.match(/#UT(\d{1,2}):?(\d{2})?/i)
      if(tm){
        let h=parseInt(tm[1]); let mm=tm[2]||'00'
        cfg.time=`${h>12?h-12:h}:${mm}`; cfg.ampm=h>=12?'PM':'AM'; save()
        const num = cfg.taxiNumbers[0].replace(/[^0-9]/g,'')
        await sock.sendMessage(num+'@s.whatsapp.net',{text:`🚕 Updated from group "${textRaw}"\nNew Time: ${cfg.time} ${cfg.ampm}`})
        await sock.sendMessage(m.key.remoteJid,{text:`✅ Updated - Taxi will be booked at ${cfg.time} ${cfg.ampm}`})
      }
    }catch(e){ console.log('msg err', e) }
  })

  app.listen(3000,()=>console.log('Live on 3000'))
}
start()
