let scanFiles=[], scanRows=[];
const KEY_STORE="mebel-gemini-key";
const PROMPT=`Ti si asistent za mebel po merka vo Makedonija.
Od slikata na cenovnik izvleci site stavki.
Ako poveke sifri delat ista cena, napravi poseben objekt za sekoja sifra.
Ako ista sifra ima razlicna cena po debelina, poseben red za sekoja debelina.
Ceni vo evra. DEN podeli so 61.5.
cat: iverica, medijapan, kant_pvc, kant_abs1, kant_abs2, klizac, sarka, drugo.
unit: tabla, m, kom, komplet.
Vrati SAMO JSON niza.`;
function getKey(){
  const fromHash=new URLSearchParams((location.hash||"").replace(/^#/,"")).get("gk");
  if(fromHash){
    try{const k=decodeURIComponent(fromHash).trim();if(k){localStorage.setItem(KEY_STORE,k);history.replaceState(null,"",location.pathname+location.search);return k;}}catch(e){}
  }
  const box=$("geminiKey");
  const typed=(box&&box.value||"").trim();
  if(typed){localStorage.setItem(KEY_STORE,typed);return typed;}
  return (window.MEBEL_GEMINI_KEY||localStorage.getItem(KEY_STORE)||"").trim();
}
function guessCatUnit(t){
  t=(t||"").toLowerCase();
  if(/abs/.test(t)&&/2\s*mm|08\/41|08\/28/.test(t))return["kant_abs2","m"];
  if(/abs/.test(t))return["kant_abs1","m"];
  if(/pvc|kant|кант/.test(t))return["kant_pvc","m"];
  if(/клиз|slide|blum/.test(t))return["klizac","kom"];
  if(/клап|шарк|hinge/.test(t))return["sarka","kom"];
  if(/медиј|mdf/.test(t))return["medijapan","tabla"];
  if(/ивер|iver|agt|starwood/.test(t))return["iverica","tabla"];
  return["drugo","kom"];
}
function parseScanText(text){
  const rows=[];
  String(text||"").split(/\n+/).map(l=>l.replace(/\s+/g," ").trim()).filter(l=>l.length>2).forEach((line,i)=>{
    const nums=[...line.matchAll(/(\d+[.,]\d+|\d+)/g)].map(m=>m[1]);
    if(!nums.length)return;
    let price=Number(nums[nums.length-1].replace(",","."));
    if(!(price>0))return;
    if(/den|ден/i.test(line))price=+(price/61.5).toFixed(2);
    const without=line.replace(new RegExp(nums[nums.length-1]+".*$"),"").trim();
    const codes=[...without.matchAll(/\b([A-Z]{0,2}\d{2,4}[A-Z]?)\b/gi)].map(m=>m[1].toUpperCase());
    const [cat,unit]=guessCatUnit(line);
    (codes.length?codes:["R"+String(i+1).padStart(3,"0")]).forEach(code=>rows.push({id:uid(),keep:true,code,name:without||line,cat,unit,price}));
  });
  return rows;
}
function rowsFromGemini(text){
  let raw=String(text||"").trim();
  const fence=raw.match(/\[[\s\S]*\]/);
  if(fence)raw=fence[0];
  const arr=JSON.parse(raw);
  if(!Array.isArray(arr))throw new Error("nema niza");
  return arr.map(x=>({
    id:uid(),keep:true,
    code:String(x.code||"").toUpperCase().trim(),
    name:String(x.name||x.code||""),
    cat:CATS.some(c=>c[0]===x.cat)?x.cat:guessCatUnit(x.name)[0],
    unit:UNITS.some(c=>c[0]===x.unit)?x.unit:guessCatUnit(x.name)[1],
    price:Number(x.price)||0
  })).filter(x=>x.code&&x.price>0);
}
function fileToB64(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=reject;r.readAsDataURL(file);});
}
async function askGemini(file,key){
  const b64=await fileToB64(file);
  const models=["gemini-2.5-flash","gemini-2.0-flash","gemini-2.5-flash-lite"];
  let last="";
  for(const model of models){
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      contents:[{parts:[{inline_data:{mime_type:file.type||"image/jpeg",data:b64}},{text:PROMPT}]}],
      generationConfig:{temperature:0.1,responseMimeType:"application/json"}
    })});
    const data=await res.json();
    if(!res.ok){last=(data.error&&data.error.message)||res.statusText;continue;}
    const text=((((data.candidates||[])[0]||{}).content||{}).parts||[]).map(p=>p.text||"").join("\n");
    if(text)return text;
    last="prazno";
  }
  throw new Error(last||"Gemini ne odgovori");
}
function renderScan(){
  const body=$("scanBody");if(!body)return;
  if(!scanRows.length){body.innerHTML=`<tr><td colspan="6" class="hint">Нема прочитани ставки.</td></tr>`;return;}
  const catOpts=CATS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  const unitOpts=UNITS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  body.innerHTML=scanRows.map(r=>`<tr>
    <td><input type="checkbox" data-sk="${r.id}" ${r.keep?"checked":""}></td>
    <td><input data-sf="code" data-id="${r.id}" value="${r.code}"></td>
    <td><input data-sf="name" data-id="${r.id}" value="${String(r.name).replace(/"/g,"")}"></td>
    <td><select data-sf="cat" data-id="${r.id}">${catOpts}</select></td>
    <td><select data-sf="unit" data-id="${r.id}">${unitOpts}</select></td>
    <td><input data-sf="price" data-id="${r.id}" type="number" step="0.01" value="${r.price}"></td>
  </tr>`).join("");
  body.querySelectorAll("select[data-sf]").forEach(sel=>{sel.value=scanRows.find(x=>x.id===sel.dataset.id)[sel.dataset.sf];});
  body.querySelectorAll("[data-sf]").forEach(el=>{el.oninput=()=>{const r=scanRows.find(x=>x.id===el.dataset.id);r[el.dataset.sf]=el.dataset.sf==="price"?Number(el.value):el.value;};});
  body.querySelectorAll("[data-sk]").forEach(el=>{el.onchange=()=>{scanRows.find(x=>x.id===el.dataset.sk).keep=el.checked;};});
}
async function runScan(){
  if(!scanFiles.length){$("scanStatus").textContent="Прво одбери слика.";return;}
  const key=getKey();
  scanRows=[];
  try{
    if(key){
      $("scanStatus").textContent="Gemini чита слика...";
      let all=[];
      for(const f of scanFiles)all=all.concat(rowsFromGemini(await askGemini(f,key)));
      scanRows=all;
    }else if(window.Tesseract){
      $("scanStatus").textContent="Нема клуч. OCR...";
      let all="";
      for(const f of scanFiles){const res=await Tesseract.recognize(f,"eng").catch(()=>null);all+=(res&&res.data&&res.data.text)||"";}
      scanRows=parseScanText(all);
    }else{$("scanStatus").textContent="Стави Google API клуч на компјутер.";return;}
    renderScan();
    $("scanStatus").textContent="Најдени "+scanRows.length+" ставки.";
  }catch(err){$("scanStatus").textContent="Грешка: "+(err.message||err);}
}
function saveScan(){
  let n=0;
  scanRows.filter(r=>r.keep&&r.code&&r.price>0).forEach(r=>{
    const ex=state.prices.find(x=>norm(x.code)===norm(r.code)&&x.cat===r.cat&&String(x.name)===String(r.name));
    const row={code:r.code,name:r.name,cat:r.cat,unit:r.unit,price:Number(r.price)};
    if(ex)Object.assign(ex,row);else state.prices.push({...row,id:uid()});
    n++;
  });
  save();renderPrices();
  $("scanStatus").textContent="Зачувани "+n+" ставки.";
}
function phoneLink(){
  const key=getKey();
  if(!key){alert("Прво внеси го клучот на компјутер.");return;}
  const url=location.origin+location.pathname+"#gk="+encodeURIComponent(key);
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url);
  prompt("Отвори го овој линк на телефон (еднаш). Потоа клучот е зачуван таму.",url);
}
(function setupScan(){
  const file=$("scanFile"), keyEl=$("geminiKey");
  const existing=getKey();
  if(keyEl){keyEl.value=existing;keyEl.oninput=()=>localStorage.setItem(KEY_STORE,keyEl.value.trim());}
  if(existing&&$("scanStatus"))$("scanStatus").textContent="Клучот е спремен. Одбери слика и Прочитај.";
  if($("shareKeyBtn"))$("shareKeyBtn").onclick=phoneLink;
  if(!file)return;
  file.onchange=e=>{scanFiles=[...e.target.files];$("scanPreview").innerHTML=scanFiles.map(f=>`<img src="${URL.createObjectURL(f)}" style="max-width:220px;border-radius:10px;margin:8px 8px 0 0">`).join("");};
  $("scanBtn").onclick=runScan;
  $("saveScanBtn").onclick=saveScan;
})();
