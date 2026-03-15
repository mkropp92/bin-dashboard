const STORAGE_KEY="binSettings";

const REGION_COORDS={
"Nambour":{lat:-26.628,lon:152.959},
"Caloundra":{lat:-26.803,lon:153.121},
"Buderim":{lat:-26.685,lon:153.057},
"Maroochydore":{lat:-26.657,lon:153.088},
"Mooloolaba":{lat:-26.681,lon:153.119},
"Coolum Beach":{lat:-26.528,lon:153.088},
"Noosa Heads":{lat:-26.394,lon:153.09},
"Noosaville":{lat:-26.401,lon:153.066},
"Peregian Beach":{lat:-26.482,lon:153.096},
"Yandina":{lat:-26.562,lon:152.956},
"Maleny":{lat:-26.759,lon:152.851},
"Sunshine Coast":{lat:-26.65,lon:153.06}
};

function loadSettings(){
try{
return JSON.parse(localStorage.getItem(STORAGE_KEY))||{};
}catch{return{}}
}

function saveSettings(s){
localStorage.setItem(STORAGE_KEY,JSON.stringify(s));
}

function bannerText(settings){

if(!settings.ready)return"Set your collection day.";

const now=new Date();
const dow=now.getDay();

let diff=settings.dow-dow;
if(diff<0)diff+=7;

if(diff===0)return"Bin day today.";
if(diff===1)return"Put bins out tonight.";

return`Next collection in ${diff} days.`;
}

function upcoming(settings){

const today=new Date();

for(let i=0;i<14;i++){

let d=new Date();
d.setDate(today.getDate()+i);

if(d.getDay()===settings.dow){

return d;

}

}

}

function render(){

const s=loadSettings();

document.getElementById("bannerText").textContent=bannerText(s);

if(!s.ready)return;

const next=upcoming(s);

const today=new Date();
const days=Math.round((next-today)/86400000);

document.getElementById("daysAway").textContent=days;
document.getElementById("nextPretty").textContent=next.toDateString();

const week=Math.ceil((next-new Date(next.getFullYear(),0,1))/604800000);

let recycle=(week%2===s.weekGroup);

if(s.invert)recycle=!recycle;

document.getElementById("nextSecondary").innerHTML=
recycle?
`<span class="chip bin-yellow">Recycling</span>`:
`<span class="chip bin-lime">Garden</span>`;

document.getElementById("setupLine").innerHTML=
`Area: ${s.locality}<br>
Collection: ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.dow]}`;

}

function setup(){

const btn=document.getElementById("saveSetupBtn");

btn.onclick=()=>{

const locality=document.getElementById("localityInput").value;
const dow=Number(document.getElementById("dowInput").value);
const weekGroup=Number(document.getElementById("weekGroupInput").value);

const settings={
ready:true,
locality,
dow,
weekGroup,
invert:true
};

saveSettings(settings);

document.getElementById("lookupStatus").textContent="Saved.";

render();

};

}

window.addEventListener("DOMContentLoaded",()=>{

setup();
render();

});