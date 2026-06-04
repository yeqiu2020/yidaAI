'use strict';

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, 'connector-presets');

const PRESET_INDEX = {
  'G-CONN-1016B8AEBED50B01B8D00009::G-ACT-1016B8B1911A0B01B8D0000I': {
    inputsFile: 'todo-create-task-inputs.json',
    outputsFile: 'todo-create-task-outputs.json',
    description: '创建待办任务 - 待办2.0',
    openDevSchemaType: 'normal',
  },
};

const loadedCache = {};
function loadPresetJson(fileName) {
  if (loadedCache[fileName]) {
    return loadedCache[fileName];
  }
  const filePath = path.join(PRESETS_DIR, fileName);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    loadedCache[fileName] = JSON.parse(raw);
    return loadedCache[fileName];
  } catch (err) {
    return null;
  }
}

function lookupConnectorPreset(connectorId, actionId) {
  if (!connectorId || !actionId) {
    return null;
  }
  const key = `${connectorId}::${actionId}`;
  const entry = PRESET_INDEX[key];
  if (!entry) {
    return null;
  }
  const inputs = loadPresetJson(entry.inputsFile);
  const outputs = loadPresetJson(entry.outputsFile);
  if (!Array.isArray(inputs)) {
    return null;
  }
  return {
    inputs,
    outputs: Array.isArray(outputs) ? outputs : [],
    description: entry.description || '',
    openDevSchemaType: entry.openDevSchemaType || 'normal',
  };
}

function lookupConnectorInputsPreset(connectorId, actionId) {
  const preset = lookupConnectorPreset(connectorId, actionId);
  return preset ? preset.inputs : null;
}

function generateConnectorRuleId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'rule-';
  for (let i = 0; i < 20; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function buildConnectorRulesFromInputs(inputsSchema, assignments) {
  if (!Array.isArray(inputsSchema) || inputsSchema.length === 0) {
    return [];
  }
  const assignMap = {};
  (assignments || []).forEach((a) => {
    if (a && a.column) {
      assignMap[a.column] = a;
    }
  });

  return inputsSchema.map((input) => {
    const base = cloneInputSchema(input);
    base.id = input.name;
    base.parentId = '';

    if (Array.isArray(base.childList)) {
      base.childList = base.childList.map((child) => {
        const cloned = cloneInputSchema(child);
        cloned.id = `${input.name}%${child.name}`;
        cloned.parentId = input.name;
        return cloned;
      });
    }

    const assign = assignMap[input.name];
    if (assign) {
      const innerBase = cloneInputSchema(input);
      innerBase.id = input.name;
      innerBase.parentId = '';
      innerBase.valueType = assign.valueType || 'processVar';
      innerBase.value = assign.valueType === 'literal' && !Number.isNaN(Number(assign.value))
        ? Number(assign.value)
        : assign.value;
      innerBase.ruleId = assign.ruleId || generateConnectorRuleId();
      innerBase.valueLabel = assign.valueLabel || input.label || input.name;
      base.rules = [innerBase];
    } else {
      base.rules = [];
    }
    return base;
  });
}

function cloneInputSchema(input) {
  return JSON.parse(JSON.stringify(input));
}

function buildFallbackInputsFromAssignments(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return [];
  }
  return assignments.map((item) => ({
    childList: null,
    componentName: 'TextField',
    componentOption: '',
    componentProps: null,
    convert: '',
    defaultValue: '',
    desc: '',
    display: true,
    itemType: '',
    label: item.column,
    name: item.column,
    order: null,
    paramType: 'String',
    queryDefaultValue: null,
    required: false,
    successCondition: '',
    successFlag: null,
  }));
}

module.exports = {
  lookupConnectorPreset,
  lookupConnectorInputsPreset,
  buildConnectorRulesFromInputs,
  buildFallbackInputsFromAssignments,
  generateConnectorRuleId,
};
