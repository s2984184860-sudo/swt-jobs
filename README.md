# SWT 选岗工作台

一个纯本地网页：岗位以海报卡片展示，支持**加权评分**、筛选、收藏、对比、人民币收入换算。
不依赖服务器、不依赖网络，双击 `index.html` 就能用。

## 打开方式

- **电脑**：双击 `index.html`（推荐 Edge / Chrome）
- **手机**：见下面「手机访问」

## 手机访问（同一 Wi-Fi）

1. 双击运行 `serve.ps1`
2. 窗口里会显示地址，例如 `http://192.168.1.23:8080`
3. 手机浏览器打开即可

> Windows 防火墙弹窗选「允许」；关掉 PowerShell 窗口即停止服务。

## 评分怎么算

八个维度，权重可拖：

| 维度 | 说明 | 方向 |
|---|---|---|
| 净收入 | 月净收入（人民币，扣住宿） | 越高越好 |
| 时薪 | USD/小时 | 越高越好 |
| 小费 | 无/低/中/高 | 越高越好 |
| 加班机会 | 无/有/多 | 越多越好 |
| 住宿成本 | 每周 USD | 越低越好 |
| 包餐 | 不包/部分/全包 | 越多越好 |
| 工时强度 | 每周工时 | 越少越好（轻松） |
| 英语门槛 | Basic/Intermediate/Advanced | 要求越低越好 |

- 每个维度先按**当前数据集内的相对高低**归一化到 0～100，再加权平均
- 权重会自动归一化，拖到 0 即忽略该维度
- 四个预设：赚钱优先 / 轻松优先 / 性价比 / 英语友好
- 权重存在浏览器本地，下次打开还在

## 添加 / 修改岗位

编辑 `data.js`，复制一段对象改字段：

```js
{
  id: "j13",                     // 唯一编号
  title: "Barista",
  titleCn: "咖啡师",
  employer: "Seattle Coffee Co.",
  city: "Seattle",
  state: "WA",
  type: "Food Service",          // Housekeeping / Food Service / Recreation / Retail / Kitchen / Front Desk / Warehouse / Other
  wage: 18.5,                    // 时薪 USD
  hours: 30,                     // 每周工时
  housing: 190,                  // 每周住宿费，0 = 免费
  housingType: "apartment",      // dorm / apartment / hotel / none
  tips: "high",                  // none / low / medium / high
  meals: "partial",              // none / partial / full
  overtime: "none",              // none / some / many
  start: "2027-05-22",
  end: "2027-09-22",
  english: "Advanced",           // Basic / Intermediate / Advanced
  perks: ["时薪高", "小费高"],     // 标签
  image: "",                     // 可选图片 URL
  source: ""                     // 官网链接
}
```

## 收入怎么算

- 周毛收入 = 时薪 × 周工时
- 周净收入 = 周毛收入 − 周住宿费
- 月净收入 ≈ 周净收入 × 52 ÷ 12
- 人民币 = 美元 × 汇率（右上角可改）

> 不含税和小费，属于「到手前的保守估算」。

## 功能

- 搜索（岗位 / 雇主 / 城市）
- 筛选：州、类型、最低时薪、最低周工时、最高住宿、小费、包餐、加班、只看包住宿、只看收藏
- 排序：综合评分 / 人民币净收入 / 时薪 / 住宿成本 / 开始日期
- 收藏（★，本地保存）
- 对比：最多 3 个岗位，含**分项得分条**
- 导出 CSV（Excel 直接打开，带 BOM）

## 数据版本与更新

`data.js` 顶部有：

```js
window.DATA_VERSION = "2026-10-19.1";
```

- 你在网页上改过的数据会存在浏览器里，并记录当时的版本号
- 当 `data.js` 的版本号变了（比如我批量导入新岗位后），网页会**自动改用新数据**，同时把旧数据备份到 `localStorage` 的 `swt.jobs.backup`
- 所以：**批量数据交给我更新 `data.js`；零散修改在网页上做**，两边不会互相覆盖到看不见

## 数据怎么流转

| 场景 | 做法 |
|---|---|
| 20～100 个岗位（截图/PDF） | 发给 AI 助手 → OCR + 翻译 + 结构化 → 更新 `data.js` |
| 单条新增 / 改错 / 调薪资 | 网页右上角「＋ 数据」直接改 |
| 备份 / 换设备 | 「导出 JSON」保存，「导入 JSON」恢复 |
| 多设备实时同步 | 需要后端（VPS 小接口或 Supabase），当前未做 |

## 说明

- 当前 `data.js` 是**示例数据**，请替换成真实岗位
- 收藏和权重存在浏览器 `localStorage`，换浏览器会丢
