# Local-only integration test; requires websocket-client and a disposable local D1 database.
import json,urllib.request,urllib.error,uuid,websocket,time
base='http://127.0.0.1:8788';management='/local-private-management';opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(path,body=None,method=None):
 r=opener.open(urllib.request.Request(base+management+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Authorization':'Bearer local-test','Content-Type':'application/json'}),timeout=20);return json.load(r)
name='native-quota-'+uuid.uuid4().hex[:6];created=api('/api/users',{'username':name,'days':1,'dataGb':1,'engine':'native','settings':{'dataLimitBytes':1024,'maxConnections':1,'requestLimit':2}});a=api('/api/native/users/'+name)
header=bytes([0])+uuid.UUID(a['uuid']).bytes+bytes([0,2,0,53,1,1,1,1,1])
ws=websocket.create_connection('ws://127.0.0.1:8788/edge/native',timeout=8);ws.send_binary(header);assert ws.recv()==b'\0\0'
status=api('/api/native/users/'+name+'/status');assert status['usedBytes']==1024 and status['connections']==1 and status['requests']==1
second=websocket.create_connection('ws://127.0.0.1:8788/edge/native',timeout=8);second.send_binary(header);assert not second.recv();second.close()
ws.close();time.sleep(.2);status=api('/api/native/users/'+name+'/status');assert status['usedBytes']==0 and status['connections']==0 and status['requests']==1
for fmt in ['raw','base64','clash','xray']:
 r=opener.open(base+created['subscriptionPath']+('?' if '?' not in created['subscriptionPath'] else '&')+'format='+fmt);assert r.status==200
try:opener.open(base+'/feed/'+name);raise AssertionError('Unprotected subscription')
except urllib.error.HTTPError as e:assert e.code==404
api('/api/native/users/'+name+'/reset',{'action':'requests'});assert api('/api/native/users/'+name+'/status')['requests']==0
qr=opener.open(urllib.request.Request(base+management+'/api/native/users/'+name+'/qr',headers={'Authorization':'Bearer local-test'}));assert qr.headers.get('content-type')=='image/svg+xml'
api('/api/native/users/'+name,method='DELETE')
print('PASS: real Workers runtime, VLESS WS authentication, atomic D1 traffic reservation/refund, concurrent connection denial, counters/reset, four formats, subscription token, local QR')
