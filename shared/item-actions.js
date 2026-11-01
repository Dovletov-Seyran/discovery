// Every inventory item has an explicit action. Quantities/effects are decided by the server.
export const ITEM_RULES={
 compass:{effect:'compass',cooldown:400},map:{effect:'map',cooldown:400},astrolabe:{effect:'astrolabe',cooldown:400},
 wine:{effect:'drink',cooldown:1200,servings:3,drunkMs:10000,strength:.35},
 rum:{effect:'drink',cooldown:1500,servings:2,drunkMs:20000,strength:.65},
 sword:{effect:'swing',cooldown:580},espingarda:{effect:'shot',cooldown:2500},
 barrel:{effect:'supplies',target:'well',cooldown:500},
 barrel_full:{effect:'water',target:'boat',cooldown:1000,servings:3,energy:12},
 tar:{effect:'supplies',target:'carpenter',cooldown:500},planks:{effect:'supplies',target:'carpenter',cooldown:500},
 purse:{effect:'wallet',cooldown:400},
 cheese:{effect:'food',cooldown:1000,servings:1,energy:35},
 meat:{effect:'food',cooldown:1000,servings:1,energy:50},
 biscuit:{effect:'food',cooldown:1000,servings:1,energy:20},
};
export const freshVitals=()=>({stamina:100,drunkUntil:0,drunkStrength:0});
