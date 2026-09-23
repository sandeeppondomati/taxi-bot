const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
app.use(express.urlencoded({extended:true}))
app.use(express.json())

let cfg = {
  day: 'Monday', time: '8:10', ampm: 'AM', dest: 'Office', autoBook: true,
  taxiNumbers: ['85261234567'],
  standardTime: '08:10',
  votes: { count: 0, voters: [], date: new Date().toDateString() }
}
try{
  if(fs.existsSync('./data/config.json')){
    let l = JSON.parse(fs.readFileSync('./data/config.json'))
    cfg = Object.assign(cfg, l)
    if(cfg.votes.date!= new Date().toDateString()) cfg.votes = {count:0, voters:[], date:new Date().toDateString()}
  }
}catch(e){}
function save(){ try{ fs.mkdirSync('./data',{recursive:true}); fs.writeFileSync('./data/config.json', JSON.stringify(cfg)) }catch(e){} }

app.get('/', (req,res)=>{
  const fill = Math.min(cfg.votes.count*20,100)
  res.send(`
<html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:sans-serif;max-width:400px;margin:auto;padding:16px;background:#f7f7f7}
.card{background:#fff;padding:18px;border-radius:16px;margin-bottom:12px;box-shadow:0 2px 8px #0001}
.btn{width:100%;padding:16px;border-radius:12px;border:none;font-weight:bold;font-size:17px;cursor:pointer;margin-top:10px}
.green{background:#25D366;color:#fff}
.blue{background:#007bff;color:#fff}
.grey{background:#eee}
.count{background:#128C7E;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px}
.pollBar{height:8px;background:#e0e0e0;border-radius:4px;margin-top:10px;overflow:hidden}
.pollFill{height:100%;background:#25D366;width:${fill}%;}
.small{font-size:13px;color:#555}
</style>
<body>
<div class="card" style="text-align:center"><b>${cfg.day} - ${cfg.time} ${cfg.ampm}</b> <span class="count">${cfg.votes.count} votes</span><br><span class="small">Auto: ${cfg.autoBook?'ON':'OFF'} | Std ${cfg.standardTime}</span></div>

<div class="card">
<b>Poll - Do you want taxi?</b>
<div class="pollBar"><div class="pollFill"></div></div>
<div class="small" style="margin-top:6px">${cfg.votes.count==0?'No votes':cfg.votes.count+' want - '+cfg.votes.voters.slice(-3).join(', ')}</div>

<form method="POST" action="/want-taxi"><button class="btn green">💺 I want a seat - ${cfg.time} ${cfg.ampm}</button></form>
<form method="POST" action="/book-seat"><button class="btn blue">🚕 Book Taxi Now</button></form>
<a href="/test-post"><button class="btn grey">Test Post to Kwun Tong Group</button></a>
<a href="/groups"><button class="btn grey">Show All Groups</button></a>
</div>

<div class="card small">
<b>Group Commands:</b><br>
!testpoll = Create poll<br>
#NAB = No auto book<br>
#UT19:30 = Update to 19:30
</div>
</body></html>`)
})

app.post('/want-taxi', async (req,res)=>{
  cfg.votes.count++; cfg.votes.voters.push('Web '+new Date().toLocaleTimeString()); save()
  res.redirect('/')
})
app.get('/want-taxi',(req,res)=>{ cfg.votes.count++; cfg.votes.voters.push('Web '+new Date().toLocaleTimeString()); save(); res.redirect('/') })

app.post('/book-seat', async (req,res)=>{
  try{ if(global.sock){ const n=cfg.taxiNumbers[0].replace(/[^0-9]/g,''); await global.sock.sendMessage(n+'@s.whatsapp.net',{text:'💺 I want a seat - Book at '+cfg.time+' '+cfg.ampm}) } }catch(e){}
  res.send(`Seat booked at ${cfg.time} ${cfg.ampm}! <a href="/">Back</a>`)
})

app.post('/toggle-autobook',(req,res)=>{ cfg.autoBook=!cfg.autoBook; save(); res.json({}) })

app.get('/groups', async (req,res)=>{
  try{
    const groups = await global.sock.groupFetchAllParticipating()
    let list = Object.values(groups).map(g=>`<li>${g.subject} <br><small>${g.id}</small> <br><a href="/post-group?jid=${g.id}">Post Evening</a><hr></li>`).join('')
    res.send(`<h2>Groups</h2><ul>${list}</ul><a href="/">Back</a>`)
  }catch(e){ res.send('Connect WhatsApp first. Check Render logs for QR. Error: '+e.message) }
})

app.get('/post-group', async (req,res)=>{
  try{
    const jid = req.query.jid
    const time = cfg.time + ' ' + cfg.ampm
    const text = `🚕 *EVENING TAXI SHARE - TODAY* 🚕\n📅 ${new Date().toDateString()}\n⏰ Time: ${time}\n📍 Kwun Tong\n👥 ${cfg.votes.count} votes\n\nVote: #NAB to cancel, #UT19:30 to update`
    await global.sock.sendMessage(jid, {text})
    res.send('Posted! <a href="/">Back</a>')
  }catch(e){ res.status(500).send('Error: '+e.message) }
})

app.get('/test-post', async (req,res)=>{
  try{
    const groups = await global.sock.groupFetchAllParticipating()
    const kwun = Object.values(groups).find(g=>g.subject.toLowerCase().includes('kwun'))
    if(!kwun) return res.send('Kwun Tong group NOT found. Found: '+Object.values(groups).map(g=>g.subject).join(', ')+'<br><a href="/groups">See all</a>')
    await global.sock.sendMessage(kwun.id, { poll: { name: `🚕 Taxi Share Today ${cfg.time} ${cfg.ampm}?`, values: ['I want a seat - '+cfg.time+' '+cfg.ampm, 'No Taxi Today - #NAB'], selectableCount: 1 } })
    res.send('Posted TEST POLL to: '+kwun.subject+' <a href="/">Back</a>')
  }catch(e){ res.send('Error: '+e.message+' - Make sure WhatsApp linked. Check Render logs.') }
})

async function start(){
  const {state, saveCreds} = await useMultiFileAuthState('./session')
  const sock = makeWASocket({auth: state, printQRInTerminal: true});
  global.sock = sock
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (u)=>{
    if(u.connection==='open') console.log('connection open - bot ready!')
  })

  sock.ev.on('messages.upsert', async (x)=>{
    try{
      const m=x.messages[0];
      if(!m ||!m.message || m.key.fromMe) return
      let textRaw = m.message.conversation || m.message.extendedTextMessage?.text || ''
      let up = textRaw.toUpperCase()
      const jid = m.key.remoteJid

      if(textRaw.toLowerCase().startsWith('!testpoll')){
        await sock.sendMessage(jid, {
          poll: {
            name: `🚕 Taxi Share Today ${cfg.time} ${cfg.ampm}?`,
            values: ['I want a seat - '+cfg.time+' '+cfg.ampm, 'No Taxi Today - #NAB'],
            selectableCount: 1
          }
        })
        return
      }

      if(m.message.pollUpdateMessage){
        cfg.votes.count++
        cfg.votes.voters.push('Poll '+new Date().toLocaleTimeString())
        save()
        return
      }

      if(up.includes('#NAB')){
        cfg.autoBook=false; cfg.votes.count=0; cfg.votes.voters=[]; save()
        await sock.sendMessage(jid,{text:'✅ NAB - No auto-book today'})
        return
      }

      const tm=up.match(/#UT(\d{1,2}):?(\d{2})?/i)
      if(tm){
        let h=parseInt(tm[1]); let mm=tm[2]||'00'
        cfg.time=(h>12?h-12:h)+':'+mm
        cfg.ampm=h>=12?'PM':'AM'
        save()
        await sock.sendMessage(jid,{text:'✅ Updated to '+cfg.time+' '+cfg.ampm})
      }
    }catch(e){ console.log('msg err', e.message) }
  })

  app.listen(process.env.PORT||3000,()=>console.log('Live on 3000'))
}
start()
