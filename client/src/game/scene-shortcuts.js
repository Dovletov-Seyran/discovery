import {SCENE_SHORTCUTS} from '../../../shared/scene-shortcuts.js';
export function sceneShortcut(event,{connected,send,notify}){
 if(!connected||!(event.ctrlKey||event.altKey)||event.metaKey||event.shiftKey||!/^Digit[1-9]$/.test(event.code))return false;
 if(event.target?.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName??''))return false;
 event.preventDefault();event.stopPropagation();
 if(event.repeat)return true;
 const index=Number(event.code.slice(5));
 if(!send('scene_shortcut',{index}))notify('Нет связи с сервером.');
 return true;
}
export {SCENE_SHORTCUTS};
