"""Run interactively inside a fresh container; never prints a password or setup token."""
import getpass,json,os,urllib.request,urllib.error
from pathlib import Path
base='http://127.0.0.1:8000/api/'
with urllib.request.urlopen(base+'me') as response:state=json.load(response)
if not state.get('setup'):raise SystemExit('An owner already exists. Use the administration panel or manage.py reset-password.')
name=input('Owner username (3–24 characters): ').strip();password=getpass.getpass('Password (12+ characters): ')
if len(password)<12 or len(password)>128:raise SystemExit('Use 12–128 characters.')
if password!=getpass.getpass('Confirm password: '):raise SystemExit('Passwords differ.')
body={'name':name,'password':password,'setup_token':(Path(os.getenv('DATA_DIR','/data'))/'setup-token').read_text().strip()}
request=urllib.request.Request(base+'register',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Club':'1'})
try:
 with urllib.request.urlopen(request) as response:assert response.status==200
except urllib.error.HTTPError as exc:raise SystemExit(json.load(exc).get('detail','Registration failed.'))
print('Owner created. Sign in using the website.')
