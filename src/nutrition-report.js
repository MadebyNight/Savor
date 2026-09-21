import {METRICS} from './nutrition.js';
import {monday} from './domain.js';
export function validateReport(report,week=report?.weekStart){
 const fail=()=>{throw new Error('营养周报格式无效，未保存');};
 if(!report||typeof week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(week)||monday(week)!==week||report.weekStart!==week||typeof report.inputFingerprint!=='string'||typeof report.reportText!=='string'||!report.reportText.trim()||report.reportText.length>16000||typeof report.generatedAt!=='string'||!Number.isFinite(Date.parse(report.generatedAt))||typeof report.model!=='string')fail();
 const s=report.summarySnapshot;
 if(!s||!Array.isArray(s.missing)||!s.categories||typeof s.categories!=='object'||Array.isArray(s.categories)||!Number.isInteger(s.recipes)||s.recipes<0)fail();
 for(const [key] of METRICS){const n=s.values?.[key],c=s.coverage?.[key];if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<0))fail();if(!c||!Number.isInteger(c.known)||!Number.isInteger(c.total)||c.known<0||c.total<c.known||(n===null)!==(c.known===0))fail();}
 for(const m of s.missing)if(typeof m?.recipe!=='string'||typeof m.ingredient!=='string'||!Array.isArray(m.metrics)||m.metrics.some(k=>!METRICS.some(([key])=>key===k)))fail();
 if(Object.values(s.categories).some(n=>!Number.isInteger(n)||n<0))fail();
 return report;
}
