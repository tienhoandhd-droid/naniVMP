import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../../src/components/layout/Layout.tsx';
import { parseAccessContext } from '../../src/lib/access.ts';
globalThis.React = React;
test('verified VMP sidebar links to the nested qualification workspace without changing screen permissions',()=>{
 const access=parseAccessContext({ok:true,business_role:'qa_staff',screens:{today:{can_view:true,actions:['view'],data_scope:'own'}}});
 const html=renderToStaticMarkup(React.createElement(Sidebar,{view:'today',setView:()=>{},user:{name:'Synthetic QA'},access,onLogout:()=>{},onChangePw:()=>{}}));
 assert.match(html, /href="\.\/tham-dinh-thuc-te\/"/);
 assert.match(html, /Thẩm định thực tế \(demo\)/);
 assert.equal(access.canView('qualification'),false);
});

test('workshop roles do not see the qualification module even with normal VMP screens',()=>{
 for(const business_role of ['workshop_manager','workshop_staff']) {
  const access=parseAccessContext({ok:true,business_role,screens:{today:{can_view:true,actions:['view'],data_scope:'own'}}});
  const html=renderToStaticMarkup(React.createElement(Sidebar,{view:'today',setView:()=>{},user:{name:'Synthetic'},access,onLogout:()=>{},onChangePw:()=>{}}));
  assert.doesNotMatch(html,/data-module="qualification"/);
 }
});
