const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let nextTimer=0, ready=false, snapshot, config, attempts=0;
const timers=new Map(), events=new Map(), warnings=[];
const worksheet={
  customizeRowHeader(value){
    attempts++;
    if(!ready)throw new Error('Render Unit with unitId paran-paper-workbook not found');
    config=value;
  },
  refreshCanvas(){},
  getRange(row,col){return {setValue(value){snapshot.sheets['paran-paper-list'].cellData[row][col]={v:value};}};}
};
const workbook={save:()=>structuredClone(snapshot),getId:()=>snapshot.id,getSheetBySheetId:()=>worksheet};
const api={
  Event:{SheetValueChanged:'value',SheetSkeletonChanged:'skeleton'},
  createWorkbook(value){snapshot=structuredClone(value);},
  getActiveWorkbook:()=>snapshot?workbook:null,
  disposeUnit(){snapshot=null;},
  addEvent(name,fn){events.set(name,fn);return {dispose(){events.delete(name);}};},
  onCommandExecuted(){return {dispose(){}};}
};
const ctx=vm.createContext({console:{warn:(...x)=>warnings.push(x),error:console.error},
  setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},
  clearTimeout:id=>timers.delete(id),alert:()=>{},
  UniverPresets:{createUniver:()=>({univer:{},univerAPI:api})},
  UniverCore:{LocaleType:{EN_US:'enUS'},mergeLocales:x=>x},
  UniverPresetSheetsCore:{UniverSheetsCorePreset:()=>({})},UniverPresetSheetsCoreEnUS:{}});
ctx.window=ctx;
for(const path of ['paper-data/data-store.js','paper-sheet/univer-sheet.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8'),ctx);
function tick(){const first=timers.entries().next().value;assert.ok(first,'scheduled callback');timers.delete(first[0]);first[1]();}
(async()=>{
  const data=ctx.ParanPaperData.normalizeData({papers:[{title:'PDF 있음',pdf:'sample'},{title:'PDF 없음'}]});
  await ctx.ParanPaperSheet.mount({containerId:'sheet',data});
  tick();assert.equal(attempts,1);assert.equal(config,undefined);assert.equal(timers.size,1);
  ready=true;tick();assert.equal(config.rowsCfg[1].fontColor,'#2563EB');assert.equal(config.rowsCfg[1].text,'2');assert.equal(config.rowsCfg[2],undefined);
  // No skeleton event is needed for initial load / restored snapshots.
  const restored=ctx.ParanPaperSheet.getData();restored.sheetSnapshot=structuredClone(snapshot);
  await ctx.ParanPaperSheet.reload(restored);tick();assert.equal(config.rowsCfg[1].fontColor,'#2563EB');
  await ctx.ParanPaperSheet.setSystemFieldAtRow(2,'pdf','second');assert.equal(config.rowsCfg[2].fontColor,'#2563EB');
  await ctx.ParanPaperSheet.setSystemFieldAtRow(1,'pdf','');assert.equal(config.rowsCfg[1],undefined);
  events.get('skeleton')();tick();assert.equal(config.rowsCfg[2].fontColor,'#2563EB');
  // Retries from a disposed workbook must not survive a replacement.
  ready=false;await ctx.ParanPaperSheet.reload(data);tick();assert.equal(timers.size,1);
  await ctx.ParanPaperSheet.reload(data);assert.equal(timers.size,1);ready=true;tick();assert.equal(timers.size,0);
  assert.equal(warnings.length,0);
  console.log('PASS: delayed renderer, no initial skeleton event, restore, PDF add/remove, skeleton refresh, reload cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
