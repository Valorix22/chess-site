"""Idempotent publication of the supplied six exercises and three real lessons.

No demo users, activity, memberships, ratings or progress are seeded.
"""
import json,time
from pathlib import Path


def publish(s,e,owner):
    rows=json.loads((Path(s['BASE'])/'seeds/training.json').read_text());count=0
    with e['atomic']():
        for item in rows:
            if s['db'].execute('SELECT 1 FROM content WHERE id=?',(item['id'],)).fetchone():continue
            data=e['content_normalize'](item['kind'],item['data']);now=time.time()
            s['db'].execute('INSERT INTO content VALUES(?,?,?,?,?,?,?,?,?)',(item['id'],item['kind'],owner['id'],item.get('parent'),item['title'],json.dumps(data),'published',now,now));count+=1
    if count:e['audit']('training.publish-starter',owner,after={'items':count})
    return count
