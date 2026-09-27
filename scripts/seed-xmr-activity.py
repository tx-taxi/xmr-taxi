#!/usr/bin/env python3
"""Build reproducible hourly Monero transaction counts from a daemon's headers.
Usage: seed-xmr-activity.py RPC_URL OUTPUT.json.gz
Miner transactions are excluded by monerod's num_txes field.
"""
import gzip, json, sys, time, urllib.request
from collections import defaultdict
rpc_url, output = sys.argv[1:]
def rpc(method, params=None):
    body=json.dumps({'jsonrpc':'2.0','id':'activity','method':method,'params':params or {}}).encode()
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(rpc_url.rstrip('/')+'/json_rpc',body,{'Content-Type':'application/json'}),timeout=30) as response:
                value=json.load(response)
            if value.get('error'): raise ValueError(value['error'])
            return value['result']
        except Exception:
            if attempt==4: raise
            time.sleep(attempt+1)
tip=rpc('get_block_count')['count']-61
hours=defaultdict(lambda:[0,0]); previous=None
for start in range(0,tip+1,1000):
    end=min(tip,start+999)
    headers=rpc('get_block_headers_range',{'start_height':start,'end_height':end,'fill_pow_hash':False})['headers']
    assert len(headers)==end-start+1, 'Incomplete header range'
    for height,h in zip(range(start,end+1),headers):
        assert h['height']==height and not h['orphan_status']
        if previous is not None: assert h['prev_hash']==previous, 'Discontinuous chain'
        previous=h['hash']; hour=h['timestamp']//3600*3600
        hours[hour][0]+=h['num_txes']; hours[hour][1]+=1
    if start%100000==0: print(f'{end}/{tip}',flush=True)
    time.sleep(0.03)
result={'version':1,'throughHeight':tip,'throughHash':previous,'throughTimestamp':h['timestamp'],'generatedAt':int(time.time()),'hours':[[h,*counts] for h,counts in sorted(hours.items())]}
with gzip.open(output,'wt') as f: json.dump(result,f,separators=(',',':'))
print(json.dumps({'height':tip,'hours':len(hours),'transactions':sum(v[0] for v in hours.values()),'output':output}),flush=True)
