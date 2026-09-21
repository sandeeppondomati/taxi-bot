const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
app.use(express.urlencoded({extended:true}))
app.use(express.json())

let cfg = {
  day: 'Monday', time: '8:10', ampm: 'AM', autoBook: true,
  taxiNumbers: ['85261234567'], standardTime: '08:10',
  votes: { count: 0, voters: [], date: new Date().toDateString() }
}
try{ if(fs.existsSync('./data/config.json')) {
  let loaded = JSON.parse(fs.readFileSync('./data/config.json'))
  cfg = {...cfg,...loaded}
  // reset votes if new day
  if(cfg.votes.date!== new Date().toDateString()){ cfg.votes = {count:0, voters:[], date:new Date().toDateString()} }
} }catch{}
function save(){ try{fs.mkdirSync('./data',{recursive:true}); fs.writeFileSync('./data/config.json', JSON.stringify(cfg))}catch{}}

app.get('/', (req,res)=> res.send(`
<html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:sans-serif;max-width:400px;margin:auto;padding:16px;background:#f7f7f7}
.card{background:#fff;padding:18px;border-radius:16px;margin-bottom:12px;box-shadow:0 2px 8px #0001}
.btn{width:100%;padding:16px;border-radius:12px;border:none;font-weight:bold;font-size:17px;cursor:pointer;position:relative}
.green{background:#25D366;color:#fff}
.count{background:#128C7E;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px;margin-left:8px}
.pollBar{height:8px;background:#e0e0e0;border-radius:4px;margin-top:10px;overflow:hidden}
.pollFill{height:100%;background:#25D366;width:${Math.min(cfg.votes.count*20,100)}%;transition:0.3s}
.small{font-size:13px;color:#555}
</style>
<body>
<div class="card" style="text-align:center"><b>📅 ${cfg.day} • ${cfg.time} ${cfg.ampm}</b><br><span class="small">Std: ${cfg.standardTime} | Auto: ${cfg.autoBook?'ON':'OFF'}</span></div>

<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center">
<b>🚕 I want a taxi</b>
<span class="count">${cfg.votes.count} votes</span>
</div>

<div class="pollBar"><div class="pollFill"></div></div>
<div class="small" style="margin-top:6px">${cfg.votes.count===0?'No votes yet':cfg.votes.voters.slice(-3).join(', ') + (cfg.votes.count>3?` +${cfg.votes.count-3} more`:'' ) } • Today ${cfg.votes.date}</div>

<form method="POST" action="/want-taxi" style="margin-top:12px">
<button class="btn green">👋 I want a taxi - ${cfg.time} ${cfg.ampm}</button>
</form>

<div style="background:#fffbe6;padding:12px;border-radius:10px;margin-top:12px;font-size:14px;line-height:1.6">
💡 <b>Simple tags:</b><br>
<code>#NAB</code> - No Auto Book<br>
<code>#UT</code> - Update Time, e.g. <b>#UT19:30</b> to book at 19:30
</div>
</div>
</body></html>`))

app.post('/want-taxi',async (req,res)=>{
  cfg.votes.count += 1
  cfg.votes.voters.push('Vote '+cfg.votes.count+' @ '+new Date().toLocaleTimeString())
  if(cfg.votes.voters.length>20) cfg.votes.voters.shift()
  save()
  try{ if(global.sock){ const num=cfg.taxiNumbers[0].replace(/[^0-9]/g,''); await global.sock.sendMessage(num+'@s.whatsapp.net',{
