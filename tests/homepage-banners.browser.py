from pathlib import Path
import json, re, struct, zlib
from playwright.sync_api import sync_playwright
root=Path.cwd()
out=root/'artifacts/homepage-banners'
out.mkdir(parents=True,exist_ok=True)
def png(w,h,color=(30,55,78)):
 def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+bytes(color)*w for _ in range(h))))+chunk(b'IEND',b'')
image=png(1600,900)
rows=[dict(id='banner-one',name='Test Universe',slug='test-universe',tagline='Pick your universe',description='Fan-inspired designs, made for every day.',cover_image='http://localhost:5173/test-cover.png',hero_focus_desktop='50% 50%',hero_focus_mobile='50% 50%',card_focus=None,status='live',sort_order=0,created_at='2026-01-01T00:00:00Z',banner_desktop='http://localhost:5173/test-desktop.png',banner_mobile='http://localhost:5173/test-mobile.png',banner_overlay=55,homepage_visible=True,homepage_order=0)]
rows.append({**rows[0],'id':'two','name':'Second Universe','slug':'second','homepage_order':1})
rows.append({**rows[0],'id':'hidden','name':'Hidden Universe','homepage_visible':False})
rows.append({**rows[0],'id':'soon','name':'Coming Soon','status':'soon'})
requests=[]
def route_backend(route):
 req=route.request; url=req.url
 if '/rest/v1/collections' in url:
  if req.method=='PATCH': rows[0].update(req.post_data_json); data=rows[0]
  elif 'select=id' in url: data=None
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
 page=browser.new_page();page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/*.supabase.co/**',route_backend)
 page.route('**/test-*.png',lambda r:(requests.append(r.request.url),r.fulfill(status=200,body=image,content_type='image/png')))
 # Use the actual homepage first; backend calls are intercepted and no writes reach production.
 page.goto('http://localhost:5173/');page.wait_for_load_state('networkidle')
 for width in [320,375,390,430,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(150)
  hero=page.locator('.banner-hero');assert hero.locator('h1').inner_text() in ['Test Universe','Second Universe']
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'overflow at {width}'
  assert hero.locator('img').evaluate('(e)=>e.naturalWidth > 0')
  assert hero.locator('img').evaluate('(e)=>e.currentSrc').endswith('test-mobile.png' if width<768 else 'test-desktop.png')
  page.screenshot(path=str(out/f'homepage-{width}.png'))
 page.get_by_role('button',name='Next collection',exact=True).click();assert page.locator('.banner-hero h1').inner_text()=='Second Universe'
 assert page.locator('.banner-hero a').get_attribute('href')=='/collections/second'
 assert page.locator('.banner-hero').get_by_role('button',name='Show Hidden Universe').count()==0
 page.evaluate('document.activeElement.blur()');page.mouse.move(0,0)
 page.emulate_media(reduced_motion='reduce');page.reload();page.wait_for_load_state('networkidle')
 first=page.locator('.banner-hero h1').inner_text();page.wait_for_timeout(6500)
 assert page.locator('.banner-hero h1').inner_text()==first
 assert page.locator('.banner-hero').get_by_role('button',name='Pause automatic rotation').count()==0
 page.emulate_media(reduced_motion='no-preference');page.reload();page.wait_for_load_state('networkidle');page.mouse.move(0,0)
 first=page.locator('.banner-hero h1').inner_text();page.wait_for_timeout(6500)
 page.wait_for_function('(first)=>document.querySelector(".banner-hero h1").textContent!==first',arg=first)

 # Worst-case artwork: white pixels with the full-image overlay set to zero.
 image=png(1600,900,(255,255,255))
 rows[0]['banner_overlay']=0;rows[1]['banner_overlay']=0
 def assert_text_protection():
  for panel in page.locator('.banner-hero .banner-text-protection').all():
   style=panel.evaluate('(e)=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})')
   components=[float(v) for v in re.findall(r'[\d.]+',style['background'])]
   assert len(components)==4 and style['color']=='rgb(255, 255, 255)',style
   alpha=components[3]
   channels=[(c*alpha+255*(1-alpha))/255 for c in components[:3]]
   linear=[c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4 for c in channels]
   contrast=1.05/(sum(c*w for c,w in zip(linear,[0.2126,0.7152,0.0722]))+0.05)
   assert contrast>=4.5,(style,contrast)
 for width in [320,375,390,430,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':900});page.reload();page.wait_for_load_state('networkidle')
  assert_text_protection()
  assert page.locator('.banner-hero > .banner-shade').evaluate('(e)=>getComputedStyle(e).opacity')=='0'
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  if width in [390,1440]:page.screenshot(path=str(out/f'light-banner-zero-overlay-{width}.png'))
 for overlay in [15,55,100]:
  rows[0]['banner_overlay']=overlay;rows[1]['banner_overlay']=overlay
  page.reload();page.wait_for_load_state('networkidle');assert_text_protection()
  assert abs(float(page.locator('.banner-hero > .banner-shade').evaluate('(e)=>getComputedStyle(e).opacity'))-overlay/100)<0.001
 image=png(1600,900)
 rows[0]['banner_overlay']=55;rows[1]['banner_overlay']=55
 rows[0]['banner_mobile']=None;rows[1]['homepage_visible']=False
 page.reload();page.wait_for_load_state('networkidle');page.set_viewport_size({'width':390,'height':900});page.wait_for_timeout(100)
 assert page.locator('.banner-hero img').evaluate('(e)=>e.currentSrc').endswith('test-desktop.png')
 assert page.locator('.banner-hero').get_by_role('button',name='Next collection',exact=True).count()==0
 rows[0]['banner_desktop']=None;page.reload();page.wait_for_load_state('networkidle')
 assert page.locator('.banner-hero img').evaluate('(e)=>e.currentSrc').endswith('test-cover.png')
 rows[0]['banner_desktop']='http://localhost:5173/missing-banner.png'
 page.route('**/missing-banner.png',lambda r:r.fulfill(status=404))
 page.reload();page.wait_for_load_state('networkidle');assert page.locator('.banner-hero img').evaluate('(e)=>e.currentSrc').endswith('test-cover.png')
 rows[0]['banner_desktop']=None
 rows[0]['cover_image']=None;page.reload();page.wait_for_load_state('networkidle');assert page.locator('.banner-hero img').count()==0
 # Temporary in-memory document mounts the real admin editor, without bypassing production auth.
 page.route('**/__banner-test',lambda r:r.fulfill(status=200,body=html,content_type='text/html'))
 page.goto('http://localhost:5173/__banner-test');page.wait_for_load_state('networkidle')
 page.get_by_role('button',name='Edit',exact=True).first.click()
 inputs=page.locator('input[type=file]');assert inputs.count()==3
 for i in [1,2]:
  inputs.nth(i).set_input_files({'name':f'banner-{i}.png','mimeType':'image/png','buffer':image});page.wait_for_timeout(500)
 sliders=page.get_by_role('slider',name='Horizontal image focus');sliders.nth(0).fill('25');sliders.nth(1).fill('75')
 vertical=page.get_by_role('slider',name='Vertical image focus');vertical.nth(0).fill('30');vertical.nth(1).fill('60')
 page.get_by_role('slider',name='Background overlay strength').fill('70')
 page.get_by_role('spinbutton',name='Homepage slide order').fill('3')
 page.get_by_role('checkbox',name='Show on homepage (live collections only)').uncheck()
 page.get_by_role('button',name='Save Changes',exact=True).click();page.get_by_text('"Test Universe" updated.',exact=True).wait_for()
 assert rows[0]['banner_overlay']==70 and rows[0]['homepage_order']==3 and rows[0]['homepage_visible']==False
 assert rows[0]['hero_focus_desktop']=='25% 30%' and rows[0]['hero_focus_mobile']=='75% 60%'
 assert rows[0]['banner_desktop'] and rows[0]['banner_mobile']
 page.get_by_role('button',name='Edit',exact=True).first.click();assert page.get_by_role('slider',name='Background overlay strength').input_value()=='70'
 page.screenshot(path=str(out/'admin-banner.png'),full_page=True)
 assert not errors,errors
 browser.close()
print('PASS: white-image contrast >=4.5:1 at zero overlay across seven widths; selected overlay 0/15/55/100 remains unchanged; seven viewport widths, images, fallback chain, no overflow, eligibility, navigation, CTA, admin desktop/mobile uploads, focus, overlay, order, visibility, mocked save and reload; no page errors.')
