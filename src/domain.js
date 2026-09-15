export const dayAt = (value, offset) => {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("sv-SE");
};
export const monday = (value) => {
  const date = new Date(value + "T12:00:00");
  return dayAt(value, -(date.getDay() + 6) % 7);
};
export const usableStock = (
  stock,
  date = new Date().toLocaleDateString("sv-SE"),
) => !stock.days || dayAt(stock.date || date, Number(stock.days)) > date;
export function procurement(recipes, quantities, fridge, date) {
  const requirements = new Map();
  for (const recipe of recipes) {
    if (!quantities[recipe.id]) continue;
    for (const item of recipe.ingredients) {
      const key = item.name + "|" + item.unit;
      const previous = requirements.get(key);
      const unknown =
        item.qty == null || item.qty === "" || previous?.qty === null;
      requirements.set(key, {
        ...item,
        qty: unknown
          ? null
          : (previous?.qty || 0) + item.qty * quantities[recipe.id],
      });
    }
  }
  return [...requirements.values()]
    .map((item) => ({
      ...item,
      qty:
        item.qty == null
          ? null
          : Math.max(
              0,
              +(
                item.qty -
                fridge
                  .filter(
                    (stock) =>
                      stock.name === item.name &&
                      stock.unit === item.unit &&
                      usableStock(stock, date),
                  )
                  .reduce((total, stock) => total + Number(stock.qty), 0)
              ).toFixed(3),
            ),
    }))
    .filter((item) => item.qty == null || item.qty > 0);
}
