import { AppSelect, DateTimePicker } from "./Pickers.jsx";
import {estimateStorage,STORAGE_METHODS} from "../food-storage.js";
import useConfirm from "./useConfirm.jsx";
import { stockCategories, today } from "../data.js";

export default function StockFields({ value, onChange }) {
  const [ask,confirmation]=useConfirm();
  const recalculate=async(method=value.storageMethod)=>{if(Number(value.days)>0&&!(await ask("重新估算会替换当前期限；包装或手动期限请优先保留。",{title:"重新估算保存期？",label:"确认重新估算"})))return;onChange({...value,storageMethod:method,...estimateStorage(value.name,method)});};
  const field = (key, next) => onChange({ ...value, [key]: next });
  return (
    <div className="stock-fields">
      <label className="wide">
        食材名称
        <input
          required
          value={value.name || ""}
          onChange={(e) => field("name", e.target.value)}
          onBlur={()=>{if(!Number(value.days)&&!value.shelfLifeSource?.kind)onChange({...value,...estimateStorage(value.name,value.storageMethod)});}}
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
      <label>保存方式<AppSelect aria-label="保存方式" value={value.storageMethod||'unknown'} onChange={e=>recalculate(e.target.value)}>{Object.entries(STORAGE_METHODS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</AppSelect></label>
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
      <details className="wide"><summary>期限依据 · {({reference:'FDA 冷藏参考',package:'包装标示',manual:'手动填写',unknown:'待补充'})[value.shelfLifeSource?.kind]||(Number(value.days)>0?'原有手动期限':'待补充')}</summary>
        <label>期限来源<AppSelect aria-label="期限来源" value={value.shelfLifeSource?.kind||'unknown'} onChange={e=>field('shelfLifeSource',{kind:e.target.value})}><option value="unknown">待补充</option><option value="manual">手动填写</option><option value="package">包装标示</option>{value.shelfLifeSource?.kind==='reference'&&<option value="reference">FDA 冷藏参考</option>}</AppSelect></label>
        <button type="button" className="text-link" onClick={()=>recalculate()}>重新估算参考期限</button>
        {value.shelfLifeSource?.kind==='reference'&&<p className="subtle">{value.shelfLifeSource.condition}；{value.shelfLifeSource.rule}，采用来源区间下限。仅供参考，不保证食品安全。</p>}
        {value.storageMethod==='frozen'&&<p className="subtle">冷冻表是品质建议，不能作为安全到期日；请按包装补填期限。</p>}
      </details>
      {confirmation}

    </div>
  );
}
