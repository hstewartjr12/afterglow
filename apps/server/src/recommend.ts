import type { LibraryEntry, Preferences, Recommendation, VnSummary } from "@afterglow/shared";

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));

type Components={explicit:number;learned:number;constraints:number;quality:number;novelty:number};

function behaviorSignal(item:LibraryEntry){
 let signal=item.favorite?2:0;
 if(item.status==="dropped")signal-=2.5;
 else if(item.status==="completed")signal+=.25;
 if(item.personalRating!=null){
  if(item.personalRating>=8)signal+=(item.personalRating-7)*.75;
  else if(item.personalRating<=4)signal-=(5-item.personalRating)*.75;
 }
 return clamp(signal,-4,4);
}

function learnedTaste(library:LibraryEntry[],includeSpoilers:boolean){
 const learned=new Map<string,{name:string;weight:number}>();
 for(const item of library){
  const signal=behaviorSignal(item);if(!signal)continue;
  for(const tag of item.vn.tags.filter(tag=>includeSpoilers||tag.spoiler===0)){const current=learned.get(tag.id)?.weight??0;learned.set(tag.id,{name:tag.name,weight:current+signal*clamp(tag.rating/3)});}
 }
 return learned;
}

function explicitFit(vn:VnSummary,prefs:Preferences){
 if(!prefs.tagPreferences.length)return{score:.5,positive:[] as string[],negative:[] as string[]};
 const eligible=vn.tags.filter(tag=>prefs.useSpoilerTagsInRecommendations||tag.spoiler===0);const tags=new Map(eligible.map(tag=>[tag.id,tag]));
 const tagsByName=new Map(eligible.map(tag=>[tag.name.toLowerCase(),tag]));
 let positiveTotal=0,positiveMatch=0,avoidTotal=0,avoidMatch=0;const positive:string[]=[];const negative:string[]=[];
 for(const pref of prefs.tagPreferences){
  const tag=tags.get(pref.id)??tagsByName.get(pref.name.toLowerCase());const relevance=tag?clamp(tag.rating/3):0;
  if(pref.weight>0){positiveTotal+=pref.weight;positiveMatch+=pref.weight*relevance;if(relevance>=.25&&tag?.spoiler===0)positive.push(pref.name);}
  else if(pref.weight<0){avoidTotal+=Math.abs(pref.weight);avoidMatch+=Math.abs(pref.weight)*relevance;if(relevance>=.25&&tag?.spoiler===0)negative.push(pref.name);}
 }
 const attraction=positiveTotal?positiveMatch/positiveTotal:0;const aversion=avoidTotal?avoidMatch/avoidTotal:0;
 return{score:clamp(.5+.5*attraction-aversion),positive,negative};
}

function learnedFit(vn:VnSummary,learned:Map<string,{name:string;weight:number}>,includeSpoilers:boolean){
 if(!learned.size)return{score:.5,matches:[] as string[]};
 const scale=Math.max(...[...learned.values()].map(x=>Math.abs(x.weight)),1);let signed=0,weight=0;
 const matches:{name:string;value:number}[]=[];
 for(const tag of vn.tags.filter(tag=>includeSpoilers||tag.spoiler===0)){const value=(learned.get(tag.id)?.weight??0)/scale;if(!value)continue;const relevance=clamp(tag.rating/3);signed+=value*relevance;weight+=relevance;if(value>0&&tag.spoiler===0)matches.push({name:tag.name,value:value*relevance});}
 const signal=weight?clamp(signed/Math.max(1,Math.sqrt(weight)),-1,1):0;
 return{score:clamp(.5+.5*signal),matches:matches.sort((a,b)=>b.value-a.value).map(x=>x.name)};
}

function constraintFit(vn:VnSummary,prefs:Preferences){
 const checks:number[]=[];
 if(prefs.preferredLengths.length)checks.push(vn.length&&prefs.preferredLengths.includes(vn.length)?1:0);
 if(prefs.preferredPlatforms.length)checks.push(vn.platforms.some(platform=>prefs.preferredPlatforms.includes(platform))?1:0);
 return checks.length?checks.reduce((a,b)=>a+b,0)/checks.length:.5;
}

function qualityFit(vn:VnSummary){
 const rating=vn.rating==null?.5:clamp((vn.rating-55)/35);const popularity=clamp(Math.log10(Math.max(1,vn.voteCount))/4);
 return rating*.8+popularity*.2;
}

function noveltyFit(vn:VnSummary,learned:Map<string,{name:string;weight:number}>,includeSpoilers:boolean){
 const tags=vn.tags.filter(tag=>includeSpoilers||tag.spoiler===0);const positive=new Set([...learned].filter(([,x])=>x.weight>0).map(([id])=>id));if(!positive.size||!tags.length)return.5;
 const familiar=tags.reduce((sum,tag)=>sum+(positive.has(tag.id)?clamp(tag.rating/3):0),0)/Math.max(1,Math.min(tags.length,8));
 return clamp(1-familiar*.65);
}

function profileConfidence(prefs:Preferences,library:LibraryEntry[]){
 const explicit=Math.min(.4,prefs.tagPreferences.length*.04);const behavior=Math.min(.25,library.filter(item=>Math.abs(behaviorSignal(item))>=.5).length*.05);
 return clamp(.35+explicit+behavior,.35,1);
}

export function rankRecommendations(candidates:VnSummary[],library:LibraryEntry[],prefs:Preferences,excludeOwned=true,limit=12):Recommendation[]{
 const owned=new Set(library.map(x=>x.vndbId));const includeSpoilers=prefs.useSpoilerTagsInRecommendations;const learned=learnedTaste(library,includeSpoilers);const confidence=profileConfidence(prefs,library);
 return candidates.filter(v=>!excludeOwned||!owned.has(v.id)).map(v=>{
  const explicit=explicitFit(v,prefs);const learnedResult=learnedFit(v,learned,includeSpoilers);
  const components:Components={explicit:explicit.score,learned:learnedResult.score,constraints:constraintFit(v,prefs),quality:qualityFit(v),novelty:noveltyFit(v,learned,includeSpoilers)};
  const raw=(components.explicit*.55+components.learned*.20+components.constraints*.10+components.quality*.10+components.novelty*.05)*100;
  const score=50+confidence*(raw-50);const reasons:string[]=[];
  if(explicit.positive.length)reasons.push(`Matches ${explicit.positive.slice(0,2).join(" and ")}`);
  if(explicit.negative.length)reasons.push(`Includes a theme you avoid: ${explicit.negative[0]}`);
  if(learnedResult.matches.length)reasons.push(`Echoes themes from your favorites and ratings: ${learnedResult.matches.slice(0,2).join(", ")}`);
  if(v.length&&prefs.preferredLengths.includes(v.length))reasons.push("Fits your preferred reading length");
  if(v.platforms.some(p=>prefs.preferredPlatforms.includes(p)))reasons.push("Available on a preferred platform");
  if((v.rating??0)>=80)reasons.push("Highly rated by VNDB readers");else if((v.rating??0)>=70)reasons.push("Well rated by VNDB readers");
  if(!reasons.length)reasons.push("A well-regarded discovery from the VNDB community");
  return{vn:v,score,matchPercent:Math.round(clamp(score,0,100)),reasons:reasons.slice(0,3)};
 }).sort((a,b)=>b.score-a.score).slice(0,limit);
}
