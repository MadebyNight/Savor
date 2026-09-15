// 原站示例数据；图片均使用下载到本地的原始素材。
export const ingredient = (name, qty, category = "蔬菜", unit = "克") => ({
  name,
  qty,
  category,
  unit,
});
export const initialRecipes = [
  {
    id: 1,
    image: "/food-1.jpg",
    name: "番茄炒鸡蛋",
    category: "荤菜",
    time: 15,
    weight: 500,
    ingredients: [
      ingredient("番茄", 300),
      ingredient("鸡蛋", 150, "肉类"),
      ingredient("食用油", 10, "其他"),
    ],
    steps: [
      "番茄洗净切块，鸡蛋打散。",
      "锅中热油，倒入蛋液，炒至凝固后盛出。",
      "炒软番茄，加入鸡蛋和少许盐，翻炒均匀。",
    ],
  },
  {
    id: 2,
    image: "/food-2.jpg",
    name: "西兰花炒鸡胸肉",
    category: "荤菜",
    time: 20,
    weight: 450,
    ingredients: [ingredient("西兰花", 200), ingredient("鸡胸肉", 250, "肉类")],
    steps: [
      "西兰花切小朵，鸡胸肉切块。",
      "鸡肉加少许盐腌制10分钟，西兰花焯水。",
      "鸡肉煎熟后加入西兰花，翻炒调味。",
    ],
  },
  {
    id: 3,
    image: "/food-3.png",
    name: "紫菜蛋花汤",
    category: "汤品",
    time: 20,
    weight: 600,
    ingredients: [
      ingredient("紫菜", 10, "其他"),
      ingredient("鸡蛋", 100, "肉类"),
    ],
    steps: [
      "紫菜洗净，鸡蛋打散。",
      "锅中加水煮开，放入紫菜。",
      "缓缓倒入蛋液，煮熟后调味。",
    ],
  },
  {
    id: 4,
    name: "蒜蓉生菜",
    category: "素菜",
    time: 10,
    weight: 320,
    ingredients: [ingredient("生菜", 300), ingredient("蒜", 20)],
    steps: [
      "生菜洗净沥干，蒜切末。",
      "爆香蒜末，放入生菜。",
      "快速翻炒，加入少许盐即可。",
    ],
  },
  {
    id: 5,
    name: "牛奶燕麦碗",
    category: "早餐",
    time: 8,
    weight: 350,
    ingredients: [
      ingredient("牛奶", 250, "奶制品", "毫升"),
      ingredient("燕麦", 50, "其他"),
      ingredient("香蕉", 50, "水果"),
    ],
    steps: ["牛奶与燕麦小火煮3分钟。", "盛入碗中，加入切片香蕉。"],
  },
  {
    id: 6,
    name: "番茄鸡蛋面",
    category: "面食",
    time: 18,
    weight: 500,
    ingredients: [
      ingredient("番茄", 200),
      ingredient("鸡蛋", 100, "肉类"),
      ingredient("面条", 150, "其他"),
    ],
    steps: [
      "番茄切块，鸡蛋炒熟。",
      "加水煮开，放入面条。",
      "煮至面条熟透，加入鸡蛋调味。",
    ],
  },
  {
    id: 7,
    name: "银耳雪梨羹",
    category: "小甜水",
    time: 40,
    weight: 500,
    ingredients: [
      ingredient("银耳", 20, "其他"),
      ingredient("雪梨", 300, "水果"),
    ],
    steps: [
      "银耳提前泡发，撕成小朵。",
      "加水炖煮30分钟。",
      "加入雪梨块，再煮10分钟。",
    ],
  },
];
export const initialFridge = [
  {
    ...ingredient("番茄", 500),
    days: 7,
  },
  {
    ...ingredient("鸡蛋", 400, "肉类"),
    days: 21,
  },
  {
    ...ingredient("西兰花", 300),
    days: 5,
  },
  {
    ...ingredient("牛奶", 500, "奶制品", "毫升"),
    days: 7,
  },
].map((e) => ({
  ...e,
  date: "2026-09-08",
}));
export const recipeCategories = [
  "全部",
  "早餐",
  "素菜",
  "荤菜",
  "汤品",
  "面食",
  "小甜水",
];
export const stockCategories = [
  "全部",
  "蔬菜",
  "水果",
  "肉类",
  "豆制品",
  "奶制品",
  "其他",
];
export const today = () => new Date().toLocaleDateString("sv-SE");
