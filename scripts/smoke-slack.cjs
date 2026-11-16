const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async({page,context,base,out,batchId})=>{
 // 本物のSlackには接続しない。未設定または認可画面へのredirectのみ確認。
 const login=await context.request.get(base+'/api/auth/slack/login',{maxRedirects:0});
 assert.equal(login.status(),303);assert.ok(login.headers().location==='/login?error=slack_config'||login.headers().location.startsWith('https://slack.com/openid/connect/authorize?'));
 const callback=await context.request.get(base+'/api/auth/slack/callback?state=bad&code=bad',{maxRedirects:0});assert.equal(callback.status(),303);assert.ok(callback.headers().location.startsWith('/login?error='));
 await page.goto(base+'/login?error=unregistered&slack_user_id=U123TEST');
 await page.getByText('広報担当に登録されていません。広報責任者に追加を依頼してください',{exact:false}).waitFor();
 assert.equal(await page.getByLabel('あなたの Slack ユーザーID').inputValue(),'U123TEST');await page.getByRole('button',{name:'IDをコピー'}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'slack-unregistered-mobile.png'),fullPage:true});
 // 登録待ちの画面はAPIレスポンスをモックし、追加自体はローカルD1に実行する。
 const user='UWAIT'+Date.now();let shown=true;
 await page.route('**/api/lead/staff',async route=>{
  if(route.request().method()!=='GET')return route.continue();
  const response=await route.fetch();const data=await response.json();
  data.pending=shown?[{slack_user_id:user,display_name:'登録待ちスモーク',attempted_at:new Date().toISOString()}]:[];
  await route.fulfill({response,json:data});
 });
 await page.goto(base+'/lead/staff');await page.getByRole('heading',{name:'登録待ちのログイン（直近20人）'}).waitFor();
 await page.getByRole('button',{name:'広報担当に追加',exact:true}).waitFor();shown=false;await page.getByRole('button',{name:'広報担当に追加',exact:true}).click();await page.getByText('登録待ちのログインはありません。').waitFor();
 const row=page.getByRole('row').filter({hasText:user});await row.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'pending-staff-mobile.png'),fullPage:true});await row.getByRole('button',{name:'在籍を解除',exact:true}).click();await row.getByRole('button',{name:'在籍に戻す',exact:true}).waitFor();await page.unroute('**/api/lead/staff');
 // 空ギャラリーと通信失敗を分けて表示する。
 await page.route('**/api/gallery',route=>route.fulfill({json:{photos:[]}}));await page.goto(base+'/gallery');await page.getByText('加工済みの写真はまだありません。').waitFor();await page.unroute('**/api/gallery');
 let failed=true;
 await page.route('**/api/batches/'+batchId,async route=>{
  const response=await route.fetch(),data=await response.json();
  data.photos=data.photos.slice(0,1);if(failed){data.photos[0].status='failed';data.photos[0].error='判定に失敗しました。再試行してください。';}
  await route.fulfill({response,json:data});
 });
 await page.route('**/api/photos/*/detect',async route=>{failed=false;await route.fulfill({json:{ok:true}});});
 await page.goto(base+'/batches/'+batchId);await page.getByText('判定失敗',{exact:true}).waitFor();await page.getByRole('button',{name:'失敗した判定をやり直す'}).click();await page.getByText('判定失敗',{exact:true}).waitFor({state:'detached'});
 await page.unroute('**/api/batches/'+batchId);await page.unroute('**/api/photos/*/detect');
 await page.goto(base+'/batches/'+batchId);const zip=page.waitForEvent('download');await page.getByRole('button',{name:'まとめてダウンロード'}).click();const download=await zip;assert.ok(download.suggestedFilename().endsWith('.zip'));
 const big=await context.request.post(base+'/api/batches/'+batchId+'/photos',{headers:{Origin:base,'Content-Type':'image/jpeg'},data:Buffer.alloc(5*1024*1024+1)});assert.equal(big.status(),413);assert.match((await big.json()).error.message,/5MB/);
 console.log('Slack設定/不正callback・未登録IDコピー・登録待ちから追加・空ギャラリー・ZIP・5MB超過・390px成功');
};
