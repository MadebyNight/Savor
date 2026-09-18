/* 独立视觉原型：所有状态只在内存中，不访问正式应用存储。 */
const paths = {
  utensils:
    '<path d="M4 3v7c0 2 5 2 5 0V3M6.5 3v18M17 3c-3 4-3 8 0 8h2M19 3v18"/>',
  fridge:
    '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M5 10h14M9 6v1M9 14v3"/>',
  basket: '<path d="m3 9 2 11h14l2-11ZM8 9l4-6 4 6M9 13v3M15 13v3M2 9h20"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M15 15h2M7 18h2"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1 0-4h14M8 7h8M8 11h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--paper)"/><circle cx="15" cy="17" r="3" fill="var(--paper)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  leaf: '<path d="M20 3C5 1 1 10 6 16s17 0 14-13ZM5 21 16 9"/>',
  cup: '<path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3"/>',
  soup: '<path d="M3 12h18a9 8 0 0 1-18 0ZM6 21h12M7 3c-3 3 3 3 0 6M12 3c-3 3 3 3 0 6M17 3c-3 3 3 3 0 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>',
  scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3M7 12h10"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.utensils}</svg>`;
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        s
      ],
  );
const ingredient = (name, qty, category = "蔬菜", unit = "克") => ({
  name,
  qty,
  category,
  unit,
});
const recipes = [
  {
    id: 1,
    name: "番茄炒鸡蛋",
    category: "荤菜",
    time: 15,
    image: "food-1.jpg",
    ingredients: [ingredient("番茄", 300), ingredient("鸡蛋", 150, "肉类")],
    steps: [
      "番茄洗净切块，鸡蛋打散。",
      "热油炒熟鸡蛋，盛出备用。",
      "炒软番茄，加入鸡蛋和盐翻炒。",
    ],
  },
  {
    id: 2,
    name: "西兰花炒鸡胸肉",
    category: "荤菜",
    time: 20,
    image: "food-2.jpg",
    ingredients: [ingredient("西兰花", 200), ingredient("鸡胸肉", 250, "肉类")],
    steps: [
      "西兰花切小朵，鸡胸肉切块腌制。",
      "西兰花焯水，鸡肉煎熟。",
      "加入西兰花一起翻炒调味。",
    ],
  },
  {
    id: 3,
    name: "紫菜蛋花汤",
    category: "汤品",
    time: 10,
    image: "food-3.png",
    ingredients: [
      ingredient("紫菜", 10, "调料"),
      ingredient("鸡蛋", 100, "肉类"),
    ],
    steps: [
      "紫菜洗净，鸡蛋打散。",
      "水煮开后放入紫菜，缓缓淋入蛋液。",
      "煮熟调味即可。",
    ],
  },
  {
    id: 4,
    name: "蒜蓉生菜",
    category: "素菜",
    time: 10,
    ingredients: [ingredient("生菜", 300), ingredient("蒜", 20)],
    steps: [
      "生菜洗净，蒜切末。",
      "爆香蒜末，加入生菜快炒。",
      "加盐调味后出锅。",
    ],
  },
  {
    id: 5,
    name: "牛奶燕麦碗",
    category: "早餐",
    time: 8,
    ingredients: [
      ingredient("牛奶", 250, "奶制品", "毫升"),
      ingredient("燕麦", 50, "其他"),
    ],
    steps: ["牛奶与燕麦小火煮三分钟。", "盛入碗中即可。"],
  },
  {
    id: 6,
    name: "番茄鸡蛋面",
    category: "面食",
    time: 18,
    ingredients: [
      ingredient("番茄", 200),
      ingredient("鸡蛋", 100, "肉类"),
      ingredient("面条", 150, "其他"),
    ],
    steps: ["炒熟番茄和鸡蛋，加水煮开。", "加入面条，煮熟后调味。"],
  },
  {
    id: 7,
    name: "桂花银耳羹",
    category: "小甜水",
    time: 40,
    ingredients: [
      ingredient("银耳", 20, "其他"),
      ingredient("冰糖", 15, "调料"),
    ],
    steps: ["银耳泡发，撕成小朵。", "加水炖煮至软糯，放入冰糖。"],
  },
  {
    id: 8,
    name: "清炒西兰花",
    category: "素菜",
    time: 12,
    ingredients: [ingredient("西兰花", 300), ingredient("蒜", 15)],
    steps: ["西兰花洗净焯水。", "爆香蒜末，加入西兰花翻炒调味。"],
  },
  {
    id: 9,
    name: "家常鸡蛋羹",
    category: "早餐",
    time: 15,
    ingredients: [ingredient("鸡蛋", 150, "肉类")],
    steps: ["蛋液加入温水搅匀，撇去浮沫。", "上锅蒸熟。"],
  },
  {
    id: 10,
    name: "凉拌番茄",
    category: "素菜",
    time: 5,
    ingredients: [ingredient("番茄", 300)],
    steps: ["番茄洗净切片。", "按喜好调味，拌匀装盘。"],
  },
];
const stock = [
  { name: "番茄", qty: 200, unit: "克", category: "蔬菜", remaining: 3 },
  { name: "西兰花", qty: 350, unit: "克", category: "蔬菜", remaining: 2 },
  { name: "生菜", qty: 200, unit: "克", category: "蔬菜", remaining: 1 },
  { name: "鸡蛋", qty: 300, unit: "克", category: "肉类", remaining: 8 },
  { name: "牛奶", qty: 500, unit: "毫升", category: "奶制品", remaining: 4 },
];
const categories = ["全部", "早餐", "素菜", "荤菜", "汤品", "面食", "小甜水"];
const stockCategories = [
  "全部",
  "蔬菜",
  "水果",
  "肉类",
  "豆制品",
  "奶制品",
  "调料",
  "其他",
];
const nav = [
  ["点单", "utensils"],
  ["冰箱", "fridge"],
  ["菜篮子", "basket"],
  ["周菜单", "calendar"],
  ["菜谱", "book"],
];
let page = 0,
  day = 4;
const filters = { 0: "全部", 1: "全部", 2: "全部", 4: "全部" },
  searches = { 0: "", 4: "" };
let quantities = {},
  confirmed = {},
  noticeTimer;
const plans = { "4-早餐": [5], "4-午餐": [1, 4], "4-晚餐": [3] };
const $ = (id) => document.getElementById(id);
const findRecipe = (id) => recipes.find((r) => r.id === Number(id));
function picture(recipe, interactive = false) {
  const inner = recipe.image
    ? `<img src="../public/${recipe.image}" alt="" />`
    : icon(
        recipe.category === "汤品"
          ? "soup"
          : recipe.category === "早餐"
            ? "cup"
            : "leaf",
      );
  const cls = `dish-picture ${recipe.image ? "" : "placeholder"}`;
  return interactive
    ? `<button class="${cls}" data-action="detail" data-id="${recipe.id}" aria-label="查看${escapeHtml(recipe.name)}">${inner}</button>`
    : `<div class="${cls}">${inner}</div>`;
}
function info(message) {
  clearTimeout(noticeTimer);
  $("message").textContent = message;
  $("message").hidden = false;
  noticeTimer = setTimeout(() => ($("message").hidden = true), 3300);
}
function counter(recipe) {
  const n = quantities[recipe.id] || 0;
  return `<div class="counter">${n ? `<button class="minus" data-action="minus" data-id="${recipe.id}" aria-label="减少${escapeHtml(recipe.name)}"><span>${icon("minus")}</span></button><b>${n}</b>` : ""}<button data-action="plus" data-id="${recipe.id}" aria-label="添加${escapeHtml(recipe.name)}"><span>${icon("plus")}</span></button></div>`;
}
function renderSelection() {
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const dirty = recipes.some(
    (r) => (quantities[r.id] || 0) !== (confirmed[r.id] || 0),
  );
  $("selection").innerHTML =
    page === 0 && (count || dirty)
      ? `<div class="selection-bar"><button class="selection-summary" data-action="selected"><b>已选 ${Object.values(quantities).filter(Boolean).length} 道 · ${count} 份</b><small>确认后更新采购清单</small></button><button class="primary" data-action="confirm">${count ? "确认选菜" : "确认清空"} ${icon("chevron")}</button></div>`
      : "";
}
function rail(names, items) {
  return `<aside class="category-rail" aria-label="分类">${names.map((name) => `<button data-action="filter" data-category="${name}" class="${filters[page] === name ? "active" : ""}" aria-pressed="${filters[page] === name}"><span>${name}</span><small>${name === "全部" ? items.length : items.filter((i) => i.category === name).length}</small></button>`).join("")}</aside>`;
}
function purchases() {
  const map = new Map();
  recipes.forEach((r) =>
    r.ingredients.forEach((i) => {
      if (!confirmed[r.id]) return;
      const key = `${i.name}/${i.unit}`;
      if (!map.has(key)) map.set(key, { ...i, qty: 0 });
      map.get(key).qty += i.qty * confirmed[r.id];
    }),
  );
  return [...map.values()]
    .map((i) => {
      const available = stock
        .filter((s) => s.name === i.name && s.unit === i.unit)
        .reduce((sum, s) => sum + s.qty, 0);
      return { ...i, available, missing: Math.max(0, i.qty - available) };
    })
    .filter((i) => i.missing > 0);
}
function render() {
  $("page-title").textContent = nav[page][0];
  $("header-actions").innerHTML =
    page === 0
      ? `<button class="icon-button" data-action="settings" aria-label="设置">${icon("settings")}</button>`
      : page === 1
        ? `<button class="text-button" data-action="add-stock">${icon("plus")}添加</button>`
        : page === 2
          ? `<button class="text-button" data-action="copy">${icon("copy")}复制</button>`
          : page === 3
            ? `<button class="text-button" data-action="week-info">9.14 — 9.20 ${icon("calendar")}</button>`
            : `<button class="text-button" data-action="new-recipe">${icon("plus")}新建</button>`;
  $("toolbar").innerHTML =
    page === 0 || page === 4
      ? `<label class="search-box">${icon("search")}<input type="search" aria-label="搜索菜名或食材" placeholder="搜索菜名或食材" value="${escapeHtml(searches[page])}" /></label>`
      : page === 1
        ? `<div class="context-line">${icon("leaf")} ${stock.length} 种食材 · ${stock.filter((i) => i.remaining !== null && i.remaining <= 2).length} 种建议尽快使用</div>`
        : page === 2
          ? `<div class="context-line">${icon("check")} 已扣除冰箱库存 · 还需采购 ${purchases().length} 项</div>`
          : `<div class="date-strip" aria-label="选择日期">${["一", "二", "三", "四", "五", "六", "日"].map((d, i) => `<button data-action="day" data-day="${i}" class="${day === i ? "active" : ""}" aria-pressed="${day === i}" aria-label="9月${14 + i}日 周${d}"><span>周${d}</span><b>${14 + i}</b></button>`).join("")}</div>`;
  $("navigation").innerHTML = nav
    .map(
      ([name, i], index) =>
        `<button data-action="nav" data-page="${index}" class="${page === index ? "active" : ""}" ${page === index ? 'aria-current="page"' : ""}><span class="nav-icon">${icon(i)}</span><span>${name}</span></button>`,
    )
    .join("");
  renderContent();
  renderSelection();
}
function renderContent() {
  let html = "";
  if (page === 0) {
    const query = searches[0].trim().toLowerCase();
    const matching = recipes.filter((r) =>
      `${r.name} ${r.ingredients.map((i) => i.name).join(" ")}`
        .toLowerCase()
        .includes(query),
    );
    const visible = matching.filter(
      (r) => filters[0] === "全部" || r.category === filters[0],
    );
    html =
      rail(categories, matching) +
      `<section class="list-pane" aria-label="菜品列表"><h2 class="section-label">${filters[0] === "全部" ? "全部菜品" : filters[0]}<small>${visible.length} 道家常味</small></h2>${visible.map((r) => `<article class="recipe-row">${picture(r, true)}<div class="recipe-copy"><button class="dish-name" data-action="detail" data-id="${r.id}">${escapeHtml(r.name)}</button><p class="ingredients">${escapeHtml(r.ingredients.map((i) => i.name).join(" · "))}</p><div class="row-bottom"><span class="time">${r.time} 分钟</span>${counter(r)}</div></div></article>`).join("")}${!visible.length ? '<div class="empty-state"><strong>还没找到这道菜</strong>换个分类或关键词试试</div>' : '<p class="list-foot">每一份，都是一道完整的菜</p>'}</section>`;
  } else if (page === 1) {
    const visible = stock.filter(
      (s) => filters[1] === "全部" || s.category === filters[1],
    );
    html =
      rail(stockCategories, stock) +
      `<section class="list-pane" aria-label="冰箱库存"><h2 class="section-label">${filters[1] === "全部" ? "冰箱里的新鲜" : filters[1]}<small>${visible.length} 项</small></h2>${visible.map((s) => `<article class="stock-row"><div class="stock-avatar">${escapeHtml(s.name[0])}</div><div class="stock-data"><h3>${escapeHtml(s.name)}</h3><p class="${s.remaining <= 2 ? "urgent" : "fresh"}">${s.remaining === null ? "保存期限未设置" : s.remaining <= 2 ? `尽快用 · 剩 ${s.remaining} 天` : `剩 ${s.remaining} 天`}</p></div><span class="amount">${s.qty}<small> ${escapeHtml(s.unit)}</small></span></article>`).join("")}${visible.length ? '<div class="inline-note">先看看家里有什么，再决定今天吃什么。</div>' : '<div class="empty-state">这里还没有食材<br />点右上角添加一份新鲜</div>'}<button class="text-button" data-action="scan">${icon("scan")}拍照录入食材</button></section>`;
  } else if (page === 2) {
    const items = purchases(),
      visible = items.filter(
        (i) => filters[2] === "全部" || i.category === filters[2],
      );
    html =
      rail(stockCategories, items) +
      `<section class="list-pane" aria-label="采购清单"><h2 class="section-label">${filters[2] === "全部" ? "这次需要买" : filters[2]}<small>${visible.length} 项</small></h2>${visible.map((i) => `<article class="purchase-row"><div><h3>${escapeHtml(i.name)}</h3><p>需要 ${i.qty} · 库存 ${i.available}${escapeHtml(i.unit)}</p></div><strong>${i.missing} <small>${escapeHtml(i.unit)}</small></strong></article>`).join("")}${!visible.length ? `<div class="empty-state">${icon("basket")}<strong>${items.length ? "这个分类不用买" : Object.values(confirmed).some(Boolean) ? "所需食材已备齐" : "先选几道喜欢的菜"}</strong>${Object.values(confirmed).some(Boolean) ? "采购按确认份数计算" : "在点单页确认后，自动整理缺口"}<br /><button class="text-button" data-action="nav" data-page="0">去选菜 ${icon("chevron")}</button></div>` : '<div class="inline-note">按已确认的菜品份数计算。重复安排周菜单，不会重复采购。</div>'}</section>`;
  } else if (page === 3) {
    html = `<section class="full-pane" aria-label="当日菜单"><div class="day-heading"><b>9 月 ${14 + day} 日 · 周${["一", "二", "三", "四", "五", "六", "日"][day]}</b><small>演示周菜单</small></div>${[
      "早餐",
      "午餐",
      "晚餐",
    ]
      .map(
        (meal, index) =>
          `<article class="meal-block"><div class="meal-head"><h3>${icon(["cup", "sun", "moon"][index])}${meal}</h3><span>${["好好开始一天", "吃得满足一点", "慢慢享用晚餐"][index]}</span></div>${(
            plans[`${day}-${meal}`] || []
          )
            .map((id, pos) => {
              const r = findRecipe(id);
              return `<div class="meal-item">${picture(r)}<div><h4>${escapeHtml(r.name)}</h4><p>1 份 · ${r.time} 分钟</p></div><button class="icon-button" data-action="remove-meal" data-meal="${meal}" data-index="${pos}" aria-label="移除${escapeHtml(r.name)}">${icon("close")}</button></div>`;
            })
            .join(
              "",
            )}<button class="add-meal" data-action="add-meal" data-meal="${meal}">${icon("plus")}添加菜品</button></article>`,
      )
      .join("")}<p class="list-foot">按自己的节奏，安排一日三餐</p></section>`;
  } else {
    const query = searches[4].trim().toLowerCase();
    const visible = recipes.filter((r) =>
      `${r.name} ${r.ingredients.map((i) => i.name).join(" ")}`
        .toLowerCase()
        .includes(query),
    );
    html = `<section class="full-pane" aria-label="我的菜谱"><button class="import-action" data-action="import">${icon("scan")}<div><b>把喜欢的味道，收进菜谱</b><p>粘贴文字或选择图片，生成可编辑草稿</p></div></button><h2 class="section-label">我的菜谱<small>${visible.length} 道</small></h2>${visible.map((r) => `<button class="manage-row" data-action="detail" data-id="${r.id}">${picture(r)}<div><h3>${escapeHtml(r.name)}</h3><p>${r.category} · ${r.time} 分钟</p></div>${icon("chevron")}</button>`).join("")}${!visible.length ? '<div class="empty-state">没有找到菜谱，换个关键词试试</div>' : ""}</section>`;
  }
  $("content").innerHTML = html;
}
function openSheet(title, body) {
  $("sheet-title").textContent = title;
  $("sheet-body").innerHTML = body;
  if (!$("sheet").open) $("sheet").showModal();
}
function closeSheet() {
  $("sheet").close();
}
function confirmSelection() {
  confirmed = { ...quantities };
  closeSheet();
  render();
  info("已确认选菜，菜篮子已更新");
}
function showDetail(id) {
  const r = findRecipe(id);
  openSheet(
    r.name,
    `${r.image ? `<img class="detail-image" src="../public/${r.image}" alt="${escapeHtml(r.name)}" />` : ""}<p class="detail-meta">${r.category} · ${r.time} 分钟 · 一份为一道完整菜</p><h3 class="detail-section">准备食材</h3><p class="detail-text">${r.ingredients.map((i) => `${escapeHtml(i.name)} ${i.qty}${escapeHtml(i.unit)}`).join(" / ")}</p><h3 class="detail-section">制作步骤</h3><ol class="detail-steps">${r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol><button class="primary sheet-action" data-action="detail-add" data-id="${r.id}">${icon("plus")}加入点单</button>`,
  );
}
document.addEventListener("input", (event) => {
  if (event.target.matches(".search-box input")) {
    searches[page] = event.target.value;
    renderContent();
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id, category, meal } = button.dataset;
  if (action === "nav") {
    page = Number(button.dataset.page);
    $("message").hidden = true;
    render();
  }
  if (action === "filter") {
    filters[page] = category;
    renderContent();
  }
  if (action === "day") {
    day = Number(button.dataset.day);
    render();
  }
  if (action === "plus" || action === "minus" || action === "detail-add") {
    const scroll = document.querySelector(".list-pane")?.scrollTop || 0;
    quantities[id] = Math.max(
      0,
      (quantities[id] || 0) + (action === "minus" ? -1 : 1),
    );
    renderContent();
    renderSelection();
    if (document.querySelector(".list-pane"))
      document.querySelector(".list-pane").scrollTop = scroll;
    if (action === "detail-add") {
      closeSheet();
      info("已加入点单，确认后更新采购");
    }
  }
  if (action === "detail") showDetail(id);
  if (action === "confirm") confirmSelection();
  if (action === "selected")
    openSheet(
      "已选菜品",
      `${
        recipes
          .filter((r) => quantities[r.id])
          .map(
            (r) =>
              `<div class="purchase-row"><h3>${escapeHtml(r.name)}</h3><span>${quantities[r.id]} 份</span></div>`,
          )
          .join("") ||
        '<p class="detail-text">当前已清空选菜，确认后采购清单也将清空。</p>'
      }<button class="primary sheet-action" data-action="confirm">确认选菜</button>`,
    );
  if (action === "add-meal")
    openSheet(
      `添加到${meal}`,
      recipes
        .map(
          (r) =>
            `<button class="sheet-recipe" data-action="pick-meal" data-id="${r.id}" data-meal="${meal}">${picture(r)}<span>${escapeHtml(r.name)}</span>${icon("plus")}</button>`,
        )
        .join(""),
    );
  if (action === "pick-meal") {
    const key = `${day}-${meal}`;
    plans[key] ||= [];
    plans[key].push(Number(id));
    closeSheet();
    renderContent();
    info(`已添加到${meal}`);
  }
  if (action === "remove-meal") {
    plans[`${day}-${meal}`].splice(Number(button.dataset.index), 1);
    renderContent();
  }
  if (action === "settings")
    openSheet(
      "关于这版原型",
      '<p class="detail-text">这是食光手机端的第一版交互提案，使用独立演示数据。刷新页面后重置，不影响现有应用。</p><h3 class="detail-section">正式版设置入口</h3><p class="detail-text">AI 服务、备份和坚果云同步将从这里进入。这些功能暂未接入原型。</p>',
    );
  if (action === "week-info")
    openSheet(
      "演示周菜单",
      '<p class="detail-text">这版展示 2026 年 9 月 14 日至 20 日。点击上方日期切换当天，点击餐次中的“添加菜品”安排三餐。</p><p class="detail-text">历史周切换、复制和一周总览将在正式接入时完成。</p>',
    );
  if (action === "scan" || action === "import")
    openSheet(
      "导入入口示意",
      '<p class="detail-text">正式版可通过文字或图片生成可编辑草稿，保存前由你确认。这版原型未接入 AI，不会上传任何内容。</p>',
    );
  if (action === "copy") {
    const items = purchases();
    if (!items.length) return info("当前没有需要采购的食材");
    const text =
      "食光 · 采购清单\n" +
      items.map((i) => `${i.name} ${i.missing}${i.unit}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      info("采购清单已复制");
    } catch {
      openSheet(
        "复制采购清单",
        `<p class="detail-text">浏览器未允许自动复制，可长按下方文字手动复制。</p><textarea class="copy-text" aria-label="采购清单文字" readonly>${escapeHtml(text)}</textarea>`,
      );
    }
  }
  if (action === "add-stock")
    openSheet(
      "添加食材",
      `<form id="stock-form"><label class="form-field">食材名称<input name="name" required maxlength="30" placeholder="例如：胡萝卜" /></label><label class="form-field">数量<input name="qty" type="number" min="0.01" step="0.01" value="200" required /></label><label class="form-field">单位<select name="unit"><option>克</option><option>毫升</option><option>个</option></select></label><label class="form-field">分类<select name="category">${stockCategories
        .slice(1)
        .map((c) => `<option>${c}</option>`)
        .join(
          "",
        )}</select></label><p class="detail-text">本次仅添加到演示库存，刷新后重置。</p><button class="primary sheet-action" type="submit">放入冰箱</button></form>`,
    );
  if (action === "new-recipe")
    openSheet(
      "新建演示菜谱",
      `<form id="recipe-form"><label class="form-field">菜名<input name="name" required maxlength="40" placeholder="给这道菜起个名字" /></label><label class="form-field">分类<select name="category">${categories
        .slice(1)
        .map((c) => `<option>${c}</option>`)
        .join(
          "",
        )}</select></label><label class="form-field">主要食材<input name="ingredient" required maxlength="30" placeholder="例如：土豆" /></label><label class="form-field">用量（克）<input name="qty" type="number" min="1" max="10000" value="200" required /></label><label class="form-field">制作步骤<input name="step" required maxlength="200" placeholder="例如：切丝，炒熟后调味" /></label><p class="detail-text">精简表单仅用于体验；正式版支持多食材、多步骤、图片和草稿。</p><button class="primary sheet-action" type="submit">保存演示菜谱</button></form>`,
    );
});
document.addEventListener("submit", (event) => {
  if (!["stock-form", "recipe-form"].includes(event.target.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (
    !data.name.trim() ||
    (data.ingredient !== undefined && !data.ingredient.trim()) ||
    (data.step !== undefined && !data.step.trim())
  )
    return;
  if (event.target.id === "stock-form") {
    stock.push({
      ...data,
      name: data.name.trim(),
      qty: Number(data.qty),
      remaining: null,
    });
    filters[1] = "全部";
  } else {
    recipes.push({
      id: Math.max(...recipes.map((r) => r.id)) + 1,
      name: data.name.trim(),
      category: data.category,
      time: 15,
      ingredients: [ingredient(data.ingredient.trim(), Number(data.qty))],
      steps: [data.step.trim()],
    });
    searches[4] = "";
  }
  closeSheet();
  render();
  info(event.target.id === "stock-form" ? "已放入演示冰箱" : "已保存演示菜谱");
});
$("close-sheet").innerHTML = icon("close");
$("close-sheet").addEventListener("click", closeSheet);
$("sheet").addEventListener("click", (event) => {
  if (event.target === $("sheet")) {
    const r = $("sheet").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeSheet();
  }
});
render();
