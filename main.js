
let rootHandle=null;
let pdfItems=[];

const $=id=>document.getElementById(id);
const chooseBtn=$('chooseBtn');
const reopenBtn=$('reopenBtn');
const scanBtn=$('scanBtn');
const searchBox=$('searchBox');
const pdfBody=$('pdfBody');
const countText=$('countText');
const statusEl=$('status');
const envBadge=$('envBadge');

function setStatus(msg){statusEl.textContent=msg}
function fmtBytes(n){
  if(n<1024)return n+' B';
  if(n<1024**2)return (n/1024).toFixed(1)+' KB';
  return (n/1024**2).toFixed(1)+' MB';
}
function updateEnv(){
  const ok=window.isSecureContext&&('showDirectoryPicker'in window);
  envBadge.textContent=ok?'Chrome/Edge 사용 가능':'환경 확인 필요';
  envBadge.className=ok?'badge ok':'badge bad';
}
async function walk(dir,prefix=''){
  const out=[];
  for await(const [name,h] of dir.entries()){
    const path=prefix?`${prefix}/${name}`:name;
    if(h.kind==='directory'){
      out.push(...await walk(h,path));
    }else if(h.kind==='file'&&name.toLowerCase().endsWith('.pdf')){
      const f=await h.getFile();
      out.push({name,path,size:f.size});
    }
  }
  return out;
}
async function scan(mayPrompt=true){
  if(!rootHandle)return false;
  if(!await ensurePermission(rootHandle,'readwrite',mayPrompt)){
    setStatus('폴더 읽기/쓰기 권한이 필요합니다.');
    return false;
  }
  setStatus(`"${rootHandle.name}" 검색 중...`);
  pdfItems=await walk(rootHandle);
  pdfItems.sort((a,b)=>a.path.localeCompare(b.path,'ko'));
  scanBtn.disabled=false;
  setStatus(`PDF ${pdfItems.length}개를 찾았습니다.`);
  render();
  return true;
}
function render(){
  const q=searchBox.value.trim().toLowerCase();
  const arr=pdfItems.filter(x=>x.name.toLowerCase().includes(q)||x.path.toLowerCase().includes(q));
  countText.textContent=`PDF ${arr.length}개`;
  pdfBody.replaceChildren();

  if(!arr.length){
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=4;td.className='empty';td.textContent='PDF가 없습니다.';
    tr.appendChild(td);pdfBody.appendChild(tr);return;
  }

  for(const x of arr){
    const tr=document.createElement('tr');
    const td1=document.createElement('td');td1.textContent=x.name;
    const td2=document.createElement('td');td2.textContent=x.path;td2.className='path';
    const td3=document.createElement('td');td3.textContent=fmtBytes(x.size);
    const td4=document.createElement('td');
    const b=document.createElement('button');
    b.className='open-btn';b.textContent='새 창에서 편집';
    b.onclick=()=>{
      const url=new URL('./viewer.html',location.href);
      url.searchParams.set('file',x.path);
      window.open(url.toString(),'_blank');
    };
    td4.appendChild(b);
    tr.append(td1,td2,td3,td4);
    pdfBody.appendChild(tr);
  }
}
searchBox.oninput=render;

chooseBtn.onclick=async()=>{
  if(!('showDirectoryPicker'in window)){
    alert('최신 Chrome 또는 Edge를 사용해 주세요.');return;
  }
  try{
    rootHandle=await window.showDirectoryPicker({id:'paper-library-root',mode:'readwrite'});
    await saveRootHandle(rootHandle);
    await scan(true);
  }catch(e){
    if(e.name!=='AbortError')alert('폴더를 열지 못했습니다: '+e.message);
  }
};
reopenBtn.onclick=async()=>{
  rootHandle=await loadRootHandle();
  if(!rootHandle){alert('저장된 폴더가 없습니다.');return;}
  await scan(true);
};
scanBtn.onclick=()=>scan(true);

(async()=>{
  updateEnv();
  try{
    const saved=await loadRootHandle();
    if(saved){
      rootHandle=saved;
      const granted=await ensurePermission(saved,'readwrite',false);
      if(granted)await scan(false);
      else setStatus(`이전에 선택한 폴더 "${saved.name}"가 저장되어 있습니다. "이전 폴더 다시 열기"를 눌러 주세요.`);
    }
  }catch(e){console.error(e)}
})();
