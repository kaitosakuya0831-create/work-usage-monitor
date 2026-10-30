"""Create deterministic extension Release ZIP and SHA256SUMS.txt; no GitHub API use."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'extension'/'manifest.json').read_text(encoding='utf8'))
version=manifest['version']
out=ROOT/'dist';out.mkdir(exist_ok=True)
zippath=out/'work-ring-extension.zip'
with ZipFile(zippath,'w',compression=ZIP_DEFLATED,compresslevel=9) as z:
 for f in sorted((ROOT/'extension').rglob('*')):
  if not f.is_file() or '__pycache__' in f.parts or 'tests' in f.relative_to(ROOT/'extension').parts: continue
  name=f.relative_to(ROOT/'extension').as_posix()
  info=ZipInfo(name,(2026,10,30,0,0,0))
  info.compress_type=ZIP_DEFLATED
  info.external_attr=(0o100644<<16)
  z.writestr(info, f.read_bytes(),compress_type=ZIP_DEFLATED,compresslevel=9)
digest=hashlib.sha256(zippath.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(f'{digest}  {zippath.name}\n',encoding='ascii')
print('Release tag: v'+version+'\nAssets:',zippath,out/'SHA256SUMS.txt','\nSHA256:',digest)
