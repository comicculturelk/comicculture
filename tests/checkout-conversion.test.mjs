import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const owner = '00000000-0000-0000-0000-000000000001';
const staff = '00000000-0000-0000-0000-000000000002';
const uuid = () => crypto.randomUUID();

test('conversion migration and reporting work independently of the status outbox', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(read('./fixtures/admin.sql'));
  await db.exec("ALTER TABLE store_admins ADD COLUMN role text DEFAULT 'owner'; CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);");
  await db.query("INSERT INTO auth.users VALUES ($1,now()),($2,now())",[owner,staff]);
  await db.query("INSERT INTO store_admins VALUES ($1,true,'staff')",[staff]);
  const roles = read('../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql');
  await db.exec(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.get_store_admin_role'),roles.indexOf('CREATE OR REPLACE FUNCTION public.staff_inventory')));
  // Isolate the transaction boundary here. The security suite exercises
  // the wrapper against real COD and bank-transfer order creation and stock.
  await db.exec(String.raw`
    CREATE TABLE public.checkout_requests(id uuid PRIMARY KEY,result jsonb);
    CREATE FUNCTION public.submit_checkout(p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE saved jsonb;
    BEGIN
      IF p_payload ? 'fail' THEN RAISE EXCEPTION 'Synthetic checkout rejection'; END IF;
      INSERT INTO public.checkout_requests VALUES(p_request_id,NULL) ON CONFLICT DO NOTHING;
      SELECT result INTO saved FROM public.checkout_requests WHERE id=p_request_id FOR UPDATE;
      IF saved IS NOT NULL THEN RETURN saved; END IF;
      saved:=jsonb_build_object('order_id',gen_random_uuid());
      UPDATE public.checkout_requests SET result=saved WHERE id=p_request_id;
      RETURN saved;
    END;
    $$;
    REVOKE ALL ON FUNCTION public.submit_checkout(uuid,jsonb) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.submit_checkout(uuid,jsonb) TO service_role;
  `);
  await db.exec(read('../supabase/migrations/20261115140806_checkout_conversion_analytics.sql'));

  const login = async (role='authenticated',sub=owner,aal='aal2') => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub,aal})]);
    await db.exec('SET ROLE ' + role);
  };
  const record = (session,stage,device='desktop',product=stage==='checkout'?null:'test-product') =>
    db.query('SELECT record_checkout_conversion_event($1,$2,$3,$4)',[session,stage,device,product]);
  const report = async (range='30d') => (await db.query('SELECT admin_checkout_conversion($1) AS report',[range])).rows[0].report;
  const checkout = async (session,request=uuid(),payload={}) =>
    (await db.query('SELECT submit_checkout_with_conversion($1,$2,$3) AS result',[request,JSON.stringify(payload),session])).rows[0].result;

  await t.test('empty reporting, valid periods, raw records and launch gates', async () => {
    for (const [role,sub,aal] of [['anon',owner,'aal2'],['authenticated',owner,'aal1'],['authenticated',staff,'aal2']]) {
      await login(role,sub,aal);
      await assert.rejects(report(),{code:'42501'});
      await assert.rejects(record(uuid(),'view'),{code:'42501'});
      await assert.rejects(checkout(uuid()),{code:'42501'});
      await assert.rejects(db.query('SELECT * FROM checkout_conversion_events'),{code:'42501'});
    }
    await login();
    for (const range of ['today','7d','30d','90d','all']) {
      const result = await report(range);
      assert.deepEqual([result.viewed,result.added,result.started,result.purchased,result.attributed_orders],[0,0,0,0,0]);
      assert.deepEqual(result.products,[]);
    }
    await assert.rejects(report('forever'),{code:'22023'});
  });

  await t.test('deduplication, ordered funnel, device buckets and genuine placements', async () => {
    const mobile=uuid(), desktop=uuid(), abandoned=uuid(), noView=uuid(), earlyCart=uuid(), old=uuid();
    await login('service_role');
    for (const [stage,device,product] of [['purchase','mobile',null],['view','fingerprint','test-product'],['view','desktop','unknown-product'],['checkout','desktop','test-product']]) {
      await assert.rejects(record(uuid(),stage,device,product),{code:'22023'});
    }
    await record(mobile,'view','mobile');
    await record(mobile,'view','desktop');
    await record(mobile,'cart','mobile');
    await record(mobile,'checkout','mobile');
    const request = uuid();
    const success = await checkout(mobile,request);
    assert.deepEqual(await checkout(mobile,request),success);

    await record(desktop,'view');
    await record(desktop,'cart');
    await record(desktop,'checkout');
    await assert.rejects(checkout(desktop,uuid(),{fail:true}),/Synthetic checkout rejection/);

    await record(abandoned,'view');
    await record(noView,'checkout','unknown');
    assert.ok((await checkout(noView)).order_id);
    await record(earlyCart,'cart');
    await record(earlyCart,'view');
    await record(earlyCart,'checkout');
    await record(old,'view');
    await db.query('RESET ROLE');
    await db.query("UPDATE checkout_conversion_sessions SET created_at=now()-interval '25 hours' WHERE id=$1",[old]);
    await login('service_role');
    await record(old,'cart');
    assert.ok((await checkout(old)).order_id);
    assert.ok((await checkout(uuid())).order_id);
    await login();
    const all = await report();
    assert.deepEqual([all.viewed,all.added,all.started,all.purchased,all.attributed_orders],[5,2,2,1,2]);
    assert.deepEqual(all.devices.find(device=>device.device==='mobile'),{device:'mobile',viewed:1,added:1,started:1,purchased:1});
    assert.deepEqual(all.products,[{product_id:'test-product',product_name:'Test product',views:5,adds:3}]);
    await db.query('RESET ROLE');
    assert.ok((await db.query("SELECT bool_and(event_key ~ '^[a-f0-9]{64}$') AS opaque FROM checkout_conversion_events WHERE stage='purchase'")).rows[0].opaque);
  });

  await t.test('Colombo boundaries and retention limit both results and storage', async () => {
    const yesterday=uuid(), expired=uuid();
    await db.exec("RESET ROLE; SET TIME ZONE 'America/New_York'");
    await db.query(String.raw`
      INSERT INTO checkout_conversion_sessions(id,device,created_at) VALUES
        ($1,'desktop',date_trunc('day',now() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo' - interval '1 second'),
        ($2,'mobile',now()-interval '91 days');
    `,[yesterday,expired]);
    await db.query("INSERT INTO checkout_conversion_events SELECT id,'view','test-product',created_at FROM checkout_conversion_sessions WHERE id IN ($1,$2)",[yesterday,expired]);
    await login();
    const today=await report('today'), week=await report('7d'), all=await report('all');
    assert.equal(week.viewed,today.viewed+1);
    assert.equal(all.viewed,week.viewed);
    assert.equal(today.start,today.end);
    await login('service_role');
    await db.exec('SELECT prune_checkout_conversion()');
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int AS count FROM checkout_conversion_events WHERE session_id=$1',[expired])).rows[0].count,0);
  });

  await t.test('analytics write failure preserves checkout and cannot add a purchase on retry', async () => {
    const session=uuid(), request=uuid();
    await login('service_role');
    await record(session,'checkout');
    await db.exec("RESET ROLE; ALTER TABLE checkout_conversion_events ADD CONSTRAINT simulate_failure CHECK(stage <> 'purchase') NOT VALID");
    await login('service_role');
    const order=await checkout(session,request);
    assert.ok(order.order_id);
    await db.exec('RESET ROLE; ALTER TABLE checkout_conversion_events DROP CONSTRAINT simulate_failure');
    await login('service_role');
    assert.deepEqual(await checkout(session,request),order);
    await db.exec('RESET ROLE');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM checkout_conversion_events WHERE session_id=$1 AND stage='purchase'",[session])).rows[0].n,0);
  });

  if (process.env.COMICCULTURE_CONVERSION_FIXTURE) {
    await db.exec(`
      INSERT INTO public.products (id,name,slug) VALUES
        ('demo-1','Arc Reactor','demo-1'),('demo-2','Webwaves','demo-2'),
        ('demo-3','Warrior King','demo-3'),('demo-4','Night Patrol','demo-4');
      WITH samples AS (
        SELECT gen_random_uuid() AS id, n,
          now() - make_interval(days=>1+n%22,hours=>n%12) AS started
        FROM generate_series(1,180) n
      ), visits AS (
        INSERT INTO checkout_conversion_sessions(id,device,created_at)
        SELECT id,CASE WHEN n%3=0 THEN 'desktop' ELSE 'mobile' END,started FROM samples
        RETURNING id
      )
      INSERT INTO checkout_conversion_events(session_id,stage,event_key,occurred_at)
      SELECT s.id,a.stage,CASE WHEN a.stage='purchase' THEN encode(sha256(convert_to(s.id::text,'UTF8')),'hex')
        WHEN a.stage='checkout' THEN '' ELSE 'demo-' || (1+s.n%4) END,
        s.started + a.step * interval '2 minutes'
      FROM samples s JOIN visits v USING(id)
      CROSS JOIN (VALUES ('view',0),('cart',1),('checkout',2),('purchase',3)) a(stage,step)
      WHERE a.step=0 OR (a.step=1 AND s.n%5<3) OR (a.step=2 AND s.n%5<2) OR (a.step=3 AND s.n%5=0);
    `);
    await login();
    const reports = Object.fromEntries(await Promise.all(['today','7d','30d','90d','all'].map(async period => [period,await report(period)])));
    writeFileSync(process.env.COMICCULTURE_CONVERSION_FIXTURE,JSON.stringify(reports));
  }
});
