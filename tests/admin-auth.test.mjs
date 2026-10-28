import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const migration =
  "../supabase/migrations/20261028060247_multi_user_admin_onboarding.sql";
const owner = "00000000-0000-0000-0000-000000000001",
  member = "00000000-0000-0000-0000-000000000002",
  stranger = "00000000-0000-0000-0000-000000000003";
test("individual accounts, invitation lifecycle and role enforcement in isolated PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(read("./fixtures/admin.sql"));
  await db.exec(`CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 INSERT INTO auth.users VALUES('${owner}','owner@example.invalid',now()),('${member}','friend@example.invalid',now()),('${stranger}','stranger@example.invalid',now());
 ALTER TABLE store_admins ALTER COLUMN is_active SET DEFAULT true;
 ALTER TABLE store_admins ADD COLUMN email text, ADD COLUMN role text DEFAULT 'owner',ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN created_by uuid,ADD CONSTRAINT store_admins_role_check CHECK(role IN ('owner','admin'));
 UPDATE store_admins SET email='owner@example.invalid';
 CREATE FUNCTION public.is_store_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.is_store_admin() AND EXISTS(SELECT 1 FROM store_admins WHERE user_id=auth.uid() AND role='owner' AND is_active) $$;`);
  await db.exec(read(migration));
  const login = async (id = owner, aal = "aal2", extra = {}) => {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: id, role: "authenticated", aal, ...extra }),
    ]);
    await db.exec("SET ROLE authenticated");
  };
  const root = () => db.exec("RESET ROLE");
  await t.test(
    "existing owner preserved, independent account accepts invitation once",
    async () => {
      await login();
      assert.equal(
        (await db.query("select get_store_admin_role() role")).rows[0].role,
        "owner",
      );
      await db.query(
        "select admin_prepare_invitation('friend@example.invalid','admin')",
      );
      await login(member, "aal1");
      await db.query("select accept_admin_invitation()");
      assert.equal(
        (await db.query("select get_store_admin_role() role")).rows[0].role,
        "admin",
      );
      assert.equal(
        (await db.query("select is_store_admin() allowed")).rows[0].allowed,
        false,
      );
      await assert.rejects(
        db.query("select accept_admin_invitation()"),
        /unavailable/,
      );
      await login(member);
      assert.equal(
        (await db.query("select is_store_admin() allowed")).rows[0].allowed,
        true,
      );
    },
  );
  await t.test(
    "non-MFA owner, admin and uninvited users cannot invite or elevate roles",
    async () => {
      for (const [id, aal] of [
        [owner, "aal1"],
        [member, "aal2"],
        [stranger, "aal2"],
      ]) {
        await login(id, aal, { user_metadata: { role: "owner" } });
        await assert.rejects(
          db.query(
            "select admin_prepare_invitation('new@example.invalid','admin')",
          ),
          /Owner access/,
        );
        await assert.rejects(
          db.query(
            "select admin_upsert_staff('stranger@example.invalid','owner')",
          ),
          /Owner access/,
        );
      }
      await login(stranger);
      assert.equal(
        (await db.query("select is_store_admin() allowed")).rows[0].allowed,
        false,
      );
    },
  );
  await t.test(
    "staff has inventory read only, cannot use existing operational or team guards",
    async () => {
      await login();
      await db.query(
        "select admin_upsert_staff('friend@example.invalid','staff')",
      );
      await login(member);
      assert.equal(
        (
          await db.query(
            "select has_store_permission('inventory.read') allowed",
          )
        ).rows[0].allowed,
        true,
      );
      assert.equal(
        (await db.query("select is_store_admin() allowed")).rows[0].allowed,
        false,
      );
      await db.query("select * from staff_inventory()");
      assert.equal(
        (await db.query("select has_store_permission('team') allowed")).rows[0]
          .allowed,
        false,
      );
    },
  );
  await t.test(
    "deactivation denies existing token, verified email required, null and self-demotion denied",
    async () => {
      await login();
      await db.query("select admin_set_staff_active($1,false)", [member]);
      await login(member);
      await assert.rejects(
        db.query("select * from staff_inventory()"),
        /Access denied/,
      );
      await login();
      await assert.rejects(
        db.query("select admin_upsert_staff('owner@example.invalid','admin')"),
        /own owner/,
      );
      await assert.rejects(
        db.query("select admin_upsert_staff('friend@example.invalid',null)"),
        /Invalid admin role/,
      );
      await root();
      await db.query(
        "update auth.users set email_confirmed_at=null where id=$1",
        [member],
      );
      await login();
      await assert.rejects(
        db.query("select admin_upsert_staff('friend@example.invalid','admin')"),
        /verify their email/,
      );
    },
  );
  await t.test(
    "expired, cancelled and unverified invitations cannot activate",
    async () => {
      await login();
      await db.query(
        "select admin_prepare_invitation('stranger@example.invalid','staff')",
      );
      await root();
      await db.exec(
        "update admin_invitations set expires_at=now()-interval '1 second'",
      );
      await login(stranger);
      await assert.rejects(
        db.query("select accept_admin_invitation()"),
        /unavailable/,
      );
      await login();
      await db.query(
        "select admin_cancel_invitation('stranger@example.invalid')",
      );
      await login(stranger);
      await assert.rejects(
        db.query("select accept_admin_invitation()"),
        /unavailable/,
      );
    },
  );
  await t.test(
    "unauthenticated access to invitation tables and RPCs is denied",
    async () => {
      await root();
      await db.exec("SET ROLE anon");
      await assert.rejects(
        db.query("select * from admin_invitations"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select accept_admin_invitation()"),
        /permission denied/,
      );
    },
  );
});
const source = ts.transpileModule(
  read("../supabase/functions/admin-invite/handler.ts"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { createInviteHandler } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
test("invitation endpoint authorizes before service role use and fixes redirect server-side", async () => {
  let calls = [],
    owner = false,
    valid = true,
    prepare = true;
  const handler = createInviteHandler(
    {
      url: "https://db.invalid",
      anonKey: "public-test",
      serviceKey: "private-test",
      origin: "https://store.invalid",
    },
    async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/user"))
        return new Response("{}", { status: valid ? 200 : 401 });
      if (url.endsWith("/is_store_owner")) return Response.json(owner);
      if (url.endsWith("/admin_prepare_invitation"))
        return new Response("{}", { status: prepare ? 200 : 400 });
      if (url.includes("/invite?")) return Response.json({});
      throw Error("Unexpected request");
    },
  );
  const request = (
    body = { email: "friend@example.invalid", role: "admin" },
    origin = "https://store.invalid",
    auth = "Bearer synthetic",
  ) =>
    new Request("https://edge.invalid", {
      method: "POST",
      headers: { Origin: origin, Authorization: auth },
      body: JSON.stringify(body),
    });
  assert.equal((await handler(request())).status, 403);
  assert.ok(!calls.some((c) => c.url.includes("/invite?")));
  owner = true;
  calls = [];
  assert.equal(
    (await handler(request({ email: "friend@example.invalid", role: "owner" })))
      .status,
    400,
  );
  assert.ok(!calls.some((c) => c.url.includes("/invite?")));
  calls = [];
  assert.equal(
    (
      await handler(
        request({
          email: "friend@example.invalid",
          role: "staff",
          redirectTo: "https://evil.invalid",
        }),
      )
    ).status,
    200,
  );
  const invite = calls.find((c) => c.url.includes("/invite?"));
  assert.ok(
    invite.url.endsWith(
      encodeURIComponent("https://store.invalid/admin?auth=invite"),
    ),
  );
  calls = [];
  assert.equal(
    (await handler(request(undefined, "https://evil.invalid"))).status,
    403,
  );
  assert.equal(calls.length, 0);
  valid = false;
  assert.equal((await handler(request())).status, 401);
  valid = true;
  prepare = false;
  calls = [];
  assert.equal((await handler(request())).status, 400);
  assert.ok(!calls.some((c) => c.url.includes("/invite?")));
  assert.equal(
    (await handler(request(undefined, undefined, "Basic test"))).status,
    401,
  );
});
