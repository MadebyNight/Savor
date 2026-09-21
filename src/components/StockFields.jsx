import { stockCategories, today } from "../data.js";

export default function StockFields({ value, onChange }) {
  const field = (key, next) => onChange({ ...value, [key]: next });
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
      <label className="wide">
        分类
        <select
          value={value.category || "其他"}
          onChange={(e) => field("category", e.target.value)}
        >
          {!stockCategories.includes(value.category) && value.category && (
            <option>{value.category}</option>
          )}
          {stockCategories.slice(1).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        入库日期
        <input
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
          onChange={(e) => field("days", e.target.value)}
        />
      </label>
      <p className="subtle wide">
        入库日算第 1 天；0 或留空表示保存期待补充。包装标示与实际状态优先。
      </p>
    </div>
  );
}
