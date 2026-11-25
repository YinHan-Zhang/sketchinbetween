from pathlib import Path
import shutil, json, subprocess, re
from PIL import Image
SOURCE=Path('/Users/coconut/Desktop/CVPR27-Sketch')
OUT=Path(__file__).resolve().parents[1]/'assets'
OUT.mkdir(exist_ok=True)

def probe(f):
 data=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate:format=duration','-of','json',str(f)]))
 s=data['streams'][0]
 return dict(width=s['width'],height=s['height'],frames=int(s.get('nb_frames',0)),duration=float(data['format']['duration']))

def natural(p):return [int(v) if v.isdigit() else v for v in re.split(r'(\d+)',p.name)]

def title(folder,video):
 names={'case1':'A turn of the head','case2':'A change of stance','case3':'Character performance','case4':'An expanding explosion','case5':'Turning around','case6':'Motion across the frame','case7':'A quiet expression','case8':'Playing the violin','case9':'A bow of the head','case10':'Face in motion','case11':'A raised hand','case12':'A full-body gesture','case13':'Character acting','case14':'Hands and fine detail','case15':'Reaching overhead','case16':'Seated motion','case17':'Leaving the frame','case18':'A dramatic close-up','case19':'A seated character','case20':'A shift in posture','case21':'A subtle turn','case22':'Profile and expression','3d_case1':'Depth and rotation','3d_case2':'Turning in space','3d_case3':'A new perspective','multi_object1':'An ensemble in motion','multi_object2':'Flying together','multi_obejct3':'Opening the arms','multi_obejct4':'Two characters, one scene','multi_object5':'Shapes in motion','multi_object6':'A shared gesture','multi_object7':'Reaching hands','multi_object8':'A pirate and a parrot','multi_object9':'Layered character motion'}
 return names.get(folder,folder)
manifest={'show':[],'comparison':[],'ablation':[]}
for group,sub in [('show','show_case'),('comparison','comparison_case'),('ablation','ablation_case')]:
 for folder in sorted((SOURCE/sub).iterdir(),key=natural):
  if not folder.is_dir():continue
  dest=OUT/group/folder.name;dest.mkdir(parents=True,exist_ok=True)
  for f in folder.iterdir():
   if f.suffix.lower() in ('.mp4','.jpg','.png'):shutil.copy2(f,dest/f.name)
  videos={f.stem:{'src':str((dest/f.name).relative_to(OUT.parent)),**probe(f)} for f in sorted(folder.glob('*.mp4'))}
  if not videos:continue
  paths=list(videos)
  primary=next((k for k in paths if 'sparse' in k),None) or next((k for k in paths if 'multikey' in k),None) or next((k for k in paths if 'dense' in k),None) or ('full-keyframes' if 'full-keyframes' in paths else paths[0])
  gt=next((k for k in paths if k=='gt' or k.endswith('-gt') or k.startswith('gt_')),None)
  if group=='show':
   cat='perspective' if folder.name.startswith('3d') else 'multi' if folder.name.startswith('multi') else 'character'
   name=title(folder.name,primary)
  else:
   cat=group; name=folder.name.replace('_',' ').replace('M0','Scene 0')
  poster=dest/'poster.webp'
  subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',str(videos[primary]['duration']*.45),'-i',str(OUT.parent/videos[primary]['src']),'-frames:v','1','-vf','scale=640:-1','-quality','82',str(poster)],check=True)
  item=dict(id=folder.name,title=name,category=cat,primary=primary,gt=gt,first=str((dest/'first.jpg').relative_to(OUT.parent)),last=str((dest/'last.jpg').relative_to(OUT.parent)),poster=str(poster.relative_to(OUT.parent)),videos=videos)
  if group=='show' and folder.name in ['case18','case12','multi_object6']:
   frame_dir=dest/'frames';frame_dir.mkdir(exist_ok=True)
   subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(OUT.parent/videos[primary]['src']),'-vf','scale=832:-1','-c:v','libwebp','-f','image2','-quality','84',str(frame_dir/'%03d.webp')],check=True)
   item['scrollFrames']=[str(p.relative_to(OUT.parent)) for p in sorted(frame_dir.glob('*.webp'))]
  manifest[group].append(item)
for name in ['fig_framework','fig_shape','fig_traj']:
 Image.open(SOURCE/(name+'.png')).convert('RGB').save(OUT/(name+'.webp'),quality=92)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
print({k:len(v) for k,v in manifest.items()})
print('Total asset MB:',round(sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())/1e6,2))
