/* SWT 选岗工作台 —— 纯前端，无依赖。含加权评分 + 站内数据编辑。 */
(function () {
  "use strict";

  /* ---------------- 常量 ---------------- */
  var TYPE_EMOJI = {
    "Housekeeping": "🧹", "Food Service": "🍽️", "Recreation": "🎢",
    "Retail": "🛍️", "Kitchen": "🔪", "Front Desk": "🛎️",
    "Warehouse": "📦", "Other": "💼"
  };
  var TYPE_CN = {
    "Housekeeping": "客房", "Food Service": "餐饮", "Recreation": "娱乐",
    "Retail": "零售", "Kitchen": "厨房", "Front Desk": "前台",
    "Warehouse": "仓储", "Other": "其他"
  };
  var DIMS = [
    { key: "income",   label: "净收入",   en: "Income",    dir: "high" },
    { key: "wage",     label: "时薪",     en: "Wage",      dir: "high" },
    { key: "tips",     label: "小费",     en: "Tips",      dir: "high" },
    { key: "overtime", label: "加班机会", en: "Overtime",  dir: "high" },
    { key: "housing",  label: "住宿成本", en: "Housing",   dir: "low"  },
    { key: "meals",    label: "包餐",     en: "Meals",     dir: "high" },
    { key: "hours",    label: "工时强度", en: "Workload",  dir: "low"  },
    { key: "english",  label: "英语门槛", en: "English",   dir: "low"  }
  ];
  var PRESETS = {
    money:   { name: "赚钱优先", w: { income: 40, wage: 20, tips: 15, overtime: 10, housing: 10, meals: 5, hours: 0, english: 0 } },
    easy:    { name: "轻松优先", w: { income: 15, wage: 10, tips: 5, overtime: 0, housing: 20, meals: 20, hours: 20, english: 10 } },
    value:   { name: "性价比",   w: { income: 25, wage: 15, tips: 10, overtime: 5, housing: 20, meals: 15, hours: 5, english: 5 } },
    english: { name: "英语友好", w: { income: 20, wage: 10, tips: 5, overtime: 0, housing: 15, meals: 10, hours: 5, english: 35 } }
  };
  var TIPS_VAL    = { none: 0, low: 0.35, medium: 0.7, high: 1 };
  var MEALS_VAL   = { none: 0, partial: 0.5, full: 1 };
  var OT_VAL      = { none: 0, some: 0.5, many: 1 };
  var ENGLISH_VAL = { Basic: 1, Intermediate: 0.55, Advanced: 0.2 };
  var TIPS_CN  = { none: "无", low: "低", medium: "中", high: "高" };
  var MEALS_CN = { none: "不包", partial: "部分", full: "全包" };
  var OT_CN    = { none: "无", some: "有", many: "多" };
  var HOUSING_CN = { dorm: "宿舍", apartment: "公寓", hotel: "酒店", none: "自理" };

  var LS_JOBS = "swt.jobs.v1";
  var LS_VERSION = "swt.jobs.version";
  var LS_BACKUP = "swt.jobs.backup";

  /* ---------------- 数据 ---------------- */
  function seedJobs() {
    return (window.JOBS || []).map(function (j) { return Object.assign({}, j); });
  }
  function normalize(j) {
    return Object.assign({
      titleCn: "", housing: 0, housingType: "dorm",
      tips: "none", meals: "none", overtime: "none",
      english: "Basic", perks: [], image: "", source: ""
    }, j);
  }
  function loadJobs() {
    var current = window.DATA_VERSION || "";
    try {
      var raw = localStorage.getItem(LS_JOBS);
      var ver = localStorage.getItem(LS_VERSION);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          if (ver === current) return arr.map(normalize);
          // 数据文件版本变了：先把本地改动备份，再改用新数据
          try { localStorage.setItem(LS_BACKUP, raw); } catch (e) {}
          try { localStorage.removeItem(LS_JOBS); localStorage.removeItem(LS_VERSION); } catch (e) {}
        }
      }
    } catch (e) {}
    return seedJobs().map(normalize);
  }
  function saveJobs() {
    try {
      localStorage.setItem(LS_JOBS, JSON.stringify(jobs));
      localStorage.setItem(LS_VERSION, window.DATA_VERSION || "");
    } catch (e) {}
  }

  var jobs = loadJobs();

  var state = {
    q: "", st: "", type: "",
    minWage: null, minHours: null, maxHousing: null,
    tips: "", meals: "", overtime: "",
    freeHousing: false, onlyFav: false, sort: "score",
    rate: 7.10, favs: {}, picks: [], weights: null
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 持久化 ---------------- */
  function load() {
    try {
      var f = localStorage.getItem("swt.favs"); if (f) state.favs = JSON.parse(f);
      var r = localStorage.getItem("swt.rate"); if (r) state.rate = parseFloat(r) || 7.10;
      var w = localStorage.getItem("swt.weights"); if (w) state.weights = JSON.parse(w);
    } catch (e) {}
    if (!state.weights) state.weights = Object.assign({}, PRESETS.money.w);
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---------------- 计算 ---------------- */
  function calc(j) {
    // weeklyPay: 含小费的周薪（小费岗底薪很低，用这个算真实收入）
    var base = j.wage * j.hours;
    var weeklyGross = (j.weeklyPay && j.weeklyPay > 0) ? j.weeklyPay : base;
    var weeklyNet = Math.max(0, weeklyGross - (j.housing || 0));
    var monthNetUsd = weeklyNet * 52 / 12;
    return {
      weeklyGross: weeklyGross,
      baseGross: base,
      weeklyNet: weeklyNet,
      monthGrossUsd: weeklyGross * 52 / 12,
      monthNetUsd: monthNetUsd,
      monthNetCny: monthNetUsd * state.rate
    };
  }

  var RANGES = {};
  function buildRanges() {
    RANGES = {};
    if (!jobs.length) return;
    DIMS.forEach(function (d) {
      var vals = jobs.map(function (j) { return rawDim(j, d.key); });
      RANGES[d.key] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
    });
  }
  function rawDim(j, key) {
    switch (key) {
      case "income": return calc(j).monthNetCny;
      case "wage": return j.wage;
      case "tips": return TIPS_VAL[j.tips] != null ? TIPS_VAL[j.tips] : 0;
      case "overtime": return OT_VAL[j.overtime] != null ? OT_VAL[j.overtime] : 0;
      case "housing": return j.housing || 0;
      case "meals": return MEALS_VAL[j.meals] != null ? MEALS_VAL[j.meals] : 0;
      case "hours": return j.hours;
      case "english": return ENGLISH_VAL[j.english] != null ? ENGLISH_VAL[j.english] : 0.5;
      default: return 0;
    }
  }
  function normDim(j, d) {
    var r = RANGES[d.key];
    var v = rawDim(j, d.key);
    if (!r || r.max === r.min) return 0.5;
    var t = (v - r.min) / (r.max - r.min);
    return d.dir === "low" ? 1 - t : t;
  }
  function scoreOf(j) {
    var sum = 0, wsum = 0;
    DIMS.forEach(function (d) {
      var w = state.weights[d.key] || 0;
      sum += w * normDim(j, d);
      wsum += w;
    });
    return wsum > 0 ? (sum / wsum) * 100 : 0;
  }

  function fmtMoney(n) { return Math.round(n).toLocaleString("zh-CN"); }
  function fmtDate(s) { if (!s) return "—"; var p = s.split("-"); return p.length === 3 ? p[1] + "/" + p[2] : s; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- 筛选 ---------------- */
  var LEVEL = { tips: ["none", "low", "medium", "high"], meals: ["none", "partial", "full"], overtime: ["none", "some", "many"] };

  function filtered() {
    var list = jobs.filter(function (j) {
      var q = state.q.trim().toLowerCase();
      if (q) {
        var hay = [j.title, j.titleCn, j.employer, j.city, j.state, j.type].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (state.st && j.state !== state.st) return false;
      if (state.type && j.type !== state.type) return false;
      if (state.minWage != null && j.wage < state.minWage) return false;
      if (state.minHours != null && j.hours < state.minHours) return false;
      if (state.maxHousing != null && (j.housing || 0) > state.maxHousing) return false;
      if (state.freeHousing && (j.housing || 0) > 0) return false;
      if (state.tips && LEVEL.tips.indexOf(j.tips) < LEVEL.tips.indexOf(state.tips)) return false;
      if (state.meals && LEVEL.meals.indexOf(j.meals) < LEVEL.meals.indexOf(state.meals)) return false;
      if (state.overtime && LEVEL.overtime.indexOf(j.overtime) < LEVEL.overtime.indexOf(state.overtime)) return false;
      if (state.onlyFav && !state.favs[j.id]) return false;
      return true;
    });

    list.sort(function (a, b) {
      switch (state.sort) {
        case "net": return calc(b).monthNetCny - calc(a).monthNetCny;
        case "wage": return b.wage - a.wage;
        case "housing": return (a.housing || 0) - (b.housing || 0);
        case "start": return (a.start || "").localeCompare(b.start || "");
        default: return scoreOf(b) - scoreOf(a);
      }
    });
    return list;
  }

  /* ---------------- 卡片 ---------------- */
  // 雇主照片（抓自各雇主官网）；没有图的雇主回落到渐变海报
  var EMPLOYER_IMAGES = {
    "320 Guest Ranch": "img/320-ranch.jpg",
    "Alberton Orchards Guest Ranch": "img/alberton.jpg",
    "Beartooth Market": "img/beartooth.jpg",
    "Bishops Store": "img/bishops.jpg",
    "Little Missouri Restaurant and Saloon": "img/little-missouri.jpg",
    "Macondo Agency": "img/macondo.jpg",
    "North Forty Resort": "img/north-forty.jpg",
    "Piezanos Pizza North": "img/piezano.jpg",
    "Piezanos Pizza South": "img/piezano.jpg",
    "Petes Rocky Mountain Pizza": "img/petes.jpg",
    "Alaska Juneau Mining Company": "img/alaska-juneau.jpg",
    "Old Firehouse Winery": "img/old-firehouse.jpg",
    "Southern Shores Food Company": "img/southern-shores.jpg",
    "Stoneacre Brasserie": "img/stoneacre.jpg"
  };

  function posterStyle(j) {
    var img = j.image || EMPLOYER_IMAGES[j.employer];
    if (img) return "background-image:url('" + img.replace(/'/g, "%27") + "')";
    var palettes = [
      ["#0b6bcb", "#4aa3ff"], ["#0a7a4a", "#3fbf85"], ["#8a4b12", "#e0a34e"],
      ["#5b2a86", "#a06ad6"], ["#0f4c5c", "#3f9aa8"], ["#7a1f2b", "#d05a6a"]
    ];
    var idx = Math.abs(hash(j.id || "x")) % palettes.length;
    return "background-image:linear-gradient(135deg," + palettes[idx][0] + "," + palettes[idx][1] + ")";
  }
  function hash(s) { var h = 0, i; for (i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; }
  function scoreClass(s) { return s >= 75 ? "hi" : s >= 55 ? "mid" : "lo"; }

  function card(j) {
    var c = calc(j), sc = scoreOf(j);
    var fav = !!state.favs[j.id];
    var picked = state.picks.indexOf(j.id) !== -1;
    var hasImg = !!(j.image || EMPLOYER_IMAGES[j.employer]);
    var el = document.createElement("article");
    el.className = "card";
    el.innerHTML =
      '<div class="poster" style="' + posterStyle(j) + '">' +
        '<div class="poster-top">' +
          '<span class="state-badge">' + esc(j.state) + '</span>' +
          '<span class="score-badge ' + scoreClass(sc) + '"><b>' + Math.round(sc) + '</b>分</span>' +
        '</div>' +
        (hasImg ? '' : '<div class="emoji">' + (TYPE_EMOJI[j.type] || TYPE_EMOJI.Other) + '</div>') +
        '<div class="poster-title">' + esc(j.title) +
          '<small>' + esc(j.titleCn || TYPE_CN[j.type] || "") + '</small>' +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="employer"><b>' + esc(j.employer) + '</b><br>' + esc(j.city) + ', ' + esc(j.state) + '</div>' +
        '<div class="money">' +
          '<div class="cny">¥' + fmtMoney(c.monthNetCny) + '<small>/月</small></div>' +
          '<div class="usd">净收入（扣住宿）<br>$' + fmtMoney(c.monthNetUsd) + ' / 月</div>' +
        '</div>' +
        '<div class="rows">' +
          '<div><span>时薪</span><span>$' + Number(j.wage).toFixed(2) + '/h</span></div>' +
          '<div><span>周工时</span><span>' + j.hours + ' h</span></div>' +
          (j.weeklyPay && j.weeklyPay > 0 ? '<div><span>含小费周薪</span><span>$' + j.weeklyPay + '</span></div>' : '') +
          '<div><span>住宿</span><span>' + ((j.housing || 0) ? '$' + j.housing + '/周' : '免费') + '</span></div>' +
          '<div><span>起止</span><span>' + ((j.start || j.end) ? (fmtDate(j.start) + ' – ' + fmtDate(j.end)) : '待定') + '</span></div>' +
          '<div><span>小费</span><span>' + (TIPS_CN[j.tips] || "—") + '</span></div>' +
          '<div><span>包餐</span><span>' + (MEALS_CN[j.meals] || "—") + '</span></div>' +
          '<div><span>加班</span><span>' + (OT_CN[j.overtime] || "—") + '</span></div>' +
          '<div><span>英语</span><span>' + esc(j.english) + '</span></div>' +
        '</div>' +
        (j.perks && j.perks.length ? '<div class="tags">' + j.perks.map(function (p, i) {
          return '<span class="tag' + (i === 0 ? ' good' : '') + '">' + esc(p) + '</span>';
        }).join("") + '</div>' : '') +
        '<div class="card-foot">' +
          '<label class="pick"><input type="checkbox" ' + (picked ? "checked" : "") + ' data-pick="' + j.id + '"> 加入对比</label>' +
          '<button class="fav ' + (fav ? "on" : "") + '" data-fav="' + j.id + '" title="收藏">' + (fav ? "★" : "☆") + '</button>' +
        '</div>' +
      '</div>';
    return el;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var list = filtered();
    var grid = $("grid");
    grid.innerHTML = "";
    list.forEach(function (j) { grid.appendChild(card(j)); });

    $("count").textContent = list.length + " / " + jobs.length + " 个岗位";
    var best = list.length ? list[0] : null;
    $("statLine").textContent = best
      ? "当前排序第一：" + best.title + " · 综合 " + Math.round(scoreOf(best)) + " 分 · ¥" + fmtMoney(calc(best).monthNetCny) + "/月"
      : (jobs.length ? "没有符合条件的岗位" : "还没有数据，点右上角「＋ 数据」添加岗位");

    renderCompareBar();
  }

  function renderCompareBar() {
    var bar = $("compareBar");
    if (!state.picks.length) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    $("pickedList").innerHTML = state.picks.map(function (id) {
      var j = jobs.filter(function (x) { return x.id === id; })[0];
      return '<span class="chip">' + esc(j ? j.title : id) + '</span>';
    }).join("");
  }

  /* ---------------- 权重面板 ---------------- */
  function renderWeights() {
    var wrap = $("sliders");
    wrap.innerHTML = "";
    DIMS.forEach(function (d) {
      var w = state.weights[d.key] || 0;
      var row = document.createElement("label");
      row.className = "slider-row";
      row.innerHTML =
        '<span class="sl-label">' + d.label + ' <em class="en">' + d.en + '</em></span>' +
        '<input type="range" min="0" max="100" step="5" value="' + w + '" data-w="' + d.key + '">' +
        '<span class="sl-val" id="wv-' + d.key + '">' + w + '</span>';
      wrap.appendChild(row);
    });
    $("presetName").textContent = currentPresetName();
  }

  function currentPresetName() {
    var keys = Object.keys(PRESETS);
    for (var i = 0; i < keys.length; i++) {
      var p = PRESETS[keys[i]];
      var same = DIMS.every(function (d) { return (state.weights[d.key] || 0) === (p.w[d.key] || 0); });
      if (same) return p.name;
    }
    return "自定义";
  }

  function applyPreset(key) {
    var p = PRESETS[key];
    if (!p) return;
    state.weights = Object.assign({}, p.w);
    save("swt.weights", state.weights);
    renderWeights();
    render();
  }

  /* ---------------- 对比 ---------------- */
  function openCompare() {
    var picked = state.picks.map(function (id) {
      return jobs.filter(function (x) { return x.id === id; })[0];
    }).filter(Boolean);
    if (!picked.length) return;

    var bestScore = Math.max.apply(null, picked.map(scoreOf));
    var rows = [
      ["综合评分", function (j) { return "<b>" + Math.round(scoreOf(j)) + "</b> 分"; }],
      ["月净收入", function (j) { return "¥" + fmtMoney(calc(j).monthNetCny) + "<br><span class='en'>$" + fmtMoney(calc(j).monthNetUsd) + "</span>"; }],
      ["时薪", function (j) { return "$" + Number(j.wage).toFixed(2) + "/h"; }],
      ["周工时", function (j) { return j.hours + " h"; }],
      ["含小费周薪", function (j) { return (j.weeklyPay && j.weeklyPay > 0) ? ("$" + j.weeklyPay) : "—"; }],
      ["住宿", function (j) { return ((j.housing || 0) ? "$" + j.housing + "/周" : "免费") + "<br><span class='en'>" + (HOUSING_CN[j.housingType] || "") + "</span>"; }],
      ["小费", function (j) { return TIPS_CN[j.tips] || "—"; }],
      ["包餐", function (j) { return MEALS_CN[j.meals] || "—"; }],
      ["加班", function (j) { return OT_CN[j.overtime] || "—"; }],
      ["英语要求", function (j) { return esc(j.english); }],
      ["起止", function (j) { return (j.start || j.end) ? (fmtDate(j.start) + " – " + fmtDate(j.end)) : "待定"; }],
      ["雇主", function (j) { return esc(j.employer) + "<br><span class='en'>" + esc(j.city) + ", " + esc(j.state) + "</span>"; }]
    ];

    var html = "<table class='cmp'><thead><tr><th></th>" +
      picked.map(function (j) { return "<th>" + esc(j.title) + "</th>"; }).join("") +
      "</tr></thead><tbody>";
    rows.forEach(function (r) {
      html += "<tr><th>" + r[0] + "</th>";
      picked.forEach(function (j) {
        var isBest = r[0] === "综合评分" && scoreOf(j) === bestScore;
        html += "<td class='" + (isBest ? "best" : "") + "'>" + r[1](j) + "</td>";
      });
      html += "</tr>";
    });
    html += "<tr><th>分项得分</th>";
    picked.forEach(function () { html += "<td></td>"; });
    html += "</tr>";
    DIMS.forEach(function (d) {
      html += "<tr><th class='dim'>" + d.label + "</th>";
      picked.forEach(function (j) {
        var v = Math.round(normDim(j, d) * 100);
        html += "<td><div class='bar'><i style='width:" + v + "%'></i></div><span class='en'>" + v + "</span></td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    $("compareTable").innerHTML = html;
    $("modal").classList.remove("hidden");
  }

  /* ---------------- 数据管理 ---------------- */
  var editingId = null;

  function openData() {
    renderJobList();
    $("dataModal").classList.remove("hidden");
  }
  function closeData() {
    $("dataModal").classList.add("hidden");
    hideForm();
  }

  function renderJobList() {
    var list = $("jobList");
    $("dataCount").textContent = jobs.length + " 个岗位";
    if (!jobs.length) {
      list.innerHTML = '<p class="empty">还没有岗位。点「＋ 新增岗位」开始，或导入一份 JSON。</p>';
      return;
    }
    list.innerHTML = jobs.map(function (j) {
      return '<div class="job-row">' +
        '<div class="jr-main"><b>' + esc(j.title) + '</b>' +
          '<span class="en">' + esc(j.titleCn || TYPE_CN[j.type] || "") + ' · ' + esc(j.city) + ', ' + esc(j.state) + '</span></div>' +
        '<div class="jr-meta">$' + Number(j.wage).toFixed(1) + '/h · ' + j.hours + 'h · 住宿' + ((j.housing || 0) ? '$' + j.housing : '免费') + '</div>' +
        '<div class="jr-actions">' +
          '<button class="ghost" data-edit="' + j.id + '">编辑</button>' +
          '<button class="ghost danger" data-del="' + j.id + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  function showForm(job) {
    editingId = job ? job.id : null;
    $("jobForm").classList.remove("hidden");
    $("formError").textContent = "";
    var v = job || {
      title: "", titleCn: "", employer: "", city: "", state: "", type: "Housekeeping",
      wage: "", hours: "", housing: 0, housingType: "dorm", tips: "none", meals: "none",
      overtime: "none", english: "Basic", start: "", end: "", perks: [], image: "", source: ""
    };
    $("f-title").value = v.title || "";
    $("f-titleCn").value = v.titleCn || "";
    $("f-employer").value = v.employer || "";
    $("f-city").value = v.city || "";
    $("f-state").value = v.state || "";
    $("f-type").value = v.type || "Housekeeping";
    $("f-wage").value = v.wage === 0 ? "" : (v.wage || "");
    $("f-hours").value = v.hours || "";
    $("f-housing").value = v.housing || 0;
    $("f-housingType").value = v.housingType || "dorm";
    $("f-tips").value = v.tips || "none";
    $("f-meals").value = v.meals || "none";
    $("f-overtime").value = v.overtime || "none";
    $("f-english").value = v.english || "Basic";
    $("f-start").value = v.start || "";
    $("f-end").value = v.end || "";
    $("f-perks").value = (v.perks || []).join(", ");
    $("f-image").value = v.image || "";
    $("f-source").value = v.source || "";
    $("jobForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function hideForm() {
    editingId = null;
    $("jobForm").classList.add("hidden");
    $("formError").textContent = "";
  }

  function saveForm() {
    var title = $("f-title").value.trim();
    var employer = $("f-employer").value.trim();
    var wage = parseFloat($("f-wage").value);
    var hours = parseFloat($("f-hours").value);
    var err = "";
    if (!title) err = "岗位名不能为空";
    else if (!employer) err = "雇主不能为空";
    else if (!(wage > 0)) err = "时薪要大于 0";
    else if (!(hours > 0)) err = "周工时要大于 0";
    if (err) { $("formError").textContent = err; return; }

    var obj = {
      id: editingId || ("u" + Date.now().toString(36)),
      title: title,
      titleCn: $("f-titleCn").value.trim(),
      employer: employer,
      city: $("f-city").value.trim(),
      state: $("f-state").value.trim().toUpperCase(),
      type: $("f-type").value,
      wage: wage,
      hours: hours,
      housing: parseFloat($("f-housing").value) || 0,
      housingType: $("f-housingType").value,
      tips: $("f-tips").value,
      meals: $("f-meals").value,
      overtime: $("f-overtime").value,
      english: $("f-english").value,
      start: $("f-start").value,
      end: $("f-end").value,
      perks: $("f-perks").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      image: $("f-image").value.trim(),
      source: $("f-source").value.trim()
    };

    if (editingId) {
      var idx = jobs.findIndex(function (x) { return x.id === editingId; });
      if (idx !== -1) jobs[idx] = obj; else jobs.push(obj);
    } else {
      jobs.push(obj);
    }

    afterDataChange();
    hideForm();
  }

  function deleteJob(id) {
    if (!confirm("删除这个岗位？")) return;
    jobs = jobs.filter(function (j) { return j.id !== id; });
    afterDataChange();
  }

  function afterDataChange() {
    saveJobs();
    buildRanges();
    renderJobList();
    render();
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var arr = JSON.parse(String(reader.result));
        if (!Array.isArray(arr)) throw new Error("不是数组");
        jobs = arr.map(normalize);
        afterDataChange();
        alert("导入成功，共 " + jobs.length + " 个岗位");
      } catch (e) {
        alert("导入失败：" + e.message);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(jobs, null, 2)], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "swt-jobs-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function resetData() {
    if (!confirm("恢复成内置的示例数据？你添加的岗位会被清空（建议先导出 JSON）。")) return;
    try { localStorage.removeItem(LS_JOBS); localStorage.removeItem(LS_VERSION); } catch (e) {}
    jobs = seedJobs().map(normalize);
    afterDataChange();
  }

  /* ---------------- 导出 CSV ---------------- */
  function exportCsv() {
    var list = state.picks.length
      ? jobs.filter(function (j) { return state.picks.indexOf(j.id) !== -1; })
      : filtered();

    var head = ["综合评分", "岗位", "中文", "雇主", "城市", "州", "类型", "时薪USD", "含小费周薪USD", "周工时",
      "住宿USD/周", "住宿类型", "小费", "包餐", "加班", "开始", "结束",
      "月净收入USD", "月净收入CNY", "汇率", "来源"];
    var lines = [head.join(",")];
    list.forEach(function (j) {
      var c = calc(j);
      var row = [Math.round(scoreOf(j)), j.title, j.titleCn, j.employer, j.city, j.state, j.type,
        j.wage, j.weeklyPay || "", j.hours, j.housing || 0, j.housingType, j.tips, j.meals, j.overtime,
        j.start, j.end, c.monthNetUsd.toFixed(0), c.monthNetCny.toFixed(0), state.rate, j.source || ""];
      lines.push(row.map(function (v) {
        var s = String(v == null ? "" : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(","));
    });

    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "swt-jobs-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- 初始化 ---------------- */
  function fillSelects() {
    var states = [], types = [];
    jobs.forEach(function (j) {
      if (states.indexOf(j.state) === -1) states.push(j.state);
      if (types.indexOf(j.type) === -1) types.push(j.type);
    });
    states.sort(); types.sort();
    states.forEach(function (s) {
      var o = document.createElement("option"); o.value = s; o.textContent = s + " 州"; $("state").appendChild(o);
    });
    types.forEach(function (t) {
      var o = document.createElement("option"); o.value = t;
      o.textContent = (TYPE_CN[t] || t) + " " + t; $("type").appendChild(o);
    });
  }

  function bind() {
    $("q").addEventListener("input", function (e) { state.q = e.target.value; render(); });
    $("state").addEventListener("change", function (e) { state.st = e.target.value; render(); });
    $("type").addEventListener("change", function (e) { state.type = e.target.value; render(); });
    $("tips").addEventListener("change", function (e) { state.tips = e.target.value; render(); });
    $("meals").addEventListener("change", function (e) { state.meals = e.target.value; render(); });
    $("overtime").addEventListener("change", function (e) { state.overtime = e.target.value; render(); });
    $("minWage").addEventListener("input", function (e) { state.minWage = e.target.value ? parseFloat(e.target.value) : null; render(); });
    $("minHours").addEventListener("input", function (e) { state.minHours = e.target.value ? parseFloat(e.target.value) : null; render(); });
    $("maxHousing").addEventListener("input", function (e) { state.maxHousing = e.target.value ? parseFloat(e.target.value) : null; render(); });
    $("freeHousing").addEventListener("change", function (e) { state.freeHousing = e.target.checked; render(); });
    $("onlyFav").addEventListener("change", function (e) { state.onlyFav = e.target.checked; render(); });
    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; render(); });
    $("rate").addEventListener("input", function (e) {
      state.rate = parseFloat(e.target.value) || 0;
      save("swt.rate", state.rate);
      buildRanges();
      render();
    });

    $("reset").addEventListener("click", function () {
      state.q = ""; state.st = ""; state.type = "";
      state.minWage = null; state.minHours = null; state.maxHousing = null;
      state.tips = ""; state.meals = ""; state.overtime = "";
      state.freeHousing = false; state.onlyFav = false; state.sort = "score";
      $("q").value = ""; $("state").value = ""; $("type").value = "";
      $("minWage").value = ""; $("minHours").value = ""; $("maxHousing").value = "";
      $("tips").value = ""; $("meals").value = ""; $("overtime").value = "";
      $("freeHousing").checked = false; $("onlyFav").checked = false; $("sort").value = "score";
      render();
    });

    $("sliders").addEventListener("input", function (e) {
      var key = e.target.getAttribute("data-w");
      if (!key) return;
      state.weights[key] = parseInt(e.target.value, 10);
      $("wv-" + key).textContent = e.target.value;
      save("swt.weights", state.weights);
      $("presetName").textContent = currentPresetName();
      render();
    });

    document.querySelectorAll(".preset").forEach(function (btn) {
      btn.addEventListener("click", function () { applyPreset(btn.getAttribute("data-preset")); });
    });

    document.addEventListener("click", function (e) {
      var favBtn = e.target.closest("[data-fav]");
      if (favBtn) {
        var id = favBtn.getAttribute("data-fav");
        if (state.favs[id]) delete state.favs[id]; else state.favs[id] = true;
        save("swt.favs", state.favs); render(); return;
      }
      var pick = e.target.closest("[data-pick]");
      if (pick) {
        var pid = pick.getAttribute("data-pick");
        var i = state.picks.indexOf(pid);
        if (pick.checked) {
          if (i === -1) {
            if (state.picks.length >= 3) { pick.checked = false; alert("最多对比 3 个岗位"); return; }
            state.picks.push(pid);
          }
        } else if (i !== -1) state.picks.splice(i, 1);
        render(); return;
      }

      var editBtn = e.target.closest("[data-edit]");
      if (editBtn) {
        var ej = jobs.filter(function (x) { return x.id === editBtn.getAttribute("data-edit"); })[0];
        if (ej) showForm(ej);
        return;
      }
      var delBtn = e.target.closest("[data-del]");
      if (delBtn) { deleteJob(delBtn.getAttribute("data-del")); return; }
    });

    $("openCompare").addEventListener("click", openCompare);
    $("exportCsv").addEventListener("click", exportCsv);
    $("clearCompare").addEventListener("click", function () { state.picks = []; render(); });
    $("closeModal").addEventListener("click", function () { $("modal").classList.add("hidden"); });
    $("modal").addEventListener("click", function (e) {
      if (e.target === $("modal")) $("modal").classList.add("hidden");
    });

    // 数据管理
    $("openData").addEventListener("click", openData);
    $("closeData").addEventListener("click", closeData);
    $("dataModal").addEventListener("click", function (e) {
      if (e.target === $("dataModal")) closeData();
    });
    $("addJob").addEventListener("click", function () { showForm(null); });
    $("saveJob").addEventListener("click", saveForm);
    $("cancelJob").addEventListener("click", hideForm);
    $("exportJson").addEventListener("click", exportJson);
    $("resetData").addEventListener("click", resetData);
    $("importFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = "";
    });
  }

  load();
  buildRanges();
  if (window.innerWidth < 760) $("weightsPanel").removeAttribute("open");
  $("rate").value = state.rate;
  fillSelects();
  renderWeights();
  bind();
  render();
  if (location.hash === "#data") openData();
})();
