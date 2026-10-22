import os, tempfile, unittest
from unittest.mock import patch
if 'server' not in __import__('sys').modules: os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='public-test-')
from fastapi.testclient import TestClient
import server
from helpers import clear_limits,befriend
PUBLIC='https://chess.aura-server.org'
class PublicSiteTest(unittest.TestCase):
    def setUp(self): clear_limits()
    def test_https_redirect_and_hsts(self):
        with patch.object(server,'PUBLIC_URL',PUBLIC):
            c=TestClient(server.app,base_url='http://chess.aura-server.org',follow_redirects=False)
            r=c.get('/?view=club')
            self.assertEqual(r.status_code,308)
            self.assertEqual(r.headers['location'],PUBLIC+'/?view=club')
            r=c.get('/api/health',headers={'X-Forwarded-Proto':'https'})
            self.assertEqual(r.status_code,200)
            self.assertEqual(r.headers['strict-transport-security'],'max-age=31536000')
            self.assertEqual(r.headers['cache-control'],'no-store')
            local=TestClient(server.app,base_url='http://127.0.0.1').get('/api/health')
            self.assertEqual(local.status_code,200)
            self.assertNotIn('strict-transport-security',local.headers)
    def test_secure_cookie_and_login_through_tunnel(self):
        with patch.object(server,'PUBLIC_URL',PUBLIC),patch.dict(os.environ,{'COOKIE_SECURE':'1'}):
            c=TestClient(server.app,base_url=PUBLIC,client=('127.0.0.1',1234),headers={'X-Club':'1','X-Forwarded-Proto':'https','Origin':PUBLIC})
            if server.has_owner():
                r=c.post('/api/login',json={'name':'AccountOwner','password':'Owner-password-123'})
            else:
                r=c.post('/api/register',json={'name':'PublicOwner','password':'Owner-password-123','setup_token':server.setup_token})
            self.assertEqual(r.status_code,200,r.text)
            cookie=r.headers['set-cookie'].lower()
            for part in ['secure','httponly','samesite=strict']: self.assertIn(part,cookie)
            self.assertIsNotNone(c.get('/api/me').json()['user'])
            self.assertEqual(c.post('/api/invites',json={}).status_code,200)
            self.assertEqual(c.post('/api/invites',json={},headers={'Origin':'https://unrelated.example'}).status_code,403)
    def test_auth_limits_are_per_cloudflare_visitor(self):
        with patch.object(server,'PUBLIC_URL',PUBLIC):
            c=TestClient(server.app,base_url=PUBLIC,client=('127.0.0.1',1234),headers={'X-Club':'1','X-Forwarded-Proto':'https'})
            for _ in range(15):
                self.assertEqual(c.post('/api/login',json={'name':'UnknownVisitor','password':'Wrong-password-123'},headers={'CF-Connecting-IP':'198.51.100.10'}).status_code,401)
            self.assertEqual(c.post('/api/login',json={'name':'UnknownVisitor','password':'Wrong-password-123'},headers={'CF-Connecting-IP':'198.51.100.10'}).status_code,429)
            self.assertEqual(c.post('/api/login',json={'name':'DifferentVisitor','password':'Wrong-password-123'},headers={'CF-Connecting-IP':'198.51.100.11'}).status_code,401)
            clear_limits()
