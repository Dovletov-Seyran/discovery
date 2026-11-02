import{randomInt}from'node:crypto';
import{SUITS,RANKS,handValue}from'../../shared/feast-games.js';
export function shuffledDeck(random=randomInt){
 const deck=SUITS.flatMap(suit=>RANKS.map(rank=>`${suit}:${rank}`));
 for(let i=deck.length-1;i>0;i--){const j=random(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;
}
export function playDealer(deck,hand){while(handValue(hand)<17&&deck.length)hand.push(deck.pop());return hand;}
