import {createReadStream, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=normalize(join(fileURLToPath(new URL('..',import.meta.url))));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  const relative=decodeURIComponent(pathname==='/'?'darning-simulator/':pathname.slice(1));
  const path=normalize(join(root,relative));
  const resolved=statSync(path,{throwIfNoEntry:false})?.isDirectory()?join(path,'index.html'):path;
  if(!resolved.startsWith(root)||!statSync(resolved,{throwIfNoEntry:false})?.isFile()){response.writeHead(404).end('not found');return;}
  response.writeHead(200,{'content-type':mime[extname(resolved)]??'application/octet-stream','cache-control':'no-store'});
  createReadStream(resolved).pipe(response);
});
const port=Number(process.env.PORT??8000);
server.listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}/darning-simulator/`));
