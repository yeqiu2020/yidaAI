'use strict';

function descriptionFromSkill(text) {
  const normalized=String(text).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  const match=normalized.match(/^---\n([\s\S]*?)\n---/);
  if(!match)return null;
  const lines=match[1].split('\n');
  const index=lines.findIndex(line=>/^description:/.test(line));
  if(index<0)return null;
  let value=lines[index].replace(/^description:\s*/,'').trim();
  if(/^[>|][-+]?$/.test(value)) {
    const folded=value.startsWith('>');const body=[];
    for(let i=index+1;i<lines.length && (/^\s/.test(lines[i])||!lines[i]);i++)body.push(lines[i].trim());
    return body.join(folded?' ':'\n').trim();
  }
  if(value.startsWith('"')&&value.endsWith('"')) {try{return JSON.parse(value);}catch(_){return value.slice(1,-1);}}
  if(value.startsWith("'")&&value.endsWith("'"))value=value.slice(1,-1).replace(/''/g,"'");
  return value;
}

function inspectSkillText(skill, text, exists) {
  const errors=[];
  const description=descriptionFromSkill(text);
  if(!description)errors.push('缺少 frontmatter description');
  else if(description!==skill.description)errors.push('索引 description 与运行时 frontmatter 不一致，请执行 npm run skills:sync-descriptions');
  for(const match of String(text).matchAll(/\bnode\s+(?:"([^"]+)"|'([^']+)'|([^\s`<>]+))/g)) {
    const command=match[1]||match[2]||match[3];
    if(/^(?:\.agents\/|scripts\/).+\.(?:js|cjs|mjs|py)$/.test(command) && !exists(command))errors.push('文档命令入口不存在: '+command);
  }
  return errors;
}
module.exports={descriptionFromSkill,inspectSkillText};
