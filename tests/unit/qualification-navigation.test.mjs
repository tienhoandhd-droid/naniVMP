import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../../src/components/layout/Layout.tsx';
import { parseAccessContext } from '../../src/lib/access.ts';
globalThis.React = React;
test('verified VMP sidebar has a standalone qualification group with subsystem links',()=>{
 const access=parseAccessContext({ok:true,business_role:'qa_staff',screens:{today:{can_view:true,actions:['view'],data_scope:'own'}}});
 const html=renderToStaticMarkup(React.createElement(Sidebar,{view:'today',setView:()=>{},user:{name:'Synthetic QA'},access,onLogout:()=>{},onChangePw:()=>{}}));
 assert.match(html, /href="\?qualification=index.html/);
 assert.match(html, /<section[^>]*data-nav-group="qualification"/);
 assert.match(html, /aria-label="Thẩm định thực tế"/);
 for(const href of ['?qualification=index.html','?qualification=steam.html','?qualification=gas.html%3Fsystem%3Dair','?qualification=gas.html%3Fsystem%3Dnitrogen','?qualification=runs.html'])assert.ok(html.includes('href="'+href+'"'),href);
 const group=html.match(/<section[^>]*data-nav-group="qualification"[\s\S]*?<\/section>/)?.[0];assert.ok(group);assert.ok(html.indexOf(group)>html.indexOf('THỰC HIỆN'),'qualification follows ordinary groups');
 assert.equal((html.match(/data-nav-group="qualification"/g)||[]).length,1);

 assert.equal(access.canView('qualification'),false);
});

test('workshop roles do not see the qualification module even with normal VMP screens',()=>{
 for(const business_role of ['workshop_manager','workshop_staff']) {
  const access=parseAccessContext({ok:true,business_role,screens:{today:{can_view:true,actions:['view'],data_scope:'own'}}});
  const html=renderToStaticMarkup(React.createElement(Sidebar,{view:'today',setView:()=>{},user:{name:'Synthetic'},access,onLogout:()=>{},onChangePw:()=>{}}));
  assert.doesNotMatch(html,/data-module="qualification"/);
 }
});
