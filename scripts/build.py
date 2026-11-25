"""Validate the collection and assemble a buildless, relative-path Pages site."""
from pathlib import Path
import json, shutil
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'assets/manifest.json').read_text())
count=0
for group,scenes in manifest.items():
 assert scenes, f'Empty collection: {group}'
 for scene in scenes:
  assert scene['primary'] in scene['videos']
  for key in ['first','last','poster']:
   assert (ROOT/scene[key]).is_file(), scene[key]
  for name,video in scene['videos'].items():
   p=ROOT/video['src'];assert p.is_file(),p
   assert video['duration']>0 and video['frames']>0, p
   assert p.stat().st_size<95*1024*1024, f'Asset exceeds GitHub file limit: {p}'
   count+=1
  if 'scrollFrames' in scene:
   assert len(scene['scrollFrames'])==scene['videos'][scene['primary']]['frames'], f"Scroll frames missing: {scene['id']}"
   assert all((ROOT/p).is_file() for p in scene['scrollFrames'])
out=ROOT/'dist';out.mkdir(exist_ok=True)
for name in ['index.html','app.js','style.css','favicon.svg']:
 shutil.copy2(ROOT/name,out/name)
shutil.copytree(ROOT/'assets',out/'assets',dirs_exist_ok=True)
(out/'.nojekyll').touch()
print(f'Validated {sum(map(len,manifest.values()))} scenes / {count} videos. Static site: {out}')
