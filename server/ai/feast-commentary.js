import{getAgent}from'./agents.js';
import{chat}from'./llm.js';
// Only public facts supplied by the game. No hands, deck or upcoming cards enter the prompt.
export async function feastCommentary({event,round,players,previous}){
 if(process.env.AI==='0')return null;
 const agent=getAgent('storyteller');
 const result=await chat([{role:'system',content:`You are ${agent.name}. ${agent.persona} Comment on a friendly game of 21 aboard the ship in 1492. One lively Russian sentence, at most 18 words. No bets, new rules or claims about hidden cards. Use only the public event. Previous statistics are from completed hands; do not guess current totals.`},{role:'user',content:JSON.stringify({event,round,players,previous})}],{priority:-1,preemptible:true,maxTokens:55,temperature:.55,timeoutMs:4500});
 const text=result.text.replace(/[\n<>]/g,' ').trim();return /[а-яё]/i.test(text)&&text.length<220?text:null;
}
