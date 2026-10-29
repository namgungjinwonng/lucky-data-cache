// Optional release-time cache rebuild. Scores always exclude the target draw from training.
// Node >= 22.13 is required for stripTypeScriptTypes; this is not part of ordinary builds.
import fs from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {createHash} from 'node:crypto'
const url=s=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(s)).toString('base64')
const helper=url(fs.readFileSync('src/core/dispersion.ts','utf8'))
const source=fs.readFileSync('src/core/analysis.ts','utf8').replace("from './dispersion'",`from '${helper}'`)
const {createAnalysisModel,toRanked}=await import(url(source))
const draws=JSON.parse(fs.readFileSync('public/data/history.json','utf8')).draws.sort((a,b)=>a.round-b.round)
const scores=[]
for(let i=20;i<draws.length;i++){
 const model=createAnalysisModel(draws.slice(0,i),30_000)
 const score=toRanked([model.scoreNumbers(draws[i].numbers)],model.mean,model.deviation)[0].score
 const signature=createHash('sha256').update(JSON.stringify(draws.slice(0,i+1).map(d=>[d.round,d.numbers]))).digest('hex')
 scores.push({round:draws[i].round,score,signature})
}
fs.writeFileSync('src/core/pattern-seed.json',JSON.stringify(scores))
console.log('Rebuilt',scores.length,'pre-draw score cache entries')
