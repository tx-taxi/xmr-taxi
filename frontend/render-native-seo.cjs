'use strict';
// Project the existing information content into the normal Angular document.
// Angular replaces app-root on bootstrap; scripts, assets and application routes stay intact.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domino = require('domino');
const config = require('./native-seo-pages.json');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = filename => fs.readFileSync(path.join(__dirname, filename), 'utf8');
const documentFor = html => domino.createDocument(html);
function intro() {
  return read('src/app/shared/components/tx-taxi-docs-intro/tx-taxi-docs-intro.component.html')
    .replace(/{{\s*chainName\s*}}/g, config.chain).replace(/{{\s*context\s*}}/g, 'explorer');
}
function templateContent(page) {
  const document = documentFor('<body>' + read(page.template).replace(/<app-tx-taxi-docs-intro\b[^>]*><\/app-tx-taxi-docs-intro>/g, intro()) + '</body>');
  if (page.section) {
    const section = Array.from(document.querySelectorAll('section')).find(node => (node.getAttribute('*ngif') || '').includes("'" + page.section + "'"));
    if (!section) throw new Error('Missing documentation section: ' + page.path);
    const nav = config.pages.filter(item => item.kind === 'docs').map(item => `<a class="nav-link" href="${escape(item.path)}">${escape(item.title)}</a>`).join('');
    return clean(`<div class="container-xl xmr-docs">${intro()}<nav class="nav nav-tabs docs-tabs" aria-label="Documentation sections">${nav}</nav><main class="doc-content">${section.innerHTML}</main></div>`, page, false);
  }
  return clean(document.body.innerHTML, page, page.kind === 'live');
}
function clean(html, page, live) {
  const document = documentFor('<body>' + html + '</body>');
  const context = {nativeMode: config.chain === 'TON', nativeRoute: config.chain === 'TON', isMempoolModule: false, widget: false, marketPage: false, ...page.context};
  function visit(node) {
    if (node.nodeType === 3) {
      node.data = node.data.replace(/{{[\s\S]*?}}/g, '').replace(/@(?:if|else if)\s*\([^\n]*?\)\s*\{|@else\s*\{|^\s*}\s*$/gm, '');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'ng-template' || node.hasAttribute('*ngfor')) {node.parentNode.removeChild(node);return;}
    const condition = node.getAttribute('*ngif');
    if (condition && live) {
      let keep = false;
      try {keep = Boolean(vm.runInNewContext(condition, context, {timeout: 20}));} catch {}
      // No invented live values, empty-state assertions, provider errors or historical rows.
      if (!keep) {node.parentNode.removeChild(node);return;}
    }
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name;
      if (name === 'routerlink' && attribute.value.startsWith('/')) node.setAttribute('href', attribute.value);
      if (name === '[routerlink]') {
        const match = /^\[?\s*['"]([^'"]+)['"]\s*(?:\|\s*relativeUrl)?\s*\]?$/.exec(attribute.value);
        if (match) node.setAttribute('href', match[1]);
      }
      if (name.startsWith('[') || name.startsWith('(') || name.startsWith('*') || name.startsWith('#') || name.startsWith('i18n') || name.startsWith('ngb') || name === 'routerlink' || name === 'formcontrolname') node.removeAttribute(name);
    }
    for (const child of Array.from(node.childNodes)) visit(child);
    if (tag.startsWith('app-') || tag === 'fa-icon') {node.parentNode.removeChild(node);return;}
    if (tag === 'ng-container') {const parent=node.parentNode; for(const child of Array.from(node.childNodes)) parent.insertBefore(child,node); parent.removeChild(node);}
  }
  for (const node of Array.from(document.body.childNodes)) visit(node);
  return document.body.innerHTML;
}
function tonDocs(page) {
  const ts = require('typescript');
  const source = read(page.template);
  const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports = {};
  vm.runInNewContext(output, {exports}, {timeout: 1000});
  const entries = exports[page.data];
  if (!Array.isArray(entries)) throw new Error('Missing TON documentation data: ' + page.data);
  const nav = config.pages.filter(item => item.kind === 'docs').map(item => `<a class="nav-link" href="${escape(item.path)}">${escape(item.title)}</a>`).join('');
  const content = entries.map(item => item.type === 'category' ? `<h2>${escape(item.title)}</h2>` : `<article id="${escape(item.fragment)}" class="endpoint-container"><h3>${escape(item.title)}</h3>${item.path ? `<p><code>${escape(item.method || 'GET')} ${escape(item.path)}</code></p>` : ''}<div class="endpoint-content">${item.description}${item.request ? `<h4>Request</h4><pre><code>${escape(item.request)}</code></pre>` : ''}${item.response ? `<h4>Response</h4><pre><code>${escape(item.response)}</code></pre>` : ''}</div></article>`).join('');
  return clean(`<div class="container-xl">${intro()}<nav class="nav nav-tabs" aria-label="Documentation sections">${nav}</nav><main class="doc-content">${content}</main></div>`, page, false);
}
function markdown(html) {
  const document = documentFor('<body>' + html + '</body>');
  function text(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') return node.getAttribute('alt') || '';
    const inside = Array.from(node.childNodes).map(text).join('');
    if (/^h[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + inside.trim() + '\n\n';
    if (tag === 'a' && node.getAttribute('href')) return '[' + inside.trim() + '](' + node.getAttribute('href') + ')';
    if (tag === 'pre') return '\n\n```\n' + node.textContent.trim() + '\n```\n\n';
    if (tag === 'code') return '`' + inside.trim() + '`';
    if (tag === 'li') return '\n- ' + inside.trim();
    if (tag === 'tr') return '\n' + inside.trim();
    if (tag === 'td' || tag === 'th') return inside.trim() + ' | ';
    if (['p','section','article','div','main','nav','table','ul','dl','br'].includes(tag)) return '\n\n' + inside.trim() + '\n\n';
    return inside;
  }
  return Array.from(document.body.childNodes).map(text).join('').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim() + '\n';
}
function withHead(shell, page, html) {
  const document = documentFor(shell);
  const head = document.head;
  function tag(name, selector, attrs, text) {
    let node = head.querySelector(selector);
    if (!node) {node=document.createElement(name);head.appendChild(node);}
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    if (text !== undefined) node.textContent=text;
  }
  tag('style','style#native-reader-style',{id:'native-reader-style'},'[data-native-seo] .endpoint-content{display:block!important}[data-native-seo] pre{max-width:100%;overflow:auto}[data-native-seo]{overflow-wrap:anywhere}');
  const canonical=config.origin+page.path;
  const title=page.path==='/' ? config.host+' - '+page.title : page.title+' - '+config.host+' - '+config.explorerTitle;
  tag('title','title',{},title);
  tag('link','link[rel="canonical"]',{id:'canonical',rel:'canonical',href:canonical});
  tag('meta','meta[name="description"]',{name:'description',content:page.description});
  tag('meta','meta[name="robots"]',{name:'robots',content:'index, follow, max-image-preview:large'});
  for (const [key,value] of Object.entries({'og:title':title,'og:description':page.description,'og:url':canonical,'og:type':'website','og:site_name':config.host,'og:image':config.preview.url,'og:image:type':'image/jpeg','og:image:width':String(config.preview.width),'og:image:height':String(config.preview.height),'og:image:alt':config.preview.alt})) tag('meta',`meta[property="${key}"]`,{property:key,content:value});
  for (const [key,value] of Object.entries({'twitter:title':title,'twitter:description':page.description,'twitter:image':config.preview.url,'twitter:image:alt':config.preview.alt,'twitter:card':'summary_large_image'})) tag('meta',`meta[name="${key}"]`,{name:key,content:value});
  tag('link','link[rel="alternate"][type="text/markdown"]',{rel:'alternate',type:'text/markdown',href:config.origin+(page.path==='/'?'/index':page.path)+'.md'});
  tag('link','link[rel="describedby"]',{rel:'describedby',type:'text/plain',href:config.origin+'/llms.txt'});
  tag('script','script#native-seo-data',{id:'native-seo-data',type:'application/json'},JSON.stringify({preview:config.preview,pages:config.pages.map(({path,title,description})=>({path,title,description})),aliases:config.aliases}).replace(/</g,'\\u003c'));
  tag('script','script#native-page-schema',{id:'native-page-schema',type:'application/ld+json'},JSON.stringify({'@context':'https://schema.org','@type':page.kind==='docs'?'TechArticle':'WebPage',name:title,description:page.description,url:canonical}).replace(/</g,'\\u003c'));
  if (html !== null) {
    const app=document.querySelector('app-root');
    if (!app) throw new Error('Angular app-root missing from build shell');
    app.innerHTML=html;
  }
  return '<!doctype html>\n'+document.documentElement.outerHTML;
}
function build(outputDirectory) {
  const directory=path.resolve(outputDirectory || path.join(__dirname,'dist/mempool/browser'));
  const shellFile=fs.existsSync(path.join(directory,'index.html'))?path.join(directory,'index.html'):path.join(directory,'en-US/index.html');
  const shell=fs.readFileSync(shellFile,'utf8');
  const content=new Map();
  for (const page of config.pages) {
    let projection=page.template.endsWith('.ts')?tonDocs(page):templateContent(page);
    projection=projection.replace(/<main\b/g,'<div').replace(/<\/main>/g,'</div>');
    const fragment=`<main class="container-xl" data-native-seo><h1>${escape(page.title)}</h1>${page.kind==='live'?`<p>${escape(page.description)}</p>`:''}${projection}<nav aria-label="Explorer information">${config.pages.filter(item=>item.kind!=='live').map(item=>`<a href="${escape(item.path)}">${escape(item.title)}</a>`).join(' · ')}</nav></main>`;
    content.set(page.path,markdown(fragment));
    const filename=page.path==='/'?shellFile:path.join(directory,page.path,'index.html');
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,withHead(shell,page,fragment));
    const mdFile=path.join(directory,(page.path==='/'?'/index':page.path)+'.md');
    fs.mkdirSync(path.dirname(mdFile),{recursive:true});
    fs.writeFileSync(mdFile,`Canonical: ${config.origin+page.path}\n\n${content.get(page.path)}`);
  }
  const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+config.pages.map(page=>`  <url><loc>${escape(config.origin+page.path)}</loc></url>`).join('\n')+'\n</urlset>\n';
  fs.writeFileSync(path.join(directory,'sitemap.xml'),sitemap);
  const llms=`# ${config.host}\n\n> ${config.chain} explorer in the tx.taxi family.\n\n${config.limits}\n\n## Documentation and information\n\n`+config.pages.filter(page=>page.kind!=='live').map(page=>`- [${page.title}](${config.origin+page.path}): ${page.description} [Same content in Markdown](${config.origin+page.path}.md).`).join('\n')+'\n\n## Explorer pages\n\n'+config.pages.filter(page=>page.kind==='live').map(page=>`- [${page.title}](${config.origin+page.path}): ${page.description}`).join('\n')+'\n\nLive values require fresh public node/provider data. Static Markdown contains the page’s documentation and labels, not a live-data snapshot.\n';
  fs.writeFileSync(path.join(directory,'llms.txt'),llms);
  fs.writeFileSync(path.join(directory,'llms-full.txt'),llms+'\n\n'+config.pages.filter(page=>page.kind!=='live').map(page=>`Source: ${config.origin+page.path}\n\n${content.get(page.path)}`).join('\n\n'));
  fs.writeFileSync(path.join(directory,'native-seo.json'),JSON.stringify({origin:config.origin,preview:config.preview,pages:config.pages.map(({path,title,description,kind})=>({path,title,description,kind})),aliases:config.aliases},null,2)+'\n');
  const nginx=[];
  for(const page of config.pages.filter(page=>page.path!=='/')) {
    nginx.push(`location = ${page.path} { try_files ${page.path}/index.html =404; }`);
    nginx.push(`location = ${page.path}/ { return 308 ${config.origin+page.path}; }`);
  }
  for(const [alias,target] of Object.entries(config.aliases)) nginx.push(`location = ${alias} { return 308 ${config.origin+target}; }`);
  // A local add_header disables nginx's inherited header list; retain the server protections.
  const auxiliaryHeaders='add_header X-Robots-Tag "noindex, follow" always; add_header X-Content-Type-Options "nosniff" always; add_header X-Frame-Options "SAMEORIGIN" always; add_header Referrer-Policy "strict-origin-when-cross-origin" always; add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;';
  for(const filename of ['llms.txt','llms-full.txt']) nginx.push(`location = /${filename} { default_type text/plain; ${auxiliaryHeaders} try_files /${filename} =404; }`);
  nginx.push(`location = /llm.txt { return 308 ${config.origin}/llms.txt; }`);
  for(const page of config.pages) {
    const mdPath=(page.path==='/'?'/index':page.path)+'.md';
    nginx.push(`location = ${mdPath} { types { text/markdown md; } ${auxiliaryHeaders} add_header Link '<${config.origin+page.path}>; rel="canonical"' always; try_files ${mdPath} =404; }`);
  }
  nginx.push('location ~ \\.md$ { return 404; }');
  fs.mkdirSync(path.join(__dirname,'dist'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'dist/native-seo-nginx.conf'),nginx.join('\n')+'\n');
  return {pages:config.pages.length,outputDirectory:directory};
}
if(require.main===module) console.log(JSON.stringify(build(process.argv[2])));
module.exports={build,config,markdown,templateContent,tonDocs,withHead};
