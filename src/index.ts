import './styles.css';
import { registerBarrage } from './barrage';
import { MODULE_ID } from './constants';
import { registerSettings } from './settings';
import { registerCounteract } from './counteract';
import { registerGlimpse } from './glimpse';
import { awardXp, openAwardXp, registerXp, sparklePCs } from './xp';

interface ModuleApi {
  version: string;
  openAwardXp: typeof openAwardXp;
  awardXp: typeof awardXp;
  sparklePCs: typeof sparklePCs;
}

registerSettings();
registerBarrage();
registerGlimpse();
registerCounteract();
registerXp();

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = { version, openAwardXp, awardXp, sparklePCs };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
  console.log(`${MODULE_ID} | ready (v${version})`);
});
