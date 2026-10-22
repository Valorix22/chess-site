"""Explicit account relationships for legacy game tests."""
import server

def clear_limits():
    server.failures.clear()
    with server.lock:server.db.execute('DELETE FROM action_limits')

def befriend(first,second):
    a=first.get('/api/me').json()['user'];b=second.get('/api/me').json()['user']
    with server.lock:
        left,right=sorted((a['id'],b['id']))
        server.db.execute("INSERT INTO friendships VALUES(?,?,?,'accepted',0,0) ON CONFLICT(left_id,right_id) DO UPDATE SET status='accepted'",(left,right,a['id']))
