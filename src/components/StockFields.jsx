import { AppSelect, DateTimePicker } from "./Pickers.jsx";
import {estimateStorage,suggestStorage,DEFAULT_STORAGE_RULES,STORAGE_METHODS} from "../food-storage.js";
import useConfirm from "./useConfirm.jsx";
import { stockCategories, today } from "../data.js";

export default function StockFields({ value, onChange, rules=DEFAULT_STORAGE_RULES, autoFill=true }) {
  const [ask,confirmation]=useConfirm();
  const recalculate=async(method=value.storageMethod)=>{if(Number(value.days)>0&&!(await ask("重新估算会替换当前期限；包装或手动期限请优先保留。",{title:"重新估算保存期？",label:"确认重新估算"})))return;onChange({...value,storageMethod:method,...estimateStorage(value.name,value.category,rules)});};
  const field = (key, next) => {const updated={...value,[key]:next};onChange(autoFill&&['name','category'].includes(key)?suggestStorage(updated,rules):updated);};
  return (
    <div className="stock-fields">
      <label className="wide">
        食材名称
        <input
          required
          value={value.name || ""}
          onChange={(e) => field("name", e.target.value)}
        />
      </label>
      <label>
        数量
        <input
          required
          type="number"
          min="0.001"
          step="any"
          value={value.qty ?? ""}
          onChange={(e) => field("qty", e.target.value)}
        />
      </label>
      <label>
        单位
        <input
          required
          value={value.unit || ""}
          onChange={(e) => field("unit", e.target.value)}
        />
      </label>
      <label>
        分类
        <AppSelect aria-label="食材分类"
          value={value.category || "其他"}
          onChange={(e) => field("category", e.target.value)}
        >
          {!stockCategories.includes(value.category) && value.category && (
            <option>{value.category}</option>
          )}
          {stockCategories.slice(1).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </AppSelect>
      </label>
      <label>保存方式<AppSelect aria-label="保存方式" value={value.storageMethod||'unknown'} onChange={e=>field('storageMethod',e.target.value)}>{Object.entries(STORAGE_METHODS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</AppSelect></label>
      <label>
        入库日期
        <DateTimePicker aria-label="入库日期"
          required
          type="date"
          value={value.date || today()}
          onChange={(e) => field("date", e.target.value)}
        />
      </label>
      <label>
        保存天数
        <input
          type="number"
          min="0"
          step="1"
          value={value.days ?? ""}
          placeholder="待补充"
          onChange={(e) => onChange({...value,days:e.target.value,shelfLifeSource:{kind:value.shelfLifeSource?.kind==='package'?'package':'manual'}})}
        />
      </label>
      {value.shelfLifeSource?.version==='category-v1'&&<p className="subtle wide">{value.shelfLifeSource.rule} · 可手动修改，请以包装及实际保存情况为准。</p>}
      <details className="wide"><summary>期限依据 · {({reference:value.shelfLifeSource?.version==='category-v1'?'自动填写':'原有冷藏参考',package:'包装标示',manual:'手动填写',unknown:'待补充'})[value.shelfLifeSource?.kind]||(Number(value.days)>0?'原有手动期限':'待补充')}</summary>
        <label>期限来源<AppSelect aria-label="期限来源" value={value.shelfLifeSource?.kind||'unknown'} onChange={e=>field('shelfLifeSource',{kind:e.target.value})}><option value="unknown">待补充</option><option value="manual">手动填写</option><option value="package">包装标示</option>{value.shelfLifeSource?.kind==='reference'&&<option value="reference">参考期限</option>}</AppSelect></label>
        <button type="button" className="text-link" onClick={()=>recalculate()}>重新估算参考期限</button>
        {value.shelfLifeSource?.kind==='reference'&&<p className="subtle">{value.shelfLifeSource.condition} {value.shelfLifeSource.rule}。</p>}
      </details>
      {confirmation}

    </div>
  );
}
