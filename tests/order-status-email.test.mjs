import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { buildStatusEmail, createOrderStatusWorker } from '../supabase/functions/order-status-email-worker/handler.ts';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const staff = '00000000-0000-0000-0000-000000000002';
const email = 'customer@example.invalid';
const historicalId = '00000000-0000-0000-0000-000000000011';

test('status outbox follows committed orders and preserves admin authorization', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(read('./fixtures/admin.sql'));
  await db.exec("ALTER TABLE orders ADD COLUMN email text; ALTER TABLE store_admins ADD COLUMN role text DEFAULT 'owner'");
  await db.exec("CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);");
  await db.query("INSERT INTO auth.users VALUES ($1,now()),($2,now())",[owner,staff]);
  await db.query("INSERT INTO store_admins VALUES ($1,true,'staff')",[staff]);
  const roles = read('../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql');
  await db.exec(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.get_store_admin_role'),roles.indexOf('CREATE OR REPLACE FUNCTION public.staff_inventory')));
  const workflow = read('../supabase/migrations/20261011163006_admin_workflow_audit.sql');
  await db.exec(workflow.slice(workflow.indexOf('CREATE OR REPLACE FUNCTION public.admin_transition_order'),workflow.indexOf('CREATE OR REPLACE FUNCTION public.admin_dashboard_summary')));
  await db.query("INSERT INTO orders(id,status,email,payment_method,payment_status,order_reference) VALUES($1,'shipped',$2,'COD','pending','CC-123')",[historicalId,email]);
  await db.exec(read('../supabase/migrations/20261115140801_order_status_email_outbox.sql'));

  const login = async (role='authenticated',sub=owner,aal='aal2') => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,aal})]);
    await db.exec('SET ROLE ' + role);
  };
  const add = async (method='COD', pay='pending', customer=email) => {
    await db.exec('RESET ROLE');
    return (await db.query("INSERT INTO orders(status,email,payment_method,payment_status,order_reference,courier_name,tracking_number) VALUES('pending',$1,$2,$3,'583104927618','Local courier','QA-123') RETURNING id",[customer,method,pay])).rows[0].id;
  };
  const transition = (id,status,remark=null,refund=false,reference=null) =>
    db.query('SELECT admin_transition_order($1,$2,$3,$4,$5)',[id,status,remark,refund,reference]);
  const ready = () => db.exec("RESET ROLE; UPDATE order_status_email_outbox SET available_at=now() WHERE state='pending'");
  const claim = async () => {
    await login('service_role');
    return (await db.query('SELECT public.claim_order_status_email() AS job')).rows[0].job;
  };
  const finish = (job,outcome) => db.query('SELECT finish_order_status_email($1,$2,$3)',[job.id,job.lease,outcome]);
  const list = async id => {
    await login();
    return (await db.query('SELECT * FROM admin_order_status_emails($1)',[[id]])).rows;
  };
  const saveTracking = (id, courier, number, url) =>
    db.query('SELECT admin_save_order_tracking($1,$2,$3,$4)',[id,courier,number,url]);

  const withoutTracking = (await db.query(
    "INSERT INTO orders(status,email,payment_method,payment_status,order_reference) VALUES('packed',$1,'COD','pending','583104927619') RETURNING id", [email]
  )).rows[0].id;
  await login();
  await assert.rejects(transition(withoutTracking,'shipped'),{
    code:'P0001', message:'Save a courier and tracking number before shipping',
  });
  assert.equal((await list(withoutTracking)).length,0);
  await db.exec('RESET ROLE');
  await db.exec(read('../supabase/migrations/20261115152152_allow_optional_order_courier_tracking.sql'));

  await t.test('shipping without tracking queues a clean email and admins can add and edit details later', async () => {
    for (const [role,sub,aal] of [['anon',owner,'aal2'],['authenticated',owner,'aal1'],['authenticated',staff,'aal2']]) {
      await login(role,sub,aal);
      await assert.rejects(transition(withoutTracking,'shipped'),{code:'42501'});
    }
    await login();
    await transition(withoutTracking,'shipped');
    await transition(withoutTracking,'shipped');
    assert.deepEqual((await list(withoutTracking)).map(row=>[row.order_status,row.state]),[['shipped','pending']]);

    await ready();
    const job = await claim();
    const { status, courier, trackingNumber, trackingUrl, paymentStatus } = job.payload;
    assert.deepEqual({status,courier,trackingNumber,trackingUrl,paymentStatus},
      {status:'shipped',courier:null,trackingNumber:null,trackingUrl:null,paymentStatus:'pending'});
    const message = buildStatusEmail(job.payload,'support@example.invalid');
    assert.match(message.subject,/Order shipped/);
    for (const body of [message.text,message.html]) {
      assert.doesNotMatch(body,/courier|tracking number/i);
      assert.match(body,/https:\/\/comicculture\.lk\/track-order/);
    }
    await finish(job,'sent');

    await login();
    await saveTracking(withoutTracking,'Local courier',null,null);
    await assert.rejects(saveTracking(withoutTracking,'Local courier','QA-456','http://courier.example.invalid/'),/must use HTTPS/);
    const url = 'https://courier.example.invalid/track/QA-456';
    await saveTracking(withoutTracking,'Local courier','QA-456',url);
    assert.deepEqual((await list(withoutTracking)).map(row=>[row.order_status,row.state]),[['shipped','sent']]);
    await db.exec('RESET ROLE');
    const saved = await db.query('SELECT status,payment_status,courier_name,tracking_number,tracking_url FROM orders WHERE id=$1',[withoutTracking]);
    assert.deepEqual(saved.rows,[{ status:'shipped',payment_status:'pending',courier_name:'Local courier',tracking_number:'QA-456',tracking_url:url }]);
    const audit = await db.query("SELECT event_type,count(*)::int AS count FROM admin_activity_log WHERE entity_id=$1 GROUP BY event_type ORDER BY event_type",[withoutTracking]);
    assert.deepEqual(audit.rows,[{event_type:'order_status_changed',count:1},{event_type:'order_tracking_updated',count:2}]);
  });

  await t.test('migration queues no historical emails and permissions follow MFA and roles', async () => {
    assert.equal((await list(historicalId)).length,0);
    for (const [role,sub,aal] of [['anon',owner,'aal2'],['authenticated',owner,'aal1'],['authenticated',staff,'aal2']]) {
      await login(role,sub,aal);
      await assert.rejects(db.query('SELECT * FROM admin_order_status_emails($1)',[[historicalId]]),{code:'42501'});
      await assert.rejects(db.query('SELECT admin_retry_order_status_email($1)',[historicalId]),{code:'42501'});
      await assert.rejects(db.query('SELECT claim_order_status_email()'),{code:'42501'});
      await assert.rejects(db.query('SELECT * FROM order_status_email_outbox'),{code:'42501'});
    }
  });
  await t.test('COD progresses once per status and original confirmation is not repeated', async () => {
    const id = await add();
    await login();
    await transition(id,'confirmed');
    await transition(id,'confirmed');
    assert.deepEqual((await list(id)).map(row=>[row.order_status,row.state,row.reason]),[['confirmed','skipped','covered_by_confirmation']]);
    const url = 'https://courier.example.invalid/track/QA-123';
    await saveTracking(id,'Local courier','QA-123',url);
    for (const status of ['packed','shipped','delivered']) {
      await login();
      await transition(id,status);
      await ready();
      const job = await claim();
      assert.equal(job.payload.status,status);
      if (status === 'shipped') {
        const message = buildStatusEmail(job.payload,'support@example.invalid');
        assert.match(message.text,/Courier: Local courier/);
        assert.match(message.text,/Tracking number: QA-123/);
        assert.ok(message.html.includes(`href="${url}"`));
      }
      assert.equal((await db.query('SELECT check_order_status_email_claim($1,$2) AS ok',[job.id,job.lease])).rows[0].ok,true);
      await finish(job,'sent');
    }
    const all = await list(id);
    assert.equal(all.filter(row=>row.state==='sent').length,3);
    assert.ok(all.filter(row=>row.state==='sent').every(row=>row.sent_at));
  });
  await t.test('bank verification queues confirmation and rapid transitions suppress stale claims', async () => {
    const id = await add('BANK_TRANSFER','awaiting_verification');
    await login();
    await db.query("SELECT admin_verify_order_payment($1,'paid')",[id]);
    await ready();
    const job = await claim();
    assert.equal(job.payload.status,'confirmed');
    assert.equal(job.payload.paymentStatus,'paid');
    await login();
    await transition(id,'packed');
    await transition(id,'shipped');
    await login('service_role');
    assert.equal((await db.query('SELECT check_order_status_email_claim($1,$2) AS ok',[job.id,job.lease])).rows[0].ok,false);
    await ready();
    const updated = await claim();
    assert.equal(updated.payload.status,'shipped');
    await finish(updated,'sent');
    assert.deepEqual((await list(id)).map(row=>[row.order_status,row.state]).sort(),[['confirmed','skipped'],['packed','skipped'],['shipped','sent']]);
  });
  await t.test('cancellation records accurate refund state and missing email is skipped', async () => {
    const id = await add('BANK_TRANSFER','paid');
    const noEmail = await add('COD','pending',null);
    await login();
    await assert.rejects(transition(id,'cancelled','Customer requested'),/completed refund/);
    assert.equal((await list(id)).length,0);
    await transition(id,'cancelled','Customer requested',true,'refund-qa');
    await transition(noEmail,'cancelled','Customer requested');
    await ready();
    const job = await claim();
    assert.equal(job.payload.paymentStatus,'refunded');
    assert.match(buildStatusEmail(job.payload,'support@example.invalid').text,/completed refund/);
    await finish(job,'sent');
    assert.equal((await list(noEmail))[0].reason,'missing_email');
  });
  await t.test('crashed worker leases, transient failure, retry eligibility and idempotency window', async () => {
    const id = await add();
    await login();
    await transition(id,'confirmed');
    await transition(id,'packed');
    await ready();
    const first = await claim();
    assert.equal(await claim(),null);
    await db.exec("RESET ROLE; UPDATE order_status_email_outbox SET lease_until=now()-interval '1 second' WHERE lease_id IS NOT NULL");
    const reclaimed = await claim();
    assert.equal(reclaimed.id,first.id);
    assert.notEqual(reclaimed.lease,first.lease);
    assert.deepEqual(reclaimed.payload,first.payload);
    await finish(first,'sent'); // an old worker cannot complete a new lease
    await finish(reclaimed,'temporary');
    assert.equal((await list(id)).find(row=>row.id===first.id).state,'pending');

    await ready();
    const third = await claim();
    await finish(third,'permanent');
    let row = (await list(id)).find(row=>row.id===first.id);
    assert.equal(row.state,'failed');
    assert.equal(row.retryable,true);
    await db.query('SELECT admin_retry_order_status_email($1)',[row.id]);
    await assert.rejects(db.query('SELECT admin_retry_order_status_email($1)',[row.id]),{code:'22023'});
    const retried = await claim();
    assert.equal(retried.id,first.id);
    await finish(retried,'permanent');
    await db.query("RESET ROLE");
    await db.query("UPDATE order_status_email_outbox SET first_attempt_at=now()-interval '24 hours' WHERE id=$1",[row.id]);
    await login('service_role');
    await db.query('SELECT clear_expired_order_status_email_payloads()');
    row = (await list(id)).find(row=>row.id===first.id);
    assert.equal(row.retryable,false);
    assert.equal(row.reason,'safety_window');
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM admin_activity_log WHERE event_type='order_status_email_retried'")).rows[0].n,1);
  });
});

test('worker authenticates, skips stale jobs and reuses the same provider key after an outage', async () => {
  const config = { supabaseUrl:'https://db.example.invalid', serviceKey:'test-service', workerSecret:'a'.repeat(48),
    resendApiKey:'test-resend', fromEmail:'ComicCulture <orders@example.invalid>', replyTo:'help@example.invalid' };
  const job = { id:'outbox-1', lease:'lease-1', payload:{ email, reference:'583104927618',status:'shipped',
    courier:'<Courier>',trackingNumber:'A"123',trackingUrl:'https://courier.example.invalid/scan?x=1&y=2',
    paymentMethod:'COD',paymentStatus:'pending' } };
  let available = false, stale = false, shouldFail = true;
  const sends = [], outcomes = [];
  const fetcher = async (url,options) => {
    if (url === 'https://api.resend.com/emails') {
      sends.push({ key:options.headers['Idempotency-Key'], mail:JSON.parse(options.body) });
      return new Response('{}',{status:shouldFail?503:200});
    }
    assert.ok(url.startsWith(config.supabaseUrl));
    assert.equal(options.headers.Authorization,'Bearer test-service');
    if (url.endsWith('/claim_order_status_email')) {
      const current = available ? job : null;
      available = false;
      return Response.json(current);
    }
    if (url.endsWith('/check_order_status_email_claim')) return Response.json(!stale);
    if (url.endsWith('/finish_order_status_email')) {
      outcomes.push(JSON.parse(options.body).p_outcome);
      return new Response(null,{status:204});
    }
    throw Error('unexpected RPC');
  };
  const request = secret => new Request('https://mock.example.invalid/worker',{method:'POST',headers:{'x-worker-secret':secret}});
  const handler = createOrderStatusWorker(config,fetcher);
  assert.equal((await handler(request('forged'))).status,403);
  for (const skip of [true,false,false]) {
    stale = skip;
    available = true;
    assert.equal((await handler(request(config.workerSecret))).status,200);
    if (!stale) shouldFail = false;
  }
  assert.deepEqual(outcomes,['temporary','sent']);
  assert.equal(sends[0].key,'order-status-outbox-1');
  assert.deepEqual(sends[0],sends[1]);
  assert.match(sends[0].mail.html,/&lt;Courier&gt;.*A&quot;123/s);
  assert.match(sends[0].mail.html,/https:\/\/courier\.example\.invalid\/scan\?x=1&amp;y=2/);
  assert.doesNotMatch(buildStatusEmail({...job.payload,trackingUrl:'https://person@courier.example.invalid/'},config.replyTo).html,/Open courier tracking/);
  assert.doesNotMatch(buildStatusEmail({...job.payload,trackingUrl:'javascript:alert(1)',trackingNumber:null,courier:null},config.replyTo).html,/Courier|javascript/);
  assert.match(buildStatusEmail({...job.payload,status:'cancelled'},config.replyTo).text,/No cash-on-delivery payment/);
  assert.match(buildStatusEmail({...job.payload,status:'cancelled',paymentMethod:'BANK_TRANSFER'},config.replyTo).text,/If you already transferred money/);
});

test('shipped emails omit placeholder details and malformed courier links', () => {
  const order = { email, reference:'583104927618',status:'shipped',paymentMethod:'COD',paymentStatus:'pending' };
  for (const placeholder of ['', '  ', 'N/A', '—', 'Pending', 'Not provided']) {
    const message = buildStatusEmail({
      ...order, courier:placeholder, trackingNumber:placeholder, trackingUrl:'https:courier.example.invalid/track',
    },'support@example.invalid');
    assert.doesNotMatch(message.text,/courier|tracking number/i);
    assert.doesNotMatch(message.html,/courier|tracking number/i);
  }
  const message = buildStatusEmail({
    ...order, courier:' Local courier ', trackingNumber:null, trackingUrl:null,
  },'support@example.invalid');
  assert.match(message.text,/Courier: Local courier\n/);
  assert.doesNotMatch(message.text,/Tracking number|Courier tracking/);
});

test('operator scheduling uses only Vault references and invokes the secured worker', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE SCHEMA vault; CREATE SCHEMA cron; CREATE SCHEMA net;
    CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    CREATE TABLE cron.jobs(name text PRIMARY KEY,schedule text,command text);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS integer LANGUAGE sql AS $$
      INSERT INTO cron.jobs VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET schedule=$2,command=$3 RETURNING 1;
    $$;
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(url,headers,body,timeout_milliseconds); $$;
  `);
  const script=read('../supabase/ops/schedule-order-status-emails.sql');
  await assert.rejects(db.exec(script),/Configure the order status worker URL and secret/);
  await db.exec('ROLLBACK');
  const url='https://abcdefghijklmnopqrst.supabase.co/functions/v1/order-status-email-worker';
  const secret='z'.repeat(48);
  await db.query("INSERT INTO vault.decrypted_secrets VALUES ('order_status_worker_url',$1),('order_status_worker_secret',$2)",[url,secret]);
  await db.exec(script);
  await db.exec(read('../supabase/ops/schedule-checkout-conversion-retention.sql'));
  await db.exec(script);
  const {rows}=await db.query('SELECT * FROM cron.jobs ORDER BY name');
  assert.deepEqual(rows.map(row=>[row.name,row.schedule]),[
    ['checkout-conversion-retention','23 * * * *'],['order-status-email-dispatch','* * * * *'],
    ['order-status-email-payload-cleanup','17 * * * *'],
  ]);
  assert.equal(rows[0].command,'SELECT public.prune_checkout_conversion();');
  assert.ok(!rows[1].command.includes(secret));
  const result=(await db.query(rows[1].command)).rows[0].http_post;
  assert.deepEqual(result,[url,{'Content-Type':'application/json','x-worker-secret':secret},{},55000]);
});


test('operational checks and configured verification cannot claim or email a customer job', async () => {
  const config = { supabaseUrl:'https://db.example.invalid', serviceKey:'test-service', workerSecret:'b'.repeat(48),
    resendApiKey:'test-resend', fromEmail:'ComicCulture <orders@example.invalid>', replyTo:'help@example.invalid',
    verificationRecipient:'owner-qa@example.invalid' };
  const sent = [];
  const fetcher = async (url, options) => {
    if (url === 'https://api.resend.com/emails') {
      sent.push({ email: JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
      return Response.json({ id:'verification-qa' });
    }
    assert.ok(url.endsWith('/check_order_status_email_claim'));
    assert.deepEqual(JSON.parse(options.body), {
      p_id:'00000000-0000-0000-0000-000000000000',p_lease:'00000000-0000-0000-0000-000000000000',
    });
    return Response.json(false);
  };
  const request = (operation, secret = config.workerSecret) => new Request('https://mock.example.invalid/worker', {
    method:'POST', headers:{'x-worker-secret':secret,'x-worker-operation':operation},
    body:JSON.stringify({to:'customer@example.invalid'}),
  });
  const handler = createOrderStatusWorker(config, fetcher);
  assert.equal((await handler(request('verify-resend','bad'))).status,403);
  assert.deepEqual(await (await handler(request('check'))).json(),{ operational:true });
  assert.equal(sent.length,0);
  for (let i=0;i<2;i++) {
    assert.deepEqual(await (await handler(request('verify-resend'))).json(),{ accepted:true, providerId:'verification-qa' });
  }
  assert.deepEqual(sent[0],sent[1]);
  assert.deepEqual(sent[0].email.to,['owner-qa@example.invalid']);
  assert.equal(sent[0].key,'order-status-worker-verification-v1');
  const disabled = createOrderStatusWorker({...config,verificationRecipient:undefined},fetcher);
  assert.equal((await disabled(request('verify-resend'))).status,403);
  assert.equal(sent.length,2);
});
