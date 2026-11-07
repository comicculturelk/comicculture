import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('homepage banners preserve records, persist settings and enforce bounds; migration is repeatable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE public.collections(id text PRIMARY KEY, cover_image text, sort_order integer NOT NULL, hero_focus_desktop text, hero_focus_mobile text);
      INSERT INTO collections VALUES ('existing','cover.webp',7,'70% center',null);`);
    const sql = readFileSync(new URL('../supabase/migrations/20261107052205_collection_homepage_banners.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const initial = (await db.query("SELECT * FROM collections WHERE id='existing'")).rows[0];
    assert.equal(initial.cover_image, 'cover.webp');
    assert.equal(initial.hero_focus_desktop, '70% center');
    assert.equal(initial.homepage_order, 7);
    assert.equal(initial.homepage_visible, true);
    assert.equal(initial.banner_overlay, 55);
    await db.exec(`UPDATE collections SET banner_desktop='desktop.webp',banner_mobile='mobile.webp',hero_focus_desktop='20% 80%',hero_focus_mobile='75% 15%',banner_overlay=80,homepage_visible=false,homepage_order=2;`);
    await db.exec(sql);
    const saved = (await db.query('SELECT * FROM collections')).rows[0];
    assert.equal(saved.banner_desktop, 'desktop.webp');
    assert.equal(saved.banner_mobile, 'mobile.webp');
    assert.equal(saved.hero_focus_mobile, '75% 15%');
    assert.equal(saved.hero_focus_desktop, '20% 80%');
    assert.equal(saved.banner_overlay, 80);
    assert.equal(saved.homepage_visible, false);
    assert.equal(saved.homepage_order, 2);
    await assert.rejects(db.exec('UPDATE collections SET banner_overlay=101'), /check constraint/);
    await assert.rejects(db.exec('UPDATE collections SET homepage_order=-1'), /check constraint/);
  } finally { await db.close(); }
});
