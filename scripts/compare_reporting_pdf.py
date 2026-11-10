"""Compara PDF sintéticos de regresión: metadatos volátiles y render de todas sus páginas."""
import hashlib,json,re,subprocess,sys,tempfile
from pathlib import Path
if len(sys.argv)!=3:raise SystemExit('Uso: python3 scripts/compare_reporting_pdf.py ANTES.pdf DESPUES.pdf')
def normalized(data):
 data=re.sub(rb'/(CreationDate|ModDate)\s*\(D:[^)]*\)',lambda m:re.sub(rb'(?<=D:)[^)]*',lambda t:b'0'*len(t[0]),m[0]),data)
 return re.sub(rb'/ID\s*\[[^]]+\]',lambda m:re.sub(rb'(?<=<)[0-9a-fA-F]+',lambda t:b'0'*len(t[0]),m[0]),data)
paths=list(map(Path,sys.argv[1:]));values=[normalized(p.read_bytes()) for p in paths]
result={'normalizedBytesEqual':values[0]==values[1],'normalizedSha256':[hashlib.sha256(v).hexdigest() for v in values]}
with tempfile.TemporaryDirectory(prefix='noergon-pdf-compare-') as folder:
 root=Path(folder)
 for index,p in enumerate(paths):subprocess.run(['pdftoppm','-r','72','-png',str(p),str(root/str(index))],check=True,timeout=60,capture_output=True)
 first=sorted(root.glob('0-*.png'));second=sorted(root.glob('1-*.png'))
 result['pages']=[{'page':i+1,'identicalPixels':a.read_bytes()==b.read_bytes(),'sha256':hashlib.sha256(a.read_bytes()).hexdigest()} for i,(a,b) in enumerate(zip(first,second))]
 result['samePageCount']=len(first)==len(second) and bool(first)
print(json.dumps(result,indent=2))
if not(result['normalizedBytesEqual'] and result['samePageCount'] and all(p['identicalPixels'] for p in result['pages'])):raise SystemExit(1)
