/** Visual-only Shanghai day/night palette. Uses the existing campaign clock;
 * never changes elapsed time, save format, enemy rules or supply refresh. */
const mix=(a:number,b:number,t:number)=>{let out=0;for(const s of [16,8,0])out|=Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t)<<s;return out;};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function daylightProfile(rawHour:number) {
 const hour=Number.isFinite(rawHour)?((rawHour%24)+24)%24:8;
 const daylight=hour>6&&hour<18?Math.sin((hour-6)/12*Math.PI):0;
 const twilight=Math.max(clamp(1-Math.abs(hour-6.3)/1.7),clamp(1-Math.abs(hour-17.7)/1.7));
 const stage=hour<5||hour>=19?'夜晚':hour<7?'黎明':hour<17?'白晝':'黃昏';
 const lamps=1-clamp((daylight-.08)/.27);
 const sky=mix(mix(0x101a2b,0xa8c6cf,daylight),0xb58b74,twilight*.55);
 return {hour,daylight,stage,lamps,sky,vignette:.82-daylight*.68,hemiSky:mix(0x5d7396,0xdfe6ea,daylight),ground:mix(0x27313b,0x929491,daylight),key:mix(mix(0x8fa6d6,0xfffaf2,daylight),0xffa868,twilight*.75),hemiIntensity:1.15+daylight*1.65,keyIntensity:.65+daylight*1.8,exposure:1.15+daylight*.12,fogNear:60+daylight*80,fogFar:220+daylight*240};
}
