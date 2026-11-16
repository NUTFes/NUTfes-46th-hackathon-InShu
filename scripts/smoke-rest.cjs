const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function({page,context,base,out,photoId}){
 await page.setViewportSize({width:1280,height:960});await page.goto(base+'/gallery');
 await page.getByRole('button',{name:'ビフォーアフターを見る',exact:true}).first().click();await page.locator('dialog[open]').waitFor();await page.getByLabel('ビフォーアフター').fill('30');await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.gallery-grid img')).every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:path.join(out,'gallery-desktop.png'),fullPage:true});
 console.log('基準を検証');await page.goto(base+'/lead/rules');await page.getByRole('button',{name:'基準を追加',exact:true}).click();
 const name='スモーク基準'+Date.now();await page.getByLabel('名前',{exact:true}).fill(name);await page.getByLabel('説明',{exact:true}).fill('試験用の具体的な説明');await page.getByRole('button',{name:'保存する',exact:true}).click();
 let row=page.getByRole('row').filter({hasText:name});await row.getByRole('button',{name:'編集',exact:true}).click();await page.getByLabel('説明',{exact:true}).fill('編集後の説明');await page.getByLabel('重み',{exact:true}).fill('2');await page.getByRole('button',{name:'保存する',exact:true}).click();await row.getByText('編集後の説明',{exact:true}).waitFor();await row.getByRole('button',{name:'無効にする',exact:true}).click();await row.getByRole('button',{name:'有効にする',exact:true}).waitFor();
 const rules=(await (await context.request.get(base+'/api/lead/rules')).json()).rules;assert.equal(rules.find(r=>r.name===name).is_active,0);assert.equal(rules.find(r=>r.name===name).weight,2);
 assert.equal((await context.request.post(base+'/api/lead/rules',{headers:{Origin:base},data:{name:'不正',description:'検証',treatment:'blur',weight:6,is_active:true}})).status(),400);
 await page.screenshot({path:path.join(out,'rules-desktop.png'),fullPage:true});
 console.log('担当を検証');await page.goto(base+'/lead/staff');const memberName='スモーク担当'+Date.now();await page.getByLabel('Slack ユーザーID',{exact:true}).fill('U'+Date.now());await page.getByLabel('表示名',{exact:true}).fill(memberName);await page.getByRole('button',{name:'追加する',exact:true}).click();
 row=page.getByRole('row').filter({hasText:memberName});await row.getByRole('button',{name:'責任者にする',exact:true}).click();await row.getByRole('button',{name:'責任者を外す',exact:true}).waitFor();await row.getByRole('button',{name:'責任者を外す',exact:true}).click();await row.getByRole('button',{name:'責任者にする',exact:true}).waitFor();await row.getByRole('button',{name:'在籍を解除',exact:true}).click();await row.getByText('解除済み',{exact:true}).waitFor();
 const members=(await (await context.request.get(base+'/api/lead/staff')).json()).staff;assert.equal(members.find(s=>s.display_name===memberName).is_active,0);
 assert.equal((await context.request.post(base+'/api/lead/staff/sample-staff-1',{headers:{Origin:base},data:{is_active:true,is_lead:false}})).status(),409);
 await page.screenshot({path:path.join(out,'staff-desktop.png'),fullPage:true});
 for(const route of ['/','/gallery','/lead/rules','/lead/staff']){await page.goto(base+route);if(route.startsWith('/lead/'))await page.getByRole('row').nth(1).waitFor();if(route==='/gallery'){await page.locator('.gallery-grid .card').first().waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.gallery-grid img')).every(i=>i.complete&&i.naturalWidth>0));}await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,route.replaceAll('/','-')+'-mobile.png'),fullPage:true});}
 console.log('追加画面検証成功：ギャラリー比較・基準の追加/編集/無効化・担当追加/責任者切替/在籍解除・390px幅');
};
