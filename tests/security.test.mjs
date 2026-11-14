import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url),'utf8');
const moduleUrl = source => {
  const emitted = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return `data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}`;
};
const contactUrl = moduleUrl(read('../supabase/functions/_shared/checkoutContact.ts'));
const handlerSource = read('../supabase/functions/checkout/handler.ts')
  .replace("'image-size'", JSON.stringify(import.meta.resolve('image-size')))
  .replace("'../_shared/checkoutContact.ts'", JSON.stringify(contactUrl));
const { createCheckoutHandler, receiptExtension } = await import(moduleUrl(handlerSource));
const origin = 'https://comicculture.lk';
const id = '00000000-0000-0000-0000-000000000099';
const config = {supabaseUrl:'https://database.example.invalid',serviceKey:'synthetic-secret',turnstileSecret:'synthetic-turnstile-secret',allowedOrigins:[origin]};
const contact = {
  fullName: "O’Connor-පෙරේරා", phone: '0771234567', mobilePhone: null,
  email: 'shopper@example.invalid', addressLine1: "12/3, King's Road",
  addressLine2: null, city: 'Colombo', district: 'Colombo', postalCode: '00100', paymentMethod: 'COD',
};
const request = (patch = {}, headers = {}) => new Request(`${origin}/checkout`,{
  method:'POST',headers:{origin,'Content-Type':'application/json','x-forwarded-for':'192.0.2.1',...headers},
  body:JSON.stringify({action:'order',requestId:id,token:'synthetic-token',input:contact,...patch}),
});

test('checkout gateway fails closed and gates writes before the order RPC',async t => {
  const calls = [];
  let verification = {success:true,action:'checkout',hostname:'comicculture.lk'};
  let limited = false;
  const fetcher = async (url, options) => {
    calls.push({url,body:options?.body});
    if (url.includes('consume_checkout_attempt')) return Response.json(!limited);
    if (url.includes('siteverify')) return Response.json(verification);
    if (url.includes('submit_checkout')) return Response.json({order_id:id});
    if (url.includes('get_order_tracking')) {
      const { p_phone } = JSON.parse(options.body);
      return Response.json(['011 234 5678', '0771234567'].includes(p_phone) ? {order_reference:'CC-1'} : null);
    }
    throw new Error('Unexpected network request');
  };
  const handler = createCheckoutHandler(config,fetcher);
  await t.test('unapproved origins never reach the backend',async()=>{
    calls.length=0;
    assert.equal((await handler(request({}, {origin:'https://untrusted.example'}))).status,403);
    assert.equal(calls.length,0);
  });
  await t.test('missing configuration never allows writes',async()=>{
    calls.length=0;
    assert.equal((await createCheckoutHandler({...config,turnstileSecret:''},fetcher)(request())).status,503);
    assert.ok(!calls.some(call=>call.url.includes('submit_checkout')));
  });
  await t.test('missing, expired, wrong-action, and wrong-host tokens cannot place orders',async()=>{
    for(const value of [{token:''}, {verification:{success:false}}, {verification:{success:true,action:'login',hostname:'comicculture.lk'}}, {verification:{success:true,action:'checkout',hostname:'localhost'}}]){
      calls.length=0; verification=value.verification??{success:true,action:'checkout',hostname:'comicculture.lk'};
      assert.equal((await handler(request(value.token===undefined?{}:{token:value.token}))).status,403);
      assert.ok(!calls.some(call=>call.url.includes('submit_checkout')));
    }
  });
  await t.test('rate-limited requests cannot consume stock or verify tokens',async()=>{
    calls.length=0;limited=true;
    assert.equal((await handler(request())).status,429);
    assert.ok(!calls.some(call=>call.url.includes('siteverify')||call.url.includes('submit_checkout')));
    limited=false;
  });
  await t.test('valid verification forwards one request with its idempotency key',async()=>{
    calls.length=0;verification={success:true,action:'checkout',hostname:'comicculture.lk'};
    assert.equal((await handler(request())).status,200);
    assert.equal(calls.filter(call=>call.url.includes('submit_checkout')).length,1);
    const forwarded=JSON.parse(calls.find(call=>call.url.includes('submit_checkout')).body);
    assert.equal(forwarded.p_request_id,id);
    assert.ok(!calls.filter(call=>call.url.includes('consume_checkout_attempt')).some(call=>call.body.includes('192.0.2.1')));
  });
  await t.test('invalid contact inputs never reach the order RPC', async () => {
    const invalid = [
      ...[undefined, '', null, 771234567, [], '077123456', '07712345678', '077ABC4567',
        '07712<script>', '0771234567\n', '07+71234567', '+950771234567',
        '+9-4771234567', '+940771234567', '0071234567', '7'.repeat(1000)].map(phone => ({phone})),
      {mobilePhone:'0112345678'}, {mobilePhone:false}, {addressLine1:{}}, {addressLine2:'a'.repeat(301)},
      {fullName:' '}, {fullName:'name\u0000'}, {city:[]}, {email:'invalid'}, {email:'a'.repeat(255)},
      {district:'Outside Sri Lanka'}, {postalCode:'01x00'}, {paymentMethod:'OTHER'},
      {paymentMethod:'BANK_TRANSFER', receiptPath:1}, {promoCode:{}},
    ];
    for (const patch of invalid) {
      calls.length = 0;
      assert.equal((await handler(request({input:{...contact,...patch}}))).status,400, JSON.stringify(patch));
      assert.ok(!calls.some(call => call.url.includes('submit_checkout')));
    }
  });
  await t.test('valid local and international contacts remain text and preserve the retry payload', async () => {
    for (const phone of ['0771234567', '+94771234567', '0112345678', '+94 11-234-5678']) {
      calls.length = 0;
      const input = {...contact, phone, mobilePhone:'+94 77-123-4567'};
      assert.equal((await handler(request({input}))).status,200);
      const forwarded = JSON.parse(calls.find(call => call.url.includes('submit_checkout')).body);
      assert.deepEqual(forwarded.p_payload,input);
    }
  });
  await t.test('tracking checks the legacy value first and falls back to the national format', async () => {
    for (const [phone, expected] of [['011 234 5678',['011 234 5678']], ['+94 77-123-4567',['+94 77-123-4567','0771234567']]]) {
      calls.length = 0;
      const response = await handler(request({action:'track',input:{phone,orderReference:'CC-1'}}));
      assert.deepEqual(await response.json(),{order_reference:'CC-1'});
      assert.deepEqual(calls.filter(call=>call.url.includes('get_order_tracking')).map(call=>JSON.parse(call.body).p_phone),expected);
    }
  });
  await t.test('only recognized pricing conflicts become actionable checkout errors', async () => {
    for (const [dbCode, code, status] of [
      ['CC001', 'delivery_fee_changed', 409],
      ['CC002', 'order_total_changed', 409],
      ['23514', undefined, 400],
    ]) {
      const verify = createCheckoutHandler(config, async url => {
        if (url.includes('consume_checkout_attempt')) return Response.json(true);
        if (url.includes('siteverify')) return Response.json({success:true, action:'checkout', hostname:'comicculture.lk'});
        return Response.json({code: dbCode, message: 'Private database details'}, {status: 400});
      });
      const result = await verify(request());
      assert.equal(result.status, status);
      const body = await result.json();
      assert.equal(body.code, code);
      assert.doesNotMatch(body.error, /Private database details/);
    }
  });
  await t.test('oversized actual bodies and invalid JSON are rejected',async()=>{
    assert.equal((await handler(new Request(`${origin}/checkout`,{method:'POST',headers:{origin},body:'x'.repeat(65537)}))).status,413);
    assert.equal((await handler(new Request(`${origin}/checkout`,{method:'POST',headers:{origin},body:'{'}))).status,400);
  });
  await t.test('HTML disguised as a receipt fails content validation',()=>{
    assert.throws(()=>receiptExtension(new TextEncoder().encode('<html><script>alert(1)</script></html>'),'image/png'));
  });
  await t.test('valid image uploads receive a server path and register ownership; retention selects only old unclaimed receipts',async()=>{
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8eoAAAAASUVORK5CYII=','base64');
    const storageCalls=[];
    const uploadHandler=createCheckoutHandler(config,async(url,options)=>{
      storageCalls.push({url,options});
      if(url.includes('consume_checkout_attempt')) return Response.json(true);
      if(url.includes('siteverify')) return Response.json({success:true,action:'checkout',hostname:'comicculture.lk'});
      if(url.includes('checkout_receipts?') && !options.method) return Response.json([{path:'old-session/abandoned.png'}]);
      return Response.json({});
    });
    const result=await uploadHandler(new Request(`${origin}/checkout`,{method:'POST',headers:{origin,'Content-Type':'image/png','x-checkout-id':id,'x-turnstile-token':'synthetic-token'},body:png}));
    assert.equal(result.status,200);
    const data=await result.json();assert.ok(data.path.startsWith(`${id}/`)&&data.path.endsWith('.png'));
    const registration=storageCalls.find(call=>call.url.endsWith('/rest/v1/checkout_receipts'));
    assert.deepEqual(JSON.parse(registration.options.body),{path:data.path,request_id:id});
    const cleanup=new URL(storageCalls.find(call=>call.url.includes('checkout_receipts?')&&!call.options.method).url);
    assert.equal(cleanup.searchParams.get('order_id'),'is.null');
    assert.ok(cleanup.searchParams.get('created_at').startsWith('lt.'));
    assert.equal(cleanup.searchParams.get('limit'),'10');
    assert.deepEqual(JSON.parse(storageCalls.find(call=>call.url.includes('/storage/')&&call.options.method==='DELETE').options.body).prefixes,['old-session/abandoned.png']);
  });
  await t.test('a failed verifier never reaches order creation',async()=>{
    let submitted=false;
    const failed=createCheckoutHandler(config,async url=>{
      if(url.includes('consume_checkout_attempt'))return Response.json(true);
      if(url.includes('siteverify'))throw new Error('Synthetic network outage');
      submitted=true;return Response.json({});
    });
    assert.equal((await failed(request())).status,503);assert.equal(submitted,false);
  });
});

test('security migrations preserve checkout transactions and enforce role boundaries in PostgreSQL',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(read('./fixtures/admin.sql'));
  await db.exec(`
    ALTER ROLE service_role BYPASSRLS;
    ALTER TABLE store_admins ADD COLUMN role text DEFAULT 'owner';
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Customers can upload payment receipts" ON storage.objects FOR INSERT TO anon WITH CHECK(bucket_id='payment-receipts');
    CREATE TABLE storage.buckets(id text PRIMARY KEY,file_size_limit bigint,allowed_mime_types text[]);
    INSERT INTO storage.buckets(id) VALUES('product-images');
    CREATE SEQUENCE order_reference_seq;
    ALTER TABLE orders ADD COLUMN full_name text NOT NULL, ADD COLUMN phone text NOT NULL, ADD COLUMN mobile_phone text,
      ADD COLUMN email text, ADD COLUMN address_line1 text NOT NULL, ADD COLUMN address_line2 text, ADD COLUMN city text,
      ADD COLUMN district text, ADD COLUMN postal_code text, ADD COLUMN subtotal numeric, ADD COLUMN delivery_fee numeric,
      ADD COLUMN total numeric, ADD COLUMN promo_code text, ADD COLUMN discount_amount numeric DEFAULT 0;
    ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE order_items ADD COLUMN slug text,ADD COLUMN image text,ADD COLUMN sku text,ADD COLUMN price numeric,
      ADD COLUMN is_preorder boolean,ADD COLUMN preorder_days integer;
    ALTER TABLE order_notification_state ALTER COLUMN notification_token SET DEFAULT gen_random_uuid();
    CREATE TABLE promo_redemptions(promo_code_id uuid,order_id uuid,discount_amount numeric);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated;
    GRANT SELECT ON public.product_version_sizes TO service_role;
    UPDATE product_version_sizes SET stock=10;
  `);
  const integrity=read('../supabase/migrations/20261011153729_audit_catalog_order_integrity.sql');
  await db.exec(integrity.slice(integrity.indexOf('CREATE OR REPLACE FUNCTION public.create_order('),integrity.indexOf('-- Save a complete admin product edit')));
  const wrapper=read('../supabase/migrations/20261010010000_require_customer_email_on_orders.sql');
  await db.exec(wrapper.slice(wrapper.indexOf('CREATE OR REPLACE FUNCTION'),wrapper.indexOf('REVOKE ALL')));
  const promo=read('../supabase/migrations/20261011020000_add_server_validated_promotions.sql');
  await db.exec(promo.slice(promo.indexOf('create or replace function public.preview_promo_code'),promo.lastIndexOf('commit;')));
  const notification=read('../supabase/migrations/20261011030000_secure_order_notifications.sql');
  await db.exec(notification.slice(notification.indexOf('create function public.create_order_with_notification_token'),notification.indexOf('create function public.claim_order_notification')));
  await db.exec(notification.split(/\r?\n/).filter(line => line.startsWith('revoke all on function public.create_order(')).join('\n'));
  // Only required so the migration can revoke the historical tracking grant.
  await db.exec(`CREATE FUNCTION public.get_order_tracking(text,text,text) RETURNS json LANGUAGE sql AS $$ SELECT NULL::json; $$;`);
  await db.exec(read('../supabase/migrations/20261026114608_security_checkout_boundary.sql'));
  await db.exec(read('../supabase/migrations/20261026114635_security_admin_and_uploads.sql'));
  await db.exec(read('../supabase/migrations/20261026120954_security_activate_boundary.sql'));
  const payload={fullName:'Test customer',phone:'0771234567',email:' SHOPPER@EXAMPLE.INVALID ',addressLine1:'Test address',city:'Colombo',district:'Colombo',paymentMethod:'COD',items:[{version_size_id:'00000000-0000-0000-0000-000000000030',quantity:1}]};
  const submit=(input=payload,requestId=crypto.randomUUID())=>db.query('SELECT public.submit_checkout($1,$2) AS result',[requestId,JSON.stringify(input)]);
  const stock=async()=>Number((await db.query('SELECT stock FROM product_version_sizes')).rows[0].stock);
  const login=async(role,claims={})=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);await db.exec(`SET ROLE ${role}`);};
  await t.test('public users cannot call the old checkout, tracking, promo, or new write gateway RPCs',async()=>{
    await login('anon');
    await assert.rejects(submit(),/permission denied/);
    for(const name of ['submit_checkout','create_order','create_order_with_notification_token','get_order_tracking','preview_promo_code']){
      await db.exec('RESET ROLE');
      const result=await db.query("SELECT has_function_privilege('anon',oid,'EXECUTE') AS allowed FROM pg_proc WHERE proname=$1",[name]);
      assert.ok(result.rows.every(row=>!row.allowed));
    }
    await login('service_role');
  });
  await t.test('valid order prices remain authoritative; retry returns same order and decrements stock once',async()=>{
    const result=(await submit({...payload,total:0},id)).rows[0].result;
    assert.equal(Number(result.total),450);assert.equal(await stock(),9);
    const retry=(await submit({...payload,total:0},id)).rows[0].result;
    assert.equal(retry.order_id,result.order_id);assert.equal(await stock(),9);
    await assert.rejects(submit({...payload,fullName:'Different'},id),/already used/);
  });
  await t.test('invalid email, null payment, blank address, excess cart entries, and bad quantity roll back all stock changes',async()=>{
    for(const patch of [{email:null},{email:'invalid'},{paymentMethod:null},{addressLine1:''},{city:null},{items:Array(51).fill(payload.items[0])},{items:[{...payload.items[0],quantity:1.5}]}]){
      await assert.rejects(submit({...payload,...patch}));assert.equal(await stock(),9);
    }
  });
  await t.test('bank receipt must exist and belong to the exact checkout session',async()=>{
    const bankId=crypto.randomUUID(),path=`${bankId}/proof.png`;
    await assert.rejects(submit({...payload,paymentMethod:'BANK_TRANSFER',receiptPath:path},bankId),/receipt/);
    await db.exec('RESET ROLE');
    await db.query('INSERT INTO checkout_receipts(path,request_id) VALUES($1,$2)',[path,bankId]);
    await login('service_role');
    await assert.rejects(submit({...payload,paymentMethod:'BANK_TRANSFER',receiptPath:path},crypto.randomUUID()),/receipt/);
    await assert.rejects(submit({...payload,paymentMethod:'BANK_TRANSFER',receiptPath:path},bankId),/receipt/);
    await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects VALUES('payment-receipts',$1)",[path]);
    await login('service_role');
    const result=(await submit({...payload,paymentMethod:'BANK_TRANSFER',receiptPath:path},bankId)).rows[0].result;
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT payment_status FROM orders WHERE id=$1',[result.order_id])).rows[0].payment_status,'awaiting_verification');
    assert.equal((await db.query('SELECT order_id FROM checkout_receipts WHERE path=$1',[path])).rows[0].order_id,result.order_id);
  });
  await t.test('rate-limit counters enforce the threshold and anonymous clients cannot bypass them',async()=>{
    await login('service_role');
    const attempt=()=>db.query("SELECT consume_checkout_attempt('synthetic-key',2) AS allowed");
    assert.equal((await attempt()).rows[0].allowed,true);assert.equal((await attempt()).rows[0].allowed,true);assert.equal((await attempt()).rows[0].allowed,false);
    await login('anon');await assert.rejects(attempt(),/permission denied/);
  });
  await t.test('MFA is required in the database, and a strong token alone is not admin membership',async()=>{
    const uid='00000000-0000-0000-0000-000000000001';
    const allowed=async()=>Boolean((await db.query('SELECT is_store_admin() AS allowed')).rows[0].allowed);
    await login('authenticated',{sub:uid,aal:'aal1'});assert.equal(await allowed(),false);
    await login('authenticated',{sub:uid,aal:'aal2'});assert.equal(await allowed(),true);
    await login('authenticated',{sub:'00000000-0000-0000-0000-000000000002',aal:'aal2'});assert.equal(await allowed(),false);
  });
  await t.test('whole-table privileges and unrestricted receipt upload policy are gone',async()=>{
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT has_table_privilege('anon','orders','TRUNCATE') AS allowed")).rows[0].allowed,false);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_policies WHERE policyname='Customers can upload payment receipts'")).rows[0].count,0);
  });
  await t.test('delivery settings preserve snapshots and enforce the current quote for both payment methods', async () => {
    const owner = '00000000-0000-0000-0000-000000000001';
    const admin = '00000000-0000-0000-0000-000000000002';
    const staff = '00000000-0000-0000-0000-000000000003';
    const inactive = '00000000-0000-0000-0000-000000000004';
    await db.exec('RESET ROLE');
    await db.exec(`
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);
      INSERT INTO auth.users VALUES ('${owner}', now()), ('${admin}', now()), ('${staff}', now()), ('${inactive}', now());
      INSERT INTO store_admins(user_id, is_active, role)
      VALUES ('${admin}', true, 'admin'), ('${staff}', true, 'staff'), ('${inactive}', false, 'admin');
    `);
    const permissions = read('../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql');
    await db.exec(permissions.slice(permissions.indexOf('CREATE OR REPLACE FUNCTION public.get_store_admin_role'), permissions.indexOf('CREATE OR REPLACE FUNCTION public.staff_inventory')));
    const audit = read('../supabase/migrations/20261011163006_admin_workflow_audit.sql');
    await db.exec(audit.slice(audit.indexOf('CREATE OR REPLACE FUNCTION public.log_admin_record_change'), audit.indexOf('CREATE TRIGGER admin_audit_products')));
    const historicalOrders = () => db.query('SELECT id, subtotal, delivery_fee, total FROM orders ORDER BY id').then(result => result.rows);
    const historical = await historicalOrders();
    await db.exec(read('../supabase/migrations/20261112113607_centralize_delivery_fee.sql'));

    const readFee = () => db.query('SELECT delivery_fee FROM delivery_settings').then(result => Number(result.rows[0].delivery_fee));
    const saveFee = value => db.query('UPDATE delivery_settings SET delivery_fee = $1 RETURNING delivery_fee', [value]);
    await login('anon');
    assert.equal(await readFee(), 350);
    await assert.rejects(saveFee(0), /permission denied/);
    for (const claims of [{sub:owner,aal:'aal1'}, {sub:staff,aal:'aal2'}, {sub:inactive,aal:'aal2'}, {sub:crypto.randomUUID(),aal:'aal2'}]) {
      await login('authenticated', claims);
      assert.equal((await saveFee(0)).rows.length, 0);
    }
    await login('authenticated', {sub:admin,aal:'aal2'});
    for (const invalid of [-1, 0.001, 100000000, 'NaN', 'Infinity', '-Infinity', null]) {
      await assert.rejects(saveFee(invalid), /constraint/);
    }
    assert.equal((await saveFee(475.25)).rows.length, 1);
    await assert.rejects(db.exec('DELETE FROM delivery_settings'), /permission denied/);
    await assert.rejects(db.exec('UPDATE delivery_settings SET id = 2'), /permission denied/);
    await login('anon');
    assert.equal(await readFee(), 475.25);

    await login('service_role');
    const initialStock = await stock();
    const beforeChangeRetry = (await submit({...payload,total:0,expectedDeliveryFee:475.25,expectedTotal:575.25},id)).rows[0].result;
    assert.ok(historical.some(order => order.id === beforeChangeRetry.order_id));
    assert.equal(Number(beforeChangeRetry.total),450);
    const codId = crypto.randomUUID();
    await assert.rejects(submit(payload, codId), {code:'CC001'});
    await assert.rejects(submit({...payload,expectedDeliveryFee:0,expectedTotal:100}, codId), {code:'CC001'});
    await assert.rejects(submit({...payload,expectedDeliveryFee:475.25,expectedTotal:0}, codId), {code:'CC002'});
    await assert.rejects(submit({...payload,expectedDeliveryFee:'475.25',expectedTotal:575.25}, codId), /Invalid checkout quote/);
    assert.equal(await stock(), initialStock);
    assert.equal((await db.query('SELECT * FROM checkout_requests WHERE id=$1',[codId])).rows.length, 0);
    await login('authenticated', {sub:owner,aal:'aal2'});
    assert.equal(Number((await saveFee(0)).rows[0].delivery_fee), 0);
    await login('service_role');
    const cod = (await submit({...payload,expectedDeliveryFee:0,expectedTotal:100}, codId)).rows[0].result;
    assert.deepEqual([cod.subtotal,cod.delivery_fee,cod.total].map(Number), [100,0,100]);
    assert.equal(await stock(), initialStock-1);

    await login('authenticated', {sub:admin,aal:'aal2'});
    await saveFee(475.25);
    await db.exec('RESET ROLE');
    const bankId = crypto.randomUUID();
    const path = `${bankId}/test.png`;
    await db.query('INSERT INTO checkout_receipts(path,request_id) VALUES($1,$2)', [path,bankId]);
    await db.query("INSERT INTO storage.objects VALUES('payment-receipts',$1)", [path]);
    await db.exec("INSERT INTO promo_codes(code,discount_type,discount_value,minimum_subtotal) VALUES('TEST20','fixed',20,0)");
    await login('service_role');
    const bank = {...payload,paymentMethod:'BANK_TRANSFER',receiptPath:path,promoCode:'TEST20'};
    await assert.rejects(submit({...bank,expectedDeliveryFee:0,expectedTotal:80}, bankId), {code:'CC001'});
    await assert.rejects(submit({...bank,expectedDeliveryFee:475.25,expectedTotal:575.25}, bankId), {code:'CC002'});
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT usage_count FROM promo_codes WHERE code='TEST20'")).rows[0].usage_count, 0);
    assert.equal((await db.query('SELECT order_id FROM checkout_receipts WHERE path=$1',[path])).rows[0].order_id, null);
    assert.equal(await stock(), initialStock-1);
    await login('service_role');
    const confirmed = (await submit({...bank,expectedDeliveryFee:475.25,expectedTotal:555.25,deliveryFee:0,total:0}, bankId)).rows[0].result;
    assert.deepEqual([confirmed.subtotal,confirmed.delivery_fee,confirmed.total].map(Number), [100,475.25,555.25]);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT payment_status FROM orders WHERE id=$1',[confirmed.order_id])).rows[0].payment_status, 'awaiting_verification');
    assert.equal(await stock(), initialStock-2);
    assert.deepEqual((await historicalOrders()).filter(order => historical.some(prior => prior.id === order.id)), historical);
    const auditRows = (await db.query("SELECT actor_id, entity_id, after_data FROM admin_activity_log WHERE entity_type='delivery_settings'")).rows;
    assert.ok(auditRows.some(row => row.actor_id === admin && row.entity_id === '1' && row.after_data.delivery_fee === 475.25));
  });
});
