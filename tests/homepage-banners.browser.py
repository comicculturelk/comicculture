from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import os, re, struct, zlib
from playwright.sync_api import expect, sync_playwright
root=Path.cwd()
out=Path(os.environ.get('HOMEPAGE_BANNER_TEST_OUTPUT', root/'artifacts/homepage-banners'))
out.mkdir(parents=True,exist_ok=True)
base_url='http://localhost:5173'
widths=[320,375,390,430,768,1024,1440]
# Keep the clock checks tied to the production interval.
rotation_ms=int(re.search(r'HERO_ROTATION_INTERVAL_MS = (\d+)', (root/'src/config/merchandising.ts').read_text())[1])
def png(w,h,color=(30,55,78)):
 def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+bytes(color)*w for _ in range(h))))+chunk(b'IEND',b'')
image=png(1600,900)
first=dict(id='banner-one',name='Test Universe',slug='test-universe',tagline='Pick your universe',description='Fan-inspired designs, made for every day.',cover_image='/test-cover.png',hero_focus_desktop='25% 30%',hero_focus_mobile='75% 60%',card_focus=None,status='live',sort_order=0,created_at='2026-01-01T00:00:00Z',banner_desktop='/test-desktop.png',banner_mobile='/test-mobile.png',banner_overlay=55,homepage_visible=True,homepage_order=0)
ineligible=[
 {**first,'id':'hidden','name':'Hidden Universe','homepage_visible':False},
 {**first,'id':'soon','name':'Coming Soon','status':'soon'},
]
def fixtures(count):
 # Reversed response order exercises the homepage order instead of catalog order.
 return [{**first,'id':f'banner-{i}','name':f'Universe {i}','slug':f'universe-{i}','homepage_order':i}
         for i in range(count,1,-1)]+[first.copy()]+ineligible
rows=fixtures(3)
def route_backend(route):
 req=route.request; url=req.url
 if '/rest/v1/collections' in url:
  if req.method=='PATCH': rows[0].update(req.post_data_json); data=rows[0]
  elif 'select=id' in url: data=None
  elif slug := parse_qs(urlsplit(url).query).get('slug'):
   data=next((row for row in rows if f"eq.{row['slug']}"==slug[0]),None)
  else: data=rows
  route.fulfill(status=200,json=data)
 elif '/storage/v1/object/' in url:
  if req.method=='POST': route.fulfill(status=200,json={'Key':'test-upload'})
  else: route.fulfill(status=200,body=image,content_type='image/png')
 else: route.fulfill(status=200,json=[])
html='''<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;const React=(await import('/node_modules/.vite/deps/react.js')).default;import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';const {createRoot}=ReactDOM;import {BrowserRouter} from '/node_modules/.vite/deps/react-router-dom.js';const Hero=(await import('/src/components/Hero.tsx')).default;const AdminCollections=(await import('/src/components/admin/AdminCollections.tsx')).default;import {fetchCollections} from '/src/data/collections.ts';import '/src/index.css';
const collections=await fetchCollections();createRoot(document.getElementById('root')).render(React.createElement(AdminCollections));</script></body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless=True)
 page=browser.new_page(reduced_motion='reduce');page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*.supabase.co/**',route_backend)
 def route_image(route):
  route.fulfill(status=200,body=image,content_type='image/png')
 page.route('**/test-*.png',route_image)
 # Use the actual homepage first; backend calls are intercepted and no writes reach production.
 page.goto(base_url);page.wait_for_load_state('networkidle')
 hero=page.get_by_role('region',name='Featured collections')
 controls=hero.get_by_role('group',name='Slideshow controls')
 cta=hero.get_by_role('link')
 previous=controls.get_by_role('button',name='Previous collection')
 next_slide=controls.get_by_role('button',name='Next collection')
 pause=controls.get_by_role('button',name='Pause automatic rotation')
 resume=controls.get_by_role('button',name='Resume automatic rotation')
 def assert_slide(name,slug,position,count):
  expect(hero.get_by_role('heading',name=name,exact=True)).to_have_count(1)
  expect(cta).to_have_accessible_name(f'Explore the collection: {name}')
  expect(cta).to_have_attribute('href',f'/collections/{slug}')
  if count>1:
   expect(controls.get_by_text(f'{position} / {count}',exact=True)).to_be_visible()
 def assert_layout(width):
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'overflow at {width}'
  boxes=[element.bounding_box() for element in hero.locator('a, button').all()]
  for i, box in enumerate(boxes):
   assert box and box['x']>=0 and box['x']+box['width']<=width and box['height']>=44,(width,box)
   for other in boxes[:i]:
    assert (box['x']>=other['x']+other['width'] or other['x']>=box['x']+box['width']
            or box['y']>=other['y']+other['height'] or other['y']>=box['y']+box['height']), (width,box,other)
 def assert_image(filename):
  hero.locator('img').evaluate('(image) => image.decode()')
  assert hero.locator('img').evaluate('(image) => image.currentSrc').endswith(filename)

 for width in widths:
  page.set_viewport_size({'width':width,'height':900})
  assert_slide('Test Universe','test-universe',1,3)
  assert hero.locator('h1').bounding_box()['width']<=1
  assert_layout(width)
  assert_image('test-mobile.png' if width<768 else 'test-desktop.png')
  expect(hero.locator('img')).to_have_css('object-position','75% 60%' if width<768 else '25% 30%')
  page.screenshot(path=str(out/f'homepage-{width}.png'))
 cta.focus()
 cta.press('Tab')
 expect(previous).to_be_focused()
 expect(previous).to_have_css('outline-style','solid')
 expect(previous).to_have_css('outline-width','2px')
 previous.press('ArrowLeft')
 assert_slide('Universe 3','universe-3',3,3)
 previous.press('ArrowRight')
 assert_slide('Test Universe','test-universe',1,3)
 next_slide.click()
 cta.click()
 expect(page).to_have_url(f'{base_url}/collections/universe-2')
 expect(page.get_by_role('heading',name='Universe 2',exact=True)).to_be_visible()

 page.emulate_media(reduced_motion='no-preference')
 page.clock.install()
 page.mouse.move(10,20)
 page.goto(base_url);page.wait_for_load_state('networkidle')
 pause.click()
 expect(resume).to_be_visible()
 page.mouse.move(10,20)
 page.clock.run_for(rotation_ms+100)
 assert_slide('Test Universe','test-universe',1,3)
 cta.hover()
 resume.click()
 # Hover holds the slide even after rotation has been explicitly resumed.
 page.clock.run_for(rotation_ms+100)
 assert_slide('Test Universe','test-universe',1,3)
 page.mouse.move(10,20)
 page.clock.run_for(rotation_ms+100)
 assert_slide('Universe 2','universe-2',2,3)
 page.clock.run_for(rotation_ms)
 assert_slide('Universe 3','universe-3',3,3)
 page.clock.run_for(rotation_ms)
 assert_slide('Test Universe','test-universe',1,3)
 cta.focus()
 page.clock.run_for(rotation_ms+100)
 assert_slide('Test Universe','test-universe',1,3)

 page.emulate_media(reduced_motion='reduce')
 page.reload();page.wait_for_load_state('networkidle')
 page.clock.run_for(rotation_ms+100)
 assert_slide('Test Universe','test-universe',1,3)
 expect(controls.get_by_role('button')).to_have_count(2)
 expect(hero.locator('picture')).to_have_css('animation-name','none')
 page.emulate_media(reduced_motion='no-preference')

 for count in [10,20]:
  rows=fixtures(count)
  page.set_viewport_size({'width':320,'height':900})
  page.reload();page.wait_for_load_state('networkidle')
  assert_slide('Test Universe','test-universe',1,count)
  expect(controls.get_by_role('button')).to_have_count(3)
  previous.click()
  assert_slide(f'Universe {count}',f'universe-{count}',count,count)
  assert_layout(320)
  next_slide.click()
  assert_slide('Test Universe','test-universe',1,count)

 touch=browser.new_page(has_touch=True,reduced_motion='reduce',viewport={'width':390,'height':900})
 touch.route('**/*.supabase.co/**',route_backend)
 touch.route('**/test-*.png',route_image)
 touch.goto(base_url)
 touch.get_by_role('group',name='Slideshow controls').get_by_role('button',name='Next collection').tap()
 expect(touch.get_by_role('link',name='Explore the collection: Universe 2')).to_be_visible()
 touch.close()

 rows=ineligible.copy()
 page.reload();page.wait_for_load_state('networkidle')
 expect(hero.get_by_role('heading',name='Wear your universe.')).to_be_visible()
 expect(cta).to_have_attribute('href','/shop')
 expect(controls).to_have_count(0)

 # Worst-case artwork: white pixels with the full-image overlay set to zero.
 image=png(1600,900,(255,255,255))
 rows=fixtures(3)
 for row in rows[:3]:
  row['banner_overlay']=0
 def assert_contrast():
  for element in [cta,controls]:
   style=element.evaluate('(e)=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})')
   components=[float(v) for v in re.findall(r'[\d.]+',style['background'])]
   assert len(components)==3 and style['color']=='rgb(255, 255, 255)',style
   channels=[c/255 for c in components]
   linear=[c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4 for c in channels]
   contrast=1.05/(sum(c*w for c,w in zip(linear,[0.2126,0.7152,0.0722]))+0.05)
   assert contrast>=4.5,(style,contrast)
 page.reload();page.wait_for_load_state('networkidle')
 for width in widths:
  page.set_viewport_size({'width':width,'height':900})
  assert_contrast()
  expect(hero.locator('.banner-shade')).to_have_css('opacity','0')
  assert_layout(width)
  if width in [390,1440]:page.screenshot(path=str(out/f'light-banner-zero-overlay-{width}.png'))
 for overlay in [15,55,100]:
  for row in rows[:3]:
   row['banner_overlay']=overlay
  page.reload();page.wait_for_load_state('networkidle')
  expect(hero.locator('.banner-shade')).to_have_css('opacity',str(overlay/100).removesuffix('.0'))
 image=png(1600,900)
 rows=fixtures(1)
 rows[0]['banner_mobile']='/missing-banner.png'
 page.route('**/missing-banner.png',lambda r:r.fulfill(status=404))
 page.set_viewport_size({'width':390,'height':900})
 page.reload();page.wait_for_load_state('networkidle')
 assert_image('test-desktop.png')
 expect(controls).to_have_count(0)
 assert_slide('Test Universe','test-universe',1,1)
 rows[0]['banner_mobile']=None
 rows[0]['banner_desktop']=None;page.reload();page.wait_for_load_state('networkidle')
 assert_image('test-cover.png')
 rows[0]['banner_desktop']='/missing-banner.png'
 page.reload();page.wait_for_load_state('networkidle')
 assert_image('test-cover.png')
 rows[0]['banner_desktop']=None
 rows[0]['cover_image']=None;page.reload();page.wait_for_load_state('networkidle')
 expect(hero.locator('img')).to_have_count(0)
 assert hero.get_by_role('heading',name='Test Universe').bounding_box()['width']>1
 assert_slide('Test Universe','test-universe',1,1)
 # Temporary in-memory document mounts the real admin editor, without bypassing production auth.
 page.route('**/__banner-test',lambda r:r.fulfill(status=200,body=html,content_type='text/html'))
 page.goto('http://localhost:5173/__banner-test');page.wait_for_load_state('networkidle')
 page.get_by_role('button',name='Edit',exact=True).first.click()
 inputs=page.locator('input[type=file]');assert inputs.count()==3
 for i in [1,2]:
  inputs.nth(i).set_input_files({'name':f'banner-{i}.png','mimeType':'image/png','buffer':image});page.wait_for_timeout(500)
 expect(page.locator('.banner-preview-cta')).to_have_count(2)
 sliders=page.get_by_role('slider',name='Horizontal image focus');sliders.nth(0).fill('35');sliders.nth(1).fill('65')
 vertical=page.get_by_role('slider',name='Vertical image focus');vertical.nth(0).fill('40');vertical.nth(1).fill('70')
 page.get_by_role('slider',name='Background overlay strength').fill('70')
 page.get_by_role('spinbutton',name='Homepage slide order').fill('3')
 page.get_by_role('checkbox',name='Show on homepage (live collections only)').uncheck()
 page.get_by_role('button',name='Save Changes',exact=True).click();page.get_by_text('"Test Universe" updated.',exact=True).wait_for()
 assert rows[0]['banner_overlay']==70 and rows[0]['homepage_order']==3 and rows[0]['homepage_visible']==False
 assert rows[0]['hero_focus_desktop']=='35% 40%' and rows[0]['hero_focus_mobile']=='65% 70%'
 assert rows[0]['banner_desktop'] and rows[0]['banner_mobile']
 page.get_by_role('button',name='Edit',exact=True).first.click();assert page.get_by_role('slider',name='Background overlay strength').input_value()=='70'
 page.screenshot(path=str(out/'admin-banner.png'),full_page=True)
 assert not errors,errors
 browser.close()
print('PASS: 0/1/3/10/20 slides, wraparound, keyboard and touch, CTA navigation, autoplay/hover/pause/resume, reduced motion, seven viewport widths, image selection/focus/fallbacks, contrast at zero overlay, overlay settings, and mocked admin upload/save/reopen. No page errors.')
