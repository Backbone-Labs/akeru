import pathlib,re,subprocess,concurrent.futures
root=pathlib.Path('/build/src');out=pathlib.Path('/build/out')
out.mkdir(exist_ok=True)
# Browser map decoding/shader compilation can block acknowledgements on first load.
# Keep the grace period finite: stalled peers are released after at most 180 seconds.
server_path = root / 'engine/server.cpp'
server_source = server_path.read_text()
connect_marker = '                c.peer = event.peer;'
if server_source.count(connect_marker) != 1:
 raise RuntimeError('Pinned native connect hook changed')
server_source = server_source.replace(connect_marker, connect_marker + '\n                enet_peer_timeout(c.peer, 0, 120000, 180000);', 1)
server_path.write_text(server_source)
s=(root/'enet/unix.c').read_text()
# Defense in depth for this local executable: ENet DNS, binds, sends, and connects
# are constrained in compiled transport, independent of user/config settings.
s=s.replace('enet_address_set_host (ENetAddress * address, const char * name)\n{','enet_address_set_host (ENetAddress * address, const char * name)\n{\n    if(strcmp(name, "localhost") && strcmp(name, "127.0.0.1")) { errno = EACCES; return -1; }\n')
s=s.replace('enet_socket_bind (ENetSocket socket, const ENetAddress * address)\n{','enet_socket_bind (ENetSocket socket, const ENetAddress * address)\n{\n    if(address && address->host != htonl(INADDR_LOOPBACK)) { errno = EACCES; return -1; }\n')
s=s.replace('sin.sin_addr.s_addr = INADDR_ANY;', 'sin.sin_addr.s_addr = htonl(INADDR_LOOPBACK);')
s=s.replace('enet_socket_connect (ENetSocket socket, const ENetAddress * address)\n{','enet_socket_connect (ENetSocket socket, const ENetAddress * address)\n{\n    if(!address || address->host != htonl(INADDR_LOOPBACK)) { errno = EACCES; return -1; }\n')
start=s.index('enet_socket_send (');brace=s.index('{',start);s=s[:brace+1]+'\n    if(address && address->host != htonl(INADDR_LOOPBACK)) { errno = EACCES; return -1; }\n'+s[brace+1:]
(out/'enet-loopback.c').write_text(s)
objtext=re.search(r'SERVER_OBJS = (.*?)LIBENET', (root/'Makefile').read_text(),re.S).group(1)
units=[x.replace('-standalone','')[:-2]+'.cpp' for x in re.findall(r'[a-z/]+(?:-standalone)?\.o',objtext)]
units=[x if (root/x).exists() else x[:-4]+'.c' for x in units]
units+=['enet/'+n+'.c' for n in ['callbacks','compress','host','list','packet','peer','protocol']]+[str(out/'enet-loopback.c')]
def build(u):
 c=u.endswith('.c');name=pathlib.Path(u).stem+('-c' if c else '');target=out/(u.replace('/','_')+'.o')
 cmd=['clang' if c else 'clang++','-O2','-DSTANDALONE','-DHAS_SOCKLEN_T','-I.','-Ishared','-Iengine','-Igame','-Ienet/include','-Isupport']+([] if c else ['-std=c++17','-fno-exceptions','-fno-rtti'])+['-c',u,'-o',str(target)]
 p=subprocess.run(cmd,cwd=root,capture_output=True,text=True);(out/(name+'.log')).write_text(p.stdout+p.stderr);print(u,p.returncode,flush=True);return p.returncode,str(target)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:r=list(pool.map(build,units))
if all(c==0 for c,o in r):
 p=subprocess.run(['clang++',*[o for c,o in r],'-lz','-o',str(out/'redeclipse-server')],capture_output=True,text=True);(out/'link.log').write_text(p.stdout+p.stderr);print('link',p.returncode,p.stderr[-2000:])

if any(c != 0 for c,o in r) or p.returncode: raise SystemExit(1)
