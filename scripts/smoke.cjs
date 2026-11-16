const {chromium}=require('../../.tools/node_modules/playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.INSHU_URL||'http://localhost:3200';
const out=path.resolve(__dirname,'../.wrangler/verification');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage();
 page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 console.log('ログイン画面を確認');await page.goto(base+'/',{waitUntil:'domcontentloaded'});console.log('表示URL',page.url());await page.waitForURL(url=>url.pathname==='/login');
 console.log('開発ログイン');await page.getByRole('button',{name:'開発ログイン',exact:true}).click();await page.waitForURL(base+'/');console.log('ログイン完了');
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=720;c.height=480;const x=c.getContext('2d');x.fillStyle='#b7d6ca';x.fillRect(0,0,720,480);x.fillStyle='#416c5a';x.fillRect(100,90,160,220);x.fillStyle='white';x.font='40px sans-serif';x.fillText('OFFLINE TEST',280,240);return c.toDataURL('image/jpeg').split(',')[1];});
 const fixture=Buffer.from(jpeg,'base64');
 await page.getByLabel('写真を選ぶ',{exact:true}).setInputFiles([{name:'sample.jpg',mimeType:'image/jpeg',buffer:fixture},{name:'sample2.jpg',mimeType:'image/jpeg',buffer:fixture}]);
 console.log('アップロード開始');await page.getByRole('button',{name:'チェックする',exact:false}).click();await page.waitForURL('**/batches/**');
 await page.getByText('2 / 2 枚 判定完了',{exact:false}).waitFor();
 await page.screenshot({path:path.join(out,'batch-desktop.png'),fullPage:true});
 const batchUrl=page.url(),batchId=batchUrl.split('/').pop();
 const list=await (await context.request.get(base+'/api/batches/'+batchId)).json();assert.equal(list.photos.length,2);assert.ok(list.photos.every(p=>p.findings.length===3));
 const photoId=list.photos[0].id,otherId=list.photos[1].id;await page.goto(base+'/photos/'+photoId);await page.getByRole('heading',{name:'写真を確認・加工'}).waitFor();await page.getByRole('button',{name:'お酒の枠',exact:true}).click();
 const before=await (await context.request.get(base+'/api/photos/'+photoId)).json();
 await page.getByRole('button',{name:'ポンッとジュースにする',exact:true}).click();
 await page.getByLabel('ジュースに変身',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.finding')?.textContent.includes('加工済み'));
 let after=await (await context.request.get(base+'/api/photos/'+photoId)).json();assert.equal(after.photo.status,'edited');assert.ok(after.photo.risk_score<before.photo.risk_score);assert.equal(after.findings.filter(f=>f.status==='fixed').length,1);
 await page.getByRole('button',{name:'個人情報の枠',exact:true}).click();await page.locator('.finding').filter({hasText:'個人情報'}).getByRole('button',{name:'ぼかす',exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.finding')).filter(e=>e.textContent.includes('加工済み')).length===2);
 const slider=page.getByLabel('ビフォーアフター');await slider.fill('75');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'ダウンロード',exact:true}).click();const download=await downloadPromise;await download.saveAs(path.join(out,'edited.jpg'));assert.ok(fs.statSync(path.join(out,'edited.jpg')).size>100);
 await page.screenshot({path:path.join(out,'photo-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'1つ戻す',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.finding')).filter(e=>e.textContent.includes('加工済み')).length===1);
 // 誤検出の除外と復元。
 await page.getByRole('button',{name:'個人情報の枠',exact:true}).click();await page.locator('.finding').filter({hasText:'個人情報'}).getByRole('button',{name:'誤検出として消す',exact:true}).click();await page.getByRole('button',{name:'枠を戻す',exact:true}).waitFor();await page.getByRole('button',{name:'枠を戻す',exact:true}).click();await page.getByRole('button',{name:'個人情報の枠',exact:true}).waitFor();
 // 手動の枠をドラッグして保存する。
 console.log('手動枠を追加');await page.getByRole('button',{name:'枠を足す',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.image-stage img')).every(i=>i.complete&&i.naturalWidth>0));await page.locator('.image-stage').scrollIntoViewIfNeeded();const stage=await page.locator('.image-stage').boundingBox();await page.mouse.move(stage.x+stage.width*.1,stage.y+stage.height*.1);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.24,stage.y+stage.height*.24,{steps:8});await page.mouse.up();await page.getByRole('button',{name:'枠を保存',exact:true}).click();await page.getByText('手動で追加した写り込み',{exact:true}).first().waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'photo-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // 別の担当には加工後だけを見せ、元画像・未加工 current・加工 API は拒否する。
 await require('./smoke-rest.cjs')({page,context,base,out,photoId});
 const other=await browser.newContext();const otherPage=await other.newPage();await otherPage.goto(base+'/login');await otherPage.locator('select[name=staff_id]').selectOption('sample-staff-2');await otherPage.getByRole('button',{name:'開発ログイン',exact:true}).click();await otherPage.waitForURL(base+'/');
 assert.equal((await other.request.get(base+'/api/photos/'+photoId+'/image?v=original')).status(),403);
 assert.equal((await other.request.get(base+'/api/photos/'+photoId+'/image?v=current')).status(),200);
 assert.equal((await other.request.get(base+'/api/photos/'+otherId+'/image?v=current')).status(),403);
 assert.equal((await other.request.post(base+'/api/photos/'+photoId+'/revert',{headers:{Origin:base},data:{}})).status(),403);
 assert.equal((await other.request.get(base+'/api/lead/rules')).status(),403);
 assert.equal((await other.request.get(base+'/api/lead/staff')).status(),403);
 await otherPage.goto(base+'/lead/rules');await otherPage.getByRole('heading',{name:'責任者の権限が必要です'}).waitFor();
 const gallery=(await (await other.request.get(base+'/api/gallery')).json()).photos;assert.ok(gallery.some(p=>p.id===photoId&&!p.is_owner));assert.ok(!gallery.some(p=>p.id===otherId));
 await otherPage.goto(base+'/gallery');assert.equal(await otherPage.getByRole('button',{name:'ビフォーアフターを見る'}).count(),0);
 console.log(require('node:child_process').execFileSync(process.execPath,[require.resolve('tsx/cli',{paths:[path.resolve(__dirname,'..')]}),'scripts/verify-cleanup.ts'],{cwd:path.resolve(__dirname,'..'),env:process.env,encoding:'utf8'}));
 assert.equal((await context.request.get(base+'/api/auth/slack/login')).status(),501);
 assert.equal((await context.request.post(base+'/api/batches',{headers:{Origin:'https://example.invalid'},data:{photo_count:1}})).status(),403);
 assert.equal((await context.request.post(base+'/api/batches',{headers:{Origin:base},data:{photo_count:21}})).status(),400);
 // 宣言枚数を超えるアップロードを拒否。
 const batch=await (await context.request.post(base+'/api/batches',{headers:{Origin:base},data:{photo_count:1}})).json();
 const uploaded=await context.request.post(base+'/api/batches/'+batch.id+'/photos',{headers:{Origin:base,'Content-Type':'image/jpeg'},data:fixture});assert.equal(uploaded.status(),200);
 assert.equal((await context.request.post(base+'/api/batches/'+batch.id+'/photos',{headers:{Origin:base,'Content-Type':'image/jpeg'},data:fixture})).status(),409);
 assert.deepEqual(errors,[]);console.log('ブラウザ検証成功：ログイン・2枚アップロード・判定・変身演出・置換・ぼかし・比較・ダウンロード・復元・誤検出・手動枠・権限・モバイル表示・ギャラリー・基準編集・担当管理・期限切れ削除');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
