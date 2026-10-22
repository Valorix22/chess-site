"""Download the same pinned Stockfish19 and local Syzygy files as homeserver."""
import argparse,hashlib,json,platform,tarfile,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'vendor'
parser=argparse.ArgumentParser();parser.add_argument('--tablebases-only',action='store_true');args=parser.parse_args()
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def download(url,path,sha):
 if path.exists() and digest(path)==sha:return
 path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_name(path.name+'.part')
 try:
  with urllib.request.urlopen(url,timeout=45) as response,temporary.open('wb') as target:
   while chunk:=response.read(1024*1024):target.write(chunk)
  if digest(temporary)!=sha:raise ValueError('Checksum mismatch: '+path.name)
  temporary.replace(path)
 finally:temporary.unlink(missing_ok=True)
if not args.tablebases_only:
 if platform.machine().lower() not in ('x86_64','amd64'):raise SystemExit('This pinned engine matches homeserver x86_64. Supply an appropriate Stockfish19 build on other architectures.')
 expected='0f83d24cc46d2c66c60f16001af5444873bc112b7d028594513426894c12da19';binary=root/'stockfish'
 if not binary.exists() or digest(binary)!=expected:
  archive=root/'.cache/stockfish19.tar.gz';download('https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz',archive,'9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f')
  with tarfile.open(archive) as package:
   data=package.extractfile('stockfish/stockfish-linux-x86-64-universal').read()
  if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Stockfish binary checksum mismatch')
  binary.write_bytes(data)
 binary.chmod(0o755)
for item in json.loads((root/'syzygy/manifest.json').read_text())['files']:
 name=item['name']
 if Path(name).name!=name or not item['source'].startswith('https://tablebase.lichess.ovh/'):raise ValueError('Invalid tablebase manifest')
 download(item['source'],root/'syzygy'/name,item['sha256'])
print('Pinned engine and local tablebases verified.')
