"""Read text from Snappy-compressed Keynote IWA archives without dependencies."""
import zipfile, re, json
from pathlib import Path

def varint(b,p):
 n=s=0
 while True:
  v=b[p];p+=1;n|=(v&127)<<s
  if v<128:return n,p
  s+=7

def unsnap(b):
 size,p=varint(b,0);o=bytearray()
 while p<len(b):
  tag=b[p];p+=1;t=tag&3
  if t==0:
   n=tag>>2
   if n<60:n+=1
   else:
    k=n-59;n=int.from_bytes(b[p:p+k],'little')+1;p+=k
   o.extend(b[p:p+n]);p+=n
  else:
   if t==1:n=4+((tag>>2)&7);off=((tag&224)<<3)|b[p];p+=1
   elif t==2:n=1+(tag>>2);off=int.from_bytes(b[p:p+2],'little');p+=2
   else:n=1+(tag>>2);off=int.from_bytes(b[p:p+4],'little');p+=4
   for _ in range(n):o.append(o[-off])
 assert len(o)==size
 return bytes(o)

def strings(b,depth=0):
 if depth>30:return []
 out=[];p=0
 try:
  while p<len(b):
   key,p=varint(b,p);wire=key&7
   if wire==0:_,p=varint(b,p)
   elif wire==1:p+=8
   elif wire==5:p+=4
   elif wire==2:
    n,p=varint(b,p);v=b[p:p+n];p+=n
    try:
     s=v.decode('utf8')
     if len(s)>2 and all(c.isprintable() or c in '\n\t' for c in s):out.append(s)
    except UnicodeDecodeError:pass
    out+=strings(v,depth+1)
   else:break
 except (IndexError,ValueError):pass
 return out
with zipfile.ZipFile('demo_sketch_present.key') as z:
 result={}
 for name in z.namelist():
  if not name.endswith('.iwa'):continue
  b=z.read(name);p=0;raw=b''
  while p<len(b):
   typ=b[p];n=int.from_bytes(b[p+1:p+4],'little');p+=4
   raw+=unsnap(b[p:p+n]);p+=n
  # IWA consists of archive header length + protobuf header + data records.
  ss=[];p=0
  while p<len(raw):
   n,p=varint(raw,p);header=raw[p:p+n];p+=n
   # MessageInfo field 2 has data length in field 3.
   def records(h):
    q=0;out=[]
    while q<len(h):
     k,q=varint(h,q)
     if k&7==0:v,q=varint(h,q);out.append((k>>3,v))
     elif k&7==2:l,q=varint(h,q);out.append((k>>3,h[q:q+l]));q+=l
     else:break
    return out
   infos=[v for k,v in records(header) if k==2 and isinstance(v,bytes)]
   for info in infos:
    lens=[v for k,v in records(info) if k==3 and isinstance(v,int)]
    if lens:
     n=lens[0];ss+=strings(raw[p:p+n]);p+=n
   if not infos:break
  ss=list(dict.fromkeys(s for s in ss if not re.fullmatch(r'[\d.,\-]+',s)))
  if ss:result[name]=ss
 Path('keynote-content.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 for k,v in result.items():
  if 'Slide-' in k: print(k, ' / '.join(v))
