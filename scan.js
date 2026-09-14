let scanFiles=[], scanRows=[];
function guessCatUnit(t){
  t=(t||"").toLowerCase();
  if(/abs\s*08\/41|abs\s*2|2\s*mm/.test(t)&&/abs|кант|kant/.test(t))return["kant_abs2","m"];
  if(/abs/.test(t))return["kant_abs1","m"];
  if(/pvc|кант|kant/.test(t))return["kant_pvc","m"];
  if(/клиз|blum|tdm|slide/.test(t))return["klizac","kom"];
  if(/клап|шарк|hinge/.test(t))return["sarka","kom"];
  if(/медиј|mdf/.test(t))return["medijapan","tabla"];
  if(/ивер|iver|agt|starwood|d\d{2,3}|a\d{3}/.test(t))return["iverica","tabla"];
  return["drugo","kom"];
}
function parseScanText(text){
  const rows=[];
  String(text||"").split(/\n+/).map(l=>l.replace(/\s+/g," ").trim()).filter(l=>l.length>2).forEach((line,i)=>{
    const nums=[...line.matchAll(/(\d+[.,]\d+|\d+)/g)].map(m=>m[1]);
    if(!nums.length)return;
    let raw=nums[nums.length-1].replace(",",".");
    let price=Number(raw);
    if(!(price>0))return;
    if(/den|ден/i.test(line))price=+(price/61.5).toFixed(2);
    let without=line.replace(new RegExp(nums[nums.length-1]+".*$"),"").trim();
    const codes=[...without.matchAll(/\b([A-Z]{0,2}\d{2,4}[A-Z]?)\b/gi)].map(m=>m[1].toUpperCase());
    const [cat,unit]=guessCatUnit(line);
    if(codes.length>=2){
      codes.forEach(code=>rows.push({id:uid(),keep:true,code,name:without||line,cat,unit,price}));
    }else{
      const code=codes[0]||("R"+String(i+1).padStart(3,"0"));
      rows.push({id:uid(),keep:true,code,name:without||line,cat,unit,price});
    }
  });
  return rows;
}
function renderScan(){
  const body=$("scanBody");if(!body)return;
  if(!scanRows.length){body.innerHTML=`<tr><td colspan="6" class="hint">Нема прочитани ставки.</td></tr>`;return;}
  const catOpts=CATS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  const unitOpts=UNITS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  body.innerHTML=scanRows.map(r=>`<tr>
    <td><input type="checkbox" data-sk="${r.id}" ${r.keep?"checked":""}></td>
    <td><input data-sf="code" data-id="${r.id}" value="${r.code}"></td>
    <td><input data-sf="name" data-id="${r.id}" value="${r.name}"></td>
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
  if(!window.Tesseract){$("scanStatus").textContent="Треба интернет за читање.";return;}
  $("scanStatus").textContent="Читам слика...";
  let all="";
  for(const f of scanFiles){
    const res=await Tesseract.recognize(f,"eng+mkd").catch(()=>Tesseract.recognize(f,"eng"));
    all+=(res&&res.data&&res.data.text?res.data.text:"")+"\n";
  }
  scanRows=parseScanText(all);
  renderScan();
  $("scanStatus").textContent="Најдени "+scanRows.length+" ставки. Провери група/цена и зачувај.";
}
function saveScan(){
  let n=0;
  scanRows.filter(r=>r.keep&&r.code&&r.price>0).forEach(r=>{
    const ex=state.prices.find(x=>norm(x.code)===norm(r.code)&&x.cat===r.cat);
    const row={code:r.code,name:r.name,cat:r.cat,unit:r.unit,price:Number(r.price)};
    if(ex)Object.assign(ex,row);else state.prices.push({...row,id:uid()});
    n++;
  });
  save();renderPrices();
  $("scanStatus").textContent="Зачувани "+n+" ставки во ценовникот.";
}
(function setupScan(){
  const file=$("scanFile"), btn=$("scanBtn"), saveBtn=$("saveScanBtn");
  if(!file)return;
  file.onchange=e=>{scanFiles=[...e.target.files];$("scanPreview").innerHTML=scanFiles.map(f=>`<img src="${URL.createObjectURL(f)}" style="max-width:100%;border-radius:10px;margin-top:8px">`).join("");};
  if(btn)btn.onclick=runScan;
  if(saveBtn)saveBtn.onclick=saveScan;
})();
