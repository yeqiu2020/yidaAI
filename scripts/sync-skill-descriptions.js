#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {descriptionFromSkill}=require('../lib/core/skill-metadata');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'.agents/skills/skill-config.json');
const config=JSON.parse(fs.readFileSync(file,'utf8'));
let count=0;
for(const skill of config.skills) {
  const description=descriptionFromSkill(fs.readFileSync(path.join(root,skill.path,'SKILL.md'),'utf8'));
  if(!description)throw Error('Missing description: '+skill.name);
  if(skill.description!==description){skill.description=description;count++;}
}
if(count)fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n','utf8');
console.log(`description 同步完成：${count} 项更新`);
