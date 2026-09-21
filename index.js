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
  autoBook: true,
  taxiNumbers: ['85261234567'],
  standardTime: '08:10',
  votes: { count: 0, voters: [], date: new Date().toDateString() }
}

try {
  if (fs.existsSync('./data/config.json')) {
    const loaded = JSON.parse(fs.readFileSync('./data/config.json'))
    cfg = Object.assign({}, cfg, loaded)
    if (cfg.votes.date!== new Date().toDateString()) {
      cfg.votes = { count: 0, voters: [], date: new Date().toDateString() }
    }
  }
} catch(e) {}

function save() {
  try {
    fs.mkdirSync('./data', {recursive:true})
    fs.writeFileSync('./data/config.json', JSON.stringify(cfg))
  } catch(e) {}
}

app.get('/', (req,res)=>{
  const fill = Math.min(cfg.votes.count * 20, 100)
  const votersText = cfg.votes.count === 0? 'No votes yet' : cfg.votes.voters.slice(-3).join(', ')
  const html = `
<html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:sans-serif;max-width:400px;margin:auto;padding:16px;background:#f7f7f7}
.card{background:#fff;padding:18px;border-radius:16px;margin-bottom:12px;box-shadow:0 2px 8px #0001}
.btn{width:100%;padding:16px;border-radius:12px;border:none;font-weight:bold;font-size:17px;cursor:pointer}
.green{background:#25D366;color:#fff}
.count{background:#128C7E;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px;margin-left:8px}
.pollBar{height:8px;background:#e0e0e0;border-radius:4px;margin-top:10px;overflow:hidden}
.pollFill{height:100%;background:#25D366;width:${fill}%;transition:0.3s}
.small{font-size:13px;color:#555}
</style>
<body>
<div class="card" style="text-align:center">
<b>${cfg.day} - ${cfg.time} ${cfg.ampm}</b><br>
<span class="small">Std: ${cfg.standardTime} | Auto: ${cfg.autoBook? 'ON' : 'OFF'}</span>
</div>
<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center">
<b>I want a taxi</b>
<span class="count">${cfg.votes.count} votes</span>
</div>
<div class="pollBar"><div class="pollFill"></div></div>
<div class="small" style="margin-top:6px">${votersText} - Today ${cfg.votes.date}</div>
<form method="POST" action="/want-taxi" style="margin-top:12px">
<button class="btn green">I want a taxi - ${cfg.time} ${cfg.ampm}</button>
</form>
<div style="background:#fffbe6;padding:12px;border-radius:10px;margin-top:12px;font-size:14px;line-height:1.6">
<b>Simple tags:</b><br>
#NAB - No Auto Book<br>
#UT - Update Time, e.g. send #UT19:30 to book taxi at 19:30<br>
<span class="small">Bot reads only msgs 30min before ${cfg.standardTime}</span>
</div>
<label style="display:flex;gap:8px;margin-top:12px"><input type="checkbox" ${cfg.autoBook? 'checked' : ''} onchange="fetch('/toggle-autobook',{method:'POST'}).then(()=>location.reload())"> Auto-book ON</label>
</div>
</body>
</html>
`
  res.send(html)
})

app.post('/want-taxi', async (req,res)=>{
  cfg.votes.count += 1
  cfg.votes.voters.push('Vote at ' + new Date().toLocaleTimeString())
  if (cfg.votes.voters.length > 20) cfg.votes.voters.shift()
  save()
  try {
    if (global.sock) {
      const num = cfg.taxiNumbers[0].replace(/[^0-9]/g,'')
      await global.sock.sendMessage(num + '@s.whatsapp.net', {text: 'TAXI VOTE ' + cfg.votes.count + ': Taxi needed ' + cfg.time + ' ' + cfg.ampm})
    }
  } catch(e) {}
  res.redirect('/')
})

app.post('/toggle-autobook', (req,res)=>{
  cfg.autoBook =!cfg.autoBook
  save()
  res.json({ok:true})
})

app.get('/want-taxi', (req,res)=> res.redirect('/'))

async function start() {
  const auth = await useMultiFileAuthState('./session')
  const sock = makeWASocket({ auth: auth.state })
  global.sock = sock
  sock.ev.on('creds.update', auth.saveCreds)
  sock.ev.on('messages.upsert', async (msg)=>{
    try {
      const m = msg.messages[0]
      if (!m.message || m.key.fromMe) return
      let textRaw = m.message.conversation || ''
      if (m.message.extendedTextMessage) textRaw = m.message.extendedTextMessage.text
      const text = textRaw.toUpperCase()
      if (Date.now() - (m.messageTimestamp * 1000) > 30*60*1000) return
      if (text.includes('#NAB')) {
        cfg.autoBook = false
        cfg.votes.count = 0
        cfg.votes.voters = []
        save()
        await sock.sendMessage(m.key.remoteJid, {text: 'NAB detected - No auto-book today'})
        return
      }
      if (!cfg.autoBook) return
      const tm = text.match(/#UT(\d{1,2}):?(\d{2})?/i)
      if (tm) {
        let h = parseInt(tm[1])
        let mm = tm[2] || '00'
        cfg.time = (h > 12? h - 12 : h) + ':' + mm
        cfg.ampm = h >= 12? 'PM' : 'AM'
        save()
        await sock.sendMessage(m.key.remoteJid, {text: 'Updated to ' + cfg.time + ' ' + cfg.ampm + ' - votes: ' + cfg.votes.count})
      }
    } catch(e) { console.log(e) }
  })
  app.listen(3000, ()=> console.log('Live'))
}
start()
