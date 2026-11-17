import fs from 'fs';
const skill={Barnaby:.05,Tilly:.18,Clementine:.28,Dot:.40,Buster:.50,Rosco:.62,Maeve:.73,Vance:.84,Ace:.95};
for(const f of fs.readdirSync('.').filter(x=>/^race-(fast|mid|good|relaxed)[bc]?\.json$/.test(x))){
 const r=JSON.parse(fs.readFileSync(f));
 const R=r.rescues.filter(x=>x.who!=='You'); const early=R.filter(x=>x.t<60);
 const dbl=[]; for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++) if(R[i].who===R[j].who&&R[j].t-R[i].t<10) dbl.push(R[i].who+'@'+R[i].t+'/'+R[j].t);
 const cnt={}; R.forEach(x=>cnt[x.who]=(cnt[x.who]||0)+1);
 const st=r.stuck.filter(x=>x.dur>=2&&x.t>1);
 const cl=[]; for(const a of st){const n=st.filter(b=>Math.abs(b.t-a.t)<3&&Math.abs(b.s-a.s)<8).length; if(n>=3)cl.push(a.who+'@t'+a.t+' s'+a.s+' n'+n);}
 const ais=Object.keys(skill).filter(k=>r.finish[k]); const rk=a=>{const o=[...a].map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]);const rr=[];o.forEach((p,i)=>rr[p[1]]=i);return rr;};
 const a=rk(ais.map(k=>skill[k])), b=rk(ais.map(k=>-r.finish[k])); const n=ais.length; let d2=0; a.forEach((v,i)=>d2+=(v-b[i])**2); const rho=1-6*d2/(n*(n*n-1));
 const order=Object.entries(r.finish).sort((x,y)=>x[1]-y[1]).map(x=>x[0]+' '+x[1]).join(', ');
 console.log('\n==',f,'human',r.finish.You,'leadChanges',r.leadChanges,r.lead.map(x=>x.join(':')).join(' '));
 console.log('AI rescues',R.length,JSON.stringify(cnt),'early<60s',early.length,JSON.stringify(early.map(x=>x.who+'@'+x.t+' s'+x.s)),'doubles',JSON.stringify(dbl));
 console.log('stalls>=2s',st.length,'clusters>=3carts',JSON.stringify(cl),'spearman(AI)',rho.toFixed(2));
 console.log('order',order);
}
