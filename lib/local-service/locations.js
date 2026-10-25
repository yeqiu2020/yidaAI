'use strict';
const path=require('path');

function serviceLocations(projectRoot,httpPort=8080) {
  projectRoot=path.resolve(projectRoot);
  const parent=path.dirname(projectRoot);
  const staticRoot=parent===path.parse(parent).root?projectRoot:parent;
  const projectSegment=staticRoot===projectRoot?'':'/'+encodeURIComponent(path.basename(projectRoot));
  const origin='http://127.0.0.1:'+httpPort;
  const portal=origin+projectSegment+'/本地操作页面/index.html';
  return {origin,staticRoot,projectSegment,portal,portalEncoded:origin+projectSegment+'/'+encodeURIComponent('本地操作页面')+'/index.html',markdown:'[🏠 打开本地操作页面]('+portal+')'};
}
module.exports={serviceLocations};
