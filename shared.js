const APP_VERSION = "0.14.3";

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
function canonicalFsName(value){
  return String(value??"")
    .normalize("NFC")
    .toLocaleLowerCase();
}

async function getDirectoryHandlePortable(dirHandle,name){
  try{
    return await dirHandle.getDirectoryHandle(name);
  }catch(error){
    if(error?.name!=="NotFoundError")throw error;
  }

  const target=canonicalFsName(name);

  for await(const [actualName,handle] of dirHandle.entries()){
    if(
      handle.kind==="directory" &&
      canonicalFsName(actualName)===target
    ){
      return handle;
    }
  }

  const notFound=new DOMException(
    `폴더를 찾지 못했습니다: ${name}`,
    "NotFoundError"
  );
  throw notFound;
}

async function getFileHandlePortable(dirHandle,name){
  try{
    return await dirHandle.getFileHandle(name);
  }catch(error){
    if(error?.name!=="NotFoundError")throw error;
  }

  const target=canonicalFsName(name);

  for await(const [actualName,handle] of dirHandle.entries()){
    if(
      handle.kind==="file" &&
      canonicalFsName(actualName)===target
    ){
      return handle;
    }
  }

  const notFound=new DOMException(
    `파일을 찾지 못했습니다: ${name}`,
    "NotFoundError"
  );
  throw notFound;
}

async function resolveFile(root,path){
  const parts=String(path??"")
    .replaceAll("\\","/")
    .split("/")
    .filter(Boolean);

  if(!parts.length){
    throw new Error("PDF 파일 경로가 비어 있습니다.");
  }

  let dir=root;

  for(let i=0;i<parts.length-1;i++){
    dir=await getDirectoryHandlePortable(
      dir,
      parts[i]
    );
  }

  const requestedName=parts[parts.length-1];
  const fileHandle=await getFileHandlePortable(
    dir,
    requestedName
  );

  // Mac에서는 실제 파일명이 NFD로 반환될 수 있으므로
  // 화면 표시 및 후속 처리에는 브라우저가 돌려준 실제 이름을 사용한다.
  const fileName=fileHandle.name || requestedName;

  return {
    fileHandle,
    parentHandle:dir,
    fileName
  };
}
