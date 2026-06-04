'use strict';

const crypto = require('crypto');

function generateNodeId() {
  const randomPart = crypto.randomBytes(6).toString('hex').slice(0, 11);
  return `node_${randomPart}`;
}

function generateButtonUuid() {
  return `button-${crypto.randomBytes(10).toString('hex').toUpperCase().slice(0, 20)}`;
}

function generateProcessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'LPROC-';
  for (let index = 0; index < 38; index++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateRuleItemId() {
  const hex = () => crypto.randomBytes(2).toString('hex');
  const hex4 = () => crypto.randomBytes(4).toString('hex');
  return `item-${hex4()}-${hex()}-${hex()}-${hex()}-${hex4()}${hex()}`;
}

function generateRuleGroupId() {
  const hex = () => crypto.randomBytes(2).toString('hex');
  const hex4 = () => crypto.randomBytes(4).toString('hex');
  return `group-${hex4()}-${hex()}-${hex()}-${hex()}-${hex4()}${hex()}`;
}

function generateDataRuleId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'rule-';
  for (let index = 0; index < 20; index++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

module.exports = {
  generateNodeId,
  generateButtonUuid,
  generateProcessCode,
  generateRuleItemId,
  generateRuleGroupId,
  generateDataRuleId,
};
