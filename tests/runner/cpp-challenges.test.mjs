import assert from'node:assert/strict';import{test}from'node:test';import fs from'node:fs';import os from'node:os';import path from'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lh-cpp-judge-'));process.env.LH_DATA_DIR=dir;
const{judgeCppChallenge,cppJudgeHistory}=await import('../../src/server/cpp-challenges.ts');
const solutions={
 'maximum-drawdown': '#include <iostream>\n#include <iomanip>\n#include <algorithm>\nint main(){int n;std::cin>>n;long double peak=0,worst=0;while(n--){long double x;std::cin>>x;peak=std::max(peak,x);worst=std::max(worst,(peak-x)/peak);}std::cout<<std::fixed<<std::setprecision(6)<<worst<<"\\n";}\n',
 'rolling-median': '#include <iostream>\n#include <set>\n#include <vector>\nint main(){int n,k;std::cin>>n>>k;std::vector<long long>a(n);std::multiset<long long>lo,hi;auto balance=[&](){while(lo.size()>hi.size()+1){auto it=std::prev(lo.end());hi.insert(*it);lo.erase(it);}while(lo.size()<hi.size()){auto it=hi.begin();lo.insert(*it);hi.erase(it);}};for(int i=0;i<n;i++){std::cin>>a[i];if(lo.empty()||a[i]<=*lo.rbegin())lo.insert(a[i]);else hi.insert(a[i]);if(i>=k){auto it=lo.find(a[i-k]);if(it!=lo.end())lo.erase(it);else hi.erase(hi.find(a[i-k]));}balance();if(i>=k-1){if(i>=k)std::cout<<" ";std::cout<<*lo.rbegin();}}std::cout<<"\\n";}\n',

 'collision-pairs':'#include <iostream>\n#include <unordered_map>\nint main(){int n;std::cin>>n;std::unordered_map<long long,long long> counts;long long result=0,x;while(n--){std::cin>>x;result+=counts[x]++;}std::cout<<result<<"\\n";}\n',
 'stream-top-k':'#include <iostream>\n#include <queue>\n#include <vector>\n#include <algorithm>\nint main(){int n,k;std::cin>>n>>k;std::priority_queue<long long,std::vector<long long>,std::greater<long long>> h;for(int i=0;i<n;i++){long long x;std::cin>>x;h.push(x);if((int)h.size()>k)h.pop();}std::vector<long long> a;while(!h.empty()){a.push_back(h.top());h.pop();}std::reverse(a.begin(),a.end());for(int i=0;i<(int)a.size();i++){if(i)std::cout<<" ";std::cout<<a[i];}std::cout<<"\\n";}\n',
 'stable-variance':'#include <iostream>\n#include <iomanip>\nint main(){int n;std::cin>>n;long double mean=0,m2=0;for(int i=1;i<=n;i++){long double x;std::cin>>x;auto d=x-mean;mean+=d/i;m2+=d*(x-mean);}if(n<2)std::cout<<"UNDEFINED\\n";else std::cout<<std::fixed<<std::setprecision(3)<<m2/(n-1)<<"\\n";}\n'
};
test('real isolated judge accepts general solutions and rejects example hardcoding without leaking hidden output',async()=>{
 try{
  for(const[challengeId,source]of Object.entries(solutions)){
   const report=await judgeCppChallenge({challengeId,files:[{name:'main.cpp',source}]});assert.equal(report.result.ok,true,JSON.stringify({challengeId,result:report.result}));assert.equal(report.passedChecks,report.totalChecks);assert.equal(report.files[0].source,source);assert.equal('request'in report,false);assert.ok(report.result.cases.filter(c=>c.name.startsWith('Hidden')).every(c=>c.stdout==='[hidden check output withheld]'&&c.stderr===''));
  }
  const wrong=await judgeCppChallenge({challengeId:'collision-pairs',files:[{name:'main.cpp',source:'#include <iostream>\nint main(){std::cout<<4<<"\\n";}'}],cases:[{stdin:'fake',expected:'4'}]});assert.equal(wrong.result.ok,false);assert.equal(wrong.result.cases[0].passed,true);assert.ok(wrong.passedChecks<wrong.totalChecks);
  const echo=await judgeCppChallenge({challengeId:'collision-pairs',files:[{name:'main.cpp',source:'#include <iostream>\nint main(){std::cout<<std::cin.rdbuf();std::cerr<<"hidden-diagnostic";}'}]});assert.equal(echo.result.stdout,'');assert.equal(echo.result.stderr,'');assert.ok(!JSON.stringify(echo.result.cases.filter(c=>c.name.startsWith('Hidden'))).includes('hidden-diagnostic'));assert.equal(cppJudgeHistory().length,7);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
