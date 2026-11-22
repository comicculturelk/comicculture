import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const bin = process.env.COMICCULTURE_POSTGRES_BIN;
const driver = process.env.COMICCULTURE_POSTGRES_DRIVER;
const platformSuffix = process.platform === 'win32' ? '.exe' : '';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const firstSize = '00000000-0000-0000-0000-000000000030';
const secondSize = '00000000-0000-0000-0000-000000000031';

test('parallel PostgreSQL checkouts retry a simultaneous unique-key collision', { skip: !(bin && driver) && 'Set the PostgreSQL bin and optional test-driver paths' }, async (t) => {
  const { Client } = createRequire(join(resolve(driver), 'package.json'))('pg');
  const root = mkdtempSync(join(tmpdir(), 'comicculture-db-test-'));
  const cluster = join(root, 'cluster');
  const dbUser = 'cc_test_' + crypto.randomUUID().replaceAll('-', '');
  const port = 55498;
  const program = (name) => resolve(bin, name + platformSuffix);
  const run = (name, args, input) => {
    const result = spawnSync(program(name), args, { input, encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr ?? result.stdout);
    return result.stdout.trim();
  };
  run('initdb', ['-D', cluster, '-U', dbUser, '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', cluster, '-l', join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port, '-w', 'start']);
  const config = { host: '127.0.0.1', port, user: dbUser, database: 'postgres', ssl: false, connectionTimeoutMillis: 5000 };
  const admin = new Client(config);
  const first = new Client({ ...config, application_name: 'cc_first' });
  const second = new Client({ ...config, application_name: 'cc_second' });
  t.after(async () => {
    await Promise.allSettled([admin.end(), first.end(), second.end()]);
    run('pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']);
    rmSync(root, { recursive: true, force: true });
  });
  await Promise.all([admin.connect(), first.connect(), second.connect()]);
  const query = (sql) => admin.query(sql);
  assert.equal((await query('SELECT current_user')).rows[0].current_user, dbUser);

  await query(read('./fixtures/admin.sql'));
  await query(`
    CREATE SEQUENCE order_reference_seq;
    CREATE TABLE delivery_settings (id integer PRIMARY KEY, delivery_fee numeric NOT NULL);
    INSERT INTO delivery_settings VALUES (1, 350);
    ALTER TABLE orders ADD CONSTRAINT orders_order_reference_key UNIQUE (order_reference), ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE orders ADD COLUMN full_name text, ADD COLUMN phone text, ADD COLUMN email text,
      ADD COLUMN address_line1 text, ADD COLUMN address_line2 text, ADD COLUMN city text, ADD COLUMN district text,
      ADD COLUMN postal_code text, ADD COLUMN subtotal numeric, ADD COLUMN delivery_fee numeric, ADD COLUMN total numeric;
    ALTER TABLE order_items ADD COLUMN slug text, ADD COLUMN image text, ADD COLUMN sku text,
      ADD COLUMN price numeric, ADD COLUMN is_preorder boolean, ADD COLUMN preorder_days integer;
    INSERT INTO product_version_sizes (id,version_id,size,sku,price,stock) VALUES
      ('${secondSize}','00000000-0000-0000-0000-000000000021','L','TEST-L',125,4);
    ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE product_version_sizes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Product versions are viewable by everyone" ON product_versions FOR SELECT USING (true);
    CREATE POLICY "Product version sizes are viewable by everyone" ON product_version_sizes FOR SELECT USING (true);
  `);
  const feeMigration = read('../supabase/migrations/20261112113607_centralize_delivery_fee.sql');
  await query(feeMigration.slice(feeMigration.indexOf('CREATE OR REPLACE FUNCTION public.create_order('), feeMigration.indexOf('-- Qualify the stored total')));
  await query(read('../supabase/migrations/20261114065745_harden_tracking_and_catalog_access.sql'));
  await query(read('../supabase/migrations/20261115075636_numeric_order_references.sql'));
  await query(`
    ALTER FUNCTION public.generate_numeric_order_reference() RENAME TO test_unforced_reference;
    CREATE FUNCTION public.generate_numeric_order_reference() RETURNS text LANGUAGE sql VOLATILE SET search_path = '' AS $$
      SELECT CASE WHEN nextval(to_regclass('pg_temp.reference_draw')) = 1
             THEN '000000000008' ELSE public.test_unforced_reference() END
    $$;
  `);

  const command = (id) => `SELECT order_reference || ':' || subtotal || ':' || total AS checkout FROM public.create_order(
    'Synthetic','0771234567','synthetic@example.invalid','Test address',NULL,'Colombo','Colombo',NULL,'COD',NULL,
    '[{"version_size_id":"${id}","quantity":1}]'::jsonb);`;
  await first.query('CREATE TEMP SEQUENCE reference_draw; BEGIN;');
  await second.query('CREATE TEMP SEQUENCE reference_draw; SET statement_timeout = 10000;');
  assert.equal((await first.query(command(firstSize))).rows[0].checkout, '000000000008:100:450');

  const competing = second.query(command(secondSize));
  let waiting = false;
  try {
    for (let i = 0; i < 60 && !waiting; i++) {
      const result = await query("SELECT wait_event = 'transactionid' AS waiting FROM pg_stat_activity WHERE application_name = 'cc_second'");
      waiting = result.rows[0]?.waiting === true;
      if (!waiting) await setTimeout(25);
    }
  } finally {
    await first.query('COMMIT');
  }
  assert.match((await competing).rows[0].checkout, /^(?!000000000008)[0-9]{12}:125:475$/);
  assert.ok(waiting, 'Second connection must contend on the first uncommitted reference');
  assert.equal((await query("SELECT count(*) || ':' || count(DISTINCT order_reference) AS value FROM orders")).rows[0].value, '2:2');
  assert.equal((await query("SELECT string_agg(stock::text, ',' ORDER BY id) AS value FROM product_version_sizes")).rows[0].value, '3,3');
  assert.equal((await query('SELECT count(*) FROM inventory_movements m JOIN orders o ON m.reason = o.order_reference')).rows[0].count, '2');
  assert.equal((await query('SELECT count(*) FROM order_items')).rows[0].count, '2');

  await t.test('Restock Review reads committed stock without waiting for an inventory write', async () => {
    const owner = '00000000-0000-0000-0000-000000000001';
    const roles = read('../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql');
    await query(`
      ALTER TABLE orders ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE store_admins ADD COLUMN role text DEFAULT 'owner';
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz);
      INSERT INTO auth.users VALUES ('${owner}', now());
      UPDATE product_versions SET is_preorder=false;
      CREATE INDEX orders_created_at_idx ON orders(created_at);
      CREATE INDEX idx_order_items_version_size_id ON order_items(version_size_id);
      CREATE INDEX idx_order_items_order_id ON order_items(order_id);
    `);
    await query(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.get_store_admin_role'), roles.indexOf('CREATE OR REPLACE FUNCTION public.staff_inventory')));
    await query(read('./fixtures/restock-review-rls.sql'));
    await query(read('../supabase/migrations/20261122061946_admin_restock_review.sql'));

    await second.query("SET ROLE authenticated; SET statement_timeout = '2s'");
    try {
      await second.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub: owner, aal: 'aal2'})]);
      const candidates = async () => (await second.query('SELECT public.admin_restock_review() AS report')).rows[0].report.candidates;
      await first.query(`BEGIN; UPDATE product_version_sizes SET stock=7 WHERE id='${firstSize}'`);
      try {
        const before = await candidates();
        assert.equal(before.find((size) => size.edition_size_id === firstSize)?.stock, 3);
        assert.equal(before.find((size) => size.edition_size_id === firstSize)?.order_count, 1);
      } finally {
        await first.query('COMMIT');
      }
      assert.deepEqual((await candidates()).map((size) => size.edition_size_id), [secondSize]);
    } finally {
      await second.query('RESET ROLE');
    }
  });

  await t.test('two worker connections claim different ready notifications using SKIP LOCKED', async () => {
    await query(read('../supabase/migrations/20261115140801_order_status_email_outbox.sql'));
    assert.equal((await query('SELECT count(*) FROM order_status_email_outbox')).rows[0].count, '0');
    await query("UPDATE orders SET status='packed'; UPDATE order_status_email_outbox SET available_at=now()");
    await first.query('BEGIN; SET LOCAL ROLE service_role');
    try {
      const claim = "SELECT public.claim_order_status_email() AS job";
      const a = (await first.query(claim)).rows[0].job;
      await second.query('SET ROLE service_role');
      const b = (await second.query(claim)).rows[0].job;
      assert.ok(a.lease && b.lease);
      assert.notEqual(a.id, b.id);
      assert.equal((await second.query(claim)).rows[0].job, null);
    } finally {
      await first.query('COMMIT');
      await second.query('RESET ROLE');
    }
  });
});
