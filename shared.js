const APP_VERSION = "0.11.1";

const DB_NAME='paper-pdf-singlefile-db';
const STORE='handles';
function openDb(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function saveHandle(key,h){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(h,key);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}
async function loadHandle(key){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const r=db.transaction(STORE,'readonly').objectStore(STORE).get(key);
    r.onsuccess=()=>resolve(r.result||null);
    r.onerror=()=>reject(r.error);
  });
}
async function saveRootHandle(h){
  return saveHandle('root',h);
}
async function loadRootHandle(){
  return loadHandle('root');
}
async function saveDownloadHandle(h){
  return saveHandle('download',h);
}
async function loadDownloadHandle(){
  return loadHandle('download');
}
async function ensurePermission(h,mode='readwrite',mayPrompt=true){
  const opt={mode};
  if(await h.queryPermission(opt)==='granted')return true;
  if(!mayPrompt)return false;
  return await h.requestPermission(opt)==='granted';
}
async function resolveFile(root,path){
  const parts=path.replaceAll('\\','/').split('/').filter(Boolean);
  let dir=root;
  for(let i=0;i<parts.length-1;i++)dir=await dir.getDirectoryHandle(parts[i]);
  const fileName=parts[parts.length-1];
  return {fileHandle:await dir.getFileHandle(fileName),parentHandle:dir,fileName};
}
