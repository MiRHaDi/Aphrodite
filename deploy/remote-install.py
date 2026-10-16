import json,os,re,subprocess,sys,time,urllib.request
from pathlib import Path
config=json.load(sys.stdin);name=config['name'];release=Path(config['release']).resolve()
assert re.fullmatch(r'[a-z][a-z0-9-]{2,48}',name)
assert release.is_relative_to(Path('/opt/aphrodite')/name/'releases')
environment={str(k):str(v) for k,v in config['env'].items()};assert all(re.fullmatch(r'[A-Z][A-Z0-9_]*',k) for k in environment)
def run(args,env=None,check=True):
 return subprocess.run(args,env=env,capture_output=True,text=True,check=check)
if run(['docker','container','inspect',name],check=False).returncode==0:raise RuntimeError('An installation already exists; no container was replaced')
image=name+':'+release.name
run(['docker','build','--tag',image,str(release)])
run(['docker','network','create',name+'-net'])
args=['docker','run','--detach','--name',name,'--restart','unless-stopped','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--network',name+'-net','--publish','127.0.0.1:'+str(config['port'])+':8080','--volume',name+'-data:/data']
args += [value for key in environment for value in ['--env',key]]+[image]
run(args,env={**os.environ,**environment})
for attempt in range(30):
 try:
  request=urllib.request.Request('http://127.0.0.1:'+str(config['port'])+'/'+environment['ADMIN_PATH']+'/api/overview',headers={'Authorization':'Bearer '+environment['ADMIN_TOKEN']})
  with urllib.request.urlopen(request,timeout=3) as response:assert response.status==200
  break
 except Exception:
  if attempt==29:raise RuntimeError('Private readiness check failed')
  time.sleep(2)
if config['domain']:
 domain=config['domain'];assert re.fullmatch(r'[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',domain)
 caddy=release/'Caddyfile';caddy.write_text(domain+' {\n reverse_proxy '+name+':8080\n}\n')
 run(['docker','run','--detach','--name',name+'-tls','--restart','unless-stopped','--network',name+'-net','--publish','80:80','--publish','443:443','--volume',str(caddy)+':/etc/caddy/Caddyfile:ro','--volume',name+'-tls-data:/data','--volume',name+'-tls-config:/config','caddy:2-alpine'])
print('Installed; private API verified; persistent volumes retained')
