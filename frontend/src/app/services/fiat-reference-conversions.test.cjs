'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const source = path.join(__dirname, 'fiat-reference-conversions.ts');
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = new Module(source, module); mod.filename = source; mod.paths = module.paths; mod._compile(compiled, source);
const {FiatReferenceConversions} = mod.exports;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const asOf='2026-10-28'; let clock=Date.parse(asOf+'T15:00:00Z');

test('only missing live selected currencies are supplemented and native USD/direct rates win', async () => {
 let calls=0, info, last;
 const fx=new FiatReferenceConversions(true,value=>{info=value},async()=>{calls++;return Response.json({base:'USD',asOf,stale:false,rates:{USD:1,CAD:1.4,EUR:0.9}})},()=>clock);
 fx.subscribe(value=>{last=value});
 fx.next({USD:100,EUR:95});
 assert.equal(calls,0);
 fx.select('EUR'); assert.equal(last.EUR,95); assert.equal(calls,0);
 fx.select('CAD'); await tick(); assert.equal(calls,1); assert.equal(last.USD,100); assert.equal(last.CAD,140); assert.equal(last.EUR,95); assert.deepEqual(info,{asOf,stale:false});
 fx.next({USD:110,CAD:150,EUR:99}); assert.equal(last.CAD,150); assert.equal(last.USD,110); assert.equal(info,null);
 fx.next({USD:120,EUR:105}); assert.equal(last.CAD,168); assert.equal(calls,1);
 fx.select('USD'); assert.equal(info,null); assert.equal(last.USD,120); assert.equal(last.CAD,undefined);
});

test('outage marks retained rates stale, honors retry budget and never fabricates absent quotes', async () => {
 let calls=0, online=true, info, last; clock=Date.parse(asOf+'T15:00:00Z');
 const fx=new FiatReferenceConversions(true,value=>{info=value},async()=>{calls++;return online?Response.json({base:'USD',asOf,stale:false,rates:{USD:1,CAD:1.4}}):new Response('',{status:503})},()=>clock);
 fx.subscribe(value=>{last=value}); fx.select('CAD'); fx.next({USD:100}); await tick(); assert.equal(last.CAD,140);
 clock+=3600001; online=false; fx.next({USD:110}); await tick(); assert.equal(last.CAD,154); assert.equal(info.stale,true); assert.equal(calls,2);
 fx.next({USD:111}); await tick(); assert.equal(calls,2);
 fx.next({USD:0}); assert.equal(last.CAD,undefined); assert.equal(info,null);
 clock+=8*86400000; fx.next({USD:100}); await tick(); assert.equal(last.CAD,undefined); assert.equal(info,null);
});


test('requests only the configured valid router origin and ignores malformed URLs', async () => {
 let urls=[], last;
 const fx=new FiatReferenceConversions(true,()=>{},async url=>{urls.push(url);return Response.json({base:'USD',asOf,stale:false,rates:{USD:1,CAD:1.4}})},()=>clock=Date.parse(asOf+'T15:00:00Z'));
 fx.subscribe(value=>{last=value});
 fx.setRouterUrl('http://127.0.0.1:4758/'); fx.select('CAD'); fx.next({USD:100}); await tick();
 assert.deepEqual(urls,['http://127.0.0.1:4758/api/v1/fiat-rates']); assert.equal(last.CAD,140);
 for (const bad of ['javascript:alert(1)','https://trusted.example@evil.example','https://tx.taxi/path','https://tx.taxi/?token=123','//invalid']) {
   fx.setRouterUrl(bad); fx.next({USD:100}); await tick(); assert.equal(last.CAD,undefined);
 }
 assert.equal(urls.length,1);
});

test('SSR never fetches, even when a non-USD currency is selected', async () => {
 let calls=0, last;
 const fx=new FiatReferenceConversions(false,()=>{},async()=>{calls++;throw Error('should not fetch')});
 fx.subscribe(value=>{last=value}); fx.setRouterUrl('http://127.0.0.1:4758'); fx.select('CAD'); fx.next({USD:100}); await tick();
 assert.equal(calls,0); assert.equal(last.USD,100); assert.equal(last.CAD,undefined);
});


test('an old router response cannot overwrite a newly configured router', async () => {
 let finishOld, last;
 const fx=new FiatReferenceConversions(true,()=>{},url=>String(url).includes('4757') ? new Promise(resolve=>{finishOld=resolve}) : Promise.resolve(Response.json({base:'USD',asOf,stale:false,rates:{USD:1,CAD:1.4}})),()=>Date.parse(asOf+'T15:00:00Z'));
 fx.subscribe(value=>{last=value}); fx.setRouterUrl('http://127.0.0.1:4757'); fx.select('CAD'); fx.next({USD:100});
 fx.setRouterUrl('http://127.0.0.1:4758'); await tick(); assert.equal(last.CAD,140);
 finishOld(Response.json({base:'USD',asOf,stale:false,rates:{USD:1,CAD:1.9}})); await tick(); assert.equal(last.CAD,140);
});
