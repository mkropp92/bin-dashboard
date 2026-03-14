const STORAGE_KEY = "binDashboardSettingsV20";
const WEATHER_CACHE_KEY = "binDashboardWeatherCacheV1";

const PUSH_BACKEND_URL = "https://bin-dashboard-1.onrender.com";

const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const MONTH_NAMES = [
"January","February","March","April","May","June",
"July","August","September","October","November","December"
];

const REGION_COORDS = {
"Sunshine Coast":{latitude:-26.65,longitude:153.06},
"Caloundra":{latitude:-26.803,longitude:153.121},
"Buderim":{latitude:-26.685,longitude:153.057},
"Maroochydore":{latitude:-26.657,longitude:153.088},
"Mooloolaba":{latitude:-26.681,longitude:153.119},
"Nambour":{latitude:-26.628,longitude:152.959},
"Coolum Beach":{latitude:-26.528,longitude:153.088},
"Noosa Heads":{latitude:-26.394,longitude:153.09},
"Noosaville":{latitude:-26.401,longitude:153.066},
"Yandina":{latitude:-26.562,longitude:152.956},
"Maleny":{latitude:-26.759,longitude:152.851}
};

const defaultSettings = {
ready:false,
locality:"Sunshine Coast",
dow:1,
weekGroup:1,
invertAlternateCycle:true,
latitude:-26.65,
longitude:153.06,
notificationsEnabled:false,
lastLookupAt:""
};

function loadSettings(){
const raw=localStorage.getItem(STORAGE_KEY);
if(!raw)return{...defaultSettings};
try{return{...defaultSettings,...JSON.parse(raw)}}
catch{return{...defaultSettings}}
}

function saveSettings(settings){
localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));
}

function resetSettings(){
localStorage.removeItem(STORAGE_KEY);
localStorage.removeItem(WEATHER_CACHE_KEY);
}

function pad(n){return String(n).padStart(2,"0")}

function toIso(d){
return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

function atMidday(d){
return new Date(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0,0)
}

function addDays(d,days){
const n=new Date(d)
n.setDate(n.getDate()+days)
return n
}

function dayDiff(a,b){
return Math.round((atMidday(a)-atMidday(b))/86400000)
}

function isIOS(){
return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)
}

function isStandalone(){
return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone===true
}

async function ensureNotificationsFromUserAction(){

if(!("Notification" in window))return"unsupported"

if(Notification.permission==="granted")return"granted"

if(isIOS() && !isStandalone()){
throw new Error("Install this app to your Home Screen first to enable notifications.")
}

if(Notification.permission==="denied"){
throw new Error("Notifications blocked in iPhone settings.")
}

return await Notification.requestPermission()
}

function getIsoWeekNumber(date){
const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()))
const dayNum=d.getUTCDay()||7
d.setUTCDate(d.getUTCDate()+4-dayNum)
const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1))
return Math.ceil((((d-yearStart)/86400000)+1)/7)
}

function currentWeekMatches(settings,date){
const weekNo=getIsoWeekNumber(date)
const currentGroup=(weekNo%2===0)?2:1
return Number(settings.weekGroup)===currentGroup
}

function isRecycleWeek(date,settings){
let recycle=currentWeekMatches(settings,date)
if(settings.invertAlternateCycle)recycle=!recycle
return recycle
}

function upcomingCollections(settings){

const today=atMidday(new Date())
const out=[]

for(let i=0;i<120;i++){

const d=addDays(today,i)

if(d.getDay()!==Number(settings.dow))continue

let recycle=false
let organics=false

if(settings.ready){
recycle=isRecycleWeek(d,settings)
organics=!recycle
}

out.push({
date:d,
iso:toIso(d),
pretty:`${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
prettyShort:`${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
recycle,
organics
})

}

return out
}

function bannerText(settings){

if(!settings.ready)return"Set your collection day to begin."

const now=new Date()
const dowNow=now.getDay()
const hour=now.getHours()

let days=settings.dow-dowNow
if(days<0)days+=7

if(days===0){
if(hour<12)return"Bin day today."
return"Bins collected today."
}

if(days===1 && hour>=16)return"Put bins out tonight."
if(days===1)return"Bin day tomorrow."

return`Next collection in ${days} days.`

}

function secondaryChip(ev){

if(ev.recycle)return{text:"Recycling",cls:"bin-yellow"}
if(ev.organics)return{text:"Garden Organics",cls:"bin-lime"}
return{text:"General Waste",cls:"bin-red"}

}

async function subscribeForPush(settings){

if(!("serviceWorker" in navigator))return

const reg=await navigator.serviceWorker.ready

const vapid=await fetch(`${PUSH_BACKEND_URL}/vapid-public-key`).then(r=>r.json())

const key=vapid.publicKey

function urlBase64ToUint8Array(base64String){
const padding="=".repeat((4-base64String.length%4)%4)
const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/")
const rawData=atob(base64)
const outputArray=new Uint8Array(rawData.length)
for(let i=0;i<rawData.length;++i){outputArray[i]=rawData.charCodeAt(i)}
return outputArray
}

let sub=await reg.pushManager.getSubscription()

if(!sub){
sub=await reg.pushManager.subscribe({
userVisibleOnly:true,
applicationServerKey:urlBase64ToUint8Array(key)
})
}

await fetch(`${PUSH_BACKEND_URL}/subscribe`,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
subscription:sub,
locality:settings.locality,
dow:settings.dow,
weekGroup:settings.weekGroup
})
})

}

async function fetchWeather(dateIso,lat,lon){

const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Australia%2FSydney`

const res=await fetch(url)
const data=await res.json()

const idx=data.daily.time.indexOf(dateIso)

if(idx===-1)return null

return{
max:data.daily.temperature_2m_max[idx],
min:data.daily.temperature_2m_min[idx],
rain:data.daily.precipitation_probability_max[idx]
}

}

function render(settings=loadSettings()){

const banner=document.getElementById("bannerText")
if(banner)banner.textContent=bannerText(settings)

const upcoming=upcomingCollections(settings)

const next=upcoming[0]

const today=atMidday(new Date())

if(next){

const days=Math.max(0,dayDiff(next.date,today))

document.getElementById("daysAway").textContent=days
document.getElementById("nextPretty").textContent=next.pretty

const s=secondaryChip(next)

const chip=document.getElementById("nextSecondary")

chip.textContent=s.text
chip.className=`chip ${s.cls}`

fetchWeather(next.iso,settings.latitude,settings.longitude)
.then(wx=>{
if(!wx)return
document.getElementById("weatherBox").innerHTML=
`Max ${wx.max}°C<br>Min ${wx.min}°C<br>Rain ${wx.rain}%`
})

}

document.getElementById("setupLine").innerHTML=
`Region: Sunshine Coast<br>
Area: ${settings.locality}<br>
Collection: ${DOW_NAMES[settings.dow]}<br>
Notifications: ${settings.notificationsEnabled?"On":"Off"}`
}

function applySetup(){

const locality=document.getElementById("localityInput").value
const dow=Number(document.getElementById("dowInput").value)
const weekGroup=Number(document.getElementById("weekGroupInput").value)

const coords=REGION_COORDS[locality]

const updated={
...loadSettings(),
ready:true,
locality,
dow,
weekGroup,
latitude:coords.latitude,
longitude:coords.longitude,
lastLookupAt:new Date().toISOString()
}

saveSettings(updated)

return updated
}

function setupManualSetup(){

const btn=document.getElementById("saveSetupBtn")
const status=document.getElementById("lookupStatus")

btn.addEventListener("click",async()=>{

btn.disabled=true
status.innerHTML="Saving…"

try{

const settings=applySetup()

const permission=Notification.permission==="granted"
?"granted"
:await ensureNotificationsFromUserAction()

if(permission==="granted"){

await subscribeForPush(settings)

settings.notificationsEnabled=true
saveSettings(settings)

}

render(settings)

status.innerHTML="Setup complete."

}catch(err){

status.innerHTML=err.message

}

btn.disabled=false

})

}

function setupReset(){

document.getElementById("resetBtn").onclick=()=>{
resetSettings()
render(loadSettings())
}

}

async function registerServiceWorker(){

if("serviceWorker" in navigator){
try{
await navigator.serviceWorker.register("./sw.js")
}catch{}
}

}

window.addEventListener("DOMContentLoaded",async()=>{

await registerServiceWorker()

setupManualSetup()
setupReset()

render(loadSettings())

})