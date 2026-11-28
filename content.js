// 千川 ROI 实时监控悬浮面板（Shadow DOM 隔离，支持单值秒级监听 + 多架构计划列表监听 + 页面异常提醒）

(() => {
  if (window.__QC_ROI_MONITOR_LOADED__) {
    return;
  }
  window.__QC_ROI_MONITOR_LOADED__ = true;

  const STORAGE_KEY = "qc_roi_monitor_config_v1";
  const CONFIG_BACKUP_KEY = "qc_roi_monitor_config_backup_v1";
  const CHANNELS_STORAGE_KEY = "qc_roi_monitor_channels_v1";
  const CHANNELS_BACKUP_KEY = "qc_roi_monitor_channels_backup_v1";
  const COOLDOWN_STORAGE_KEY = "qc_roi_monitor_cooldowns_v1";
  const COOLDOWN_BACKUP_KEY = "qc_roi_monitor_cooldowns_backup_v1";
  const CHANNEL_STRING_FIELDS = ["wecomWebhook", "wecomMobiles", "pushplusToken", "customWebhook", "barkUrl"];
  const AI_STRING_FIELDS = ["aiProvider", "aiApiKey", "aiModel", "aiEndpoint"];
  const CHANNEL_BOOL_FIELDS = ["desktopEnabled", "soundEnabled", "pushOnLow", "pushOnHigh", "pushOnCost", "pushOnExpired"];
  const AI_PROVIDER_DEFAULTS = {
    doubao: { endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "doubao-1-5-pro-32k-250115" },
    zhipu: { endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash" },
    deepseek: { endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
    qwen: { endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
    siliconflow: { endpoint: "https://api.siliconflow.cn/v1/chat/completions", model: "Qwen/Qwen2.5-7B-Instruct" },
    custom: { endpoint: "", model: "" },
  };
  const PREV_DEFAULT_ROI_KEYWORD = "整体支付ROI,直接支付ROI,支付ROI,ROI";
  const PREV_DEFAULT_NAME_KEYWORDS = ["计划", "计划,商品信息,商品,直播间", "计划,任务名称,商品信息,商品,直播间,任务"];
  const DEFAULT_CONFIG = {
    enabled: false,
    mode: "both", // "both" | "single" | "table"
    selector: "",
    selectorLabel: "",
    pageBindings: {}, // { [origin+pathname]: { selector, label } }
    roiHeaderKeyword: "调控综合营销ROI,综合营销ROI,整体支付ROI,直接支付ROI,支付ROI,ROI",
    costHeaderKeyword: "调控消耗,整体消耗,消耗",
    nameHeaderKeyword: "计划,任务名称,抖音号,商品信息,商品,直播间,任务",
    minCost: 20,
    onlyDelivering: true,
    onlyRegulating: true,
    highlightAbnormalRows: true,
    markExpiredGuarantee: true,
    abnormalSort: "table", // "table" | "extreme"
    abnormalFilter: "all", // "all" | "low" | "high" | "cost" | "expired"
    compactMode: true,
    landscapeMode: true,
    collapsedSections: {
      sec_summary: false,
      sec_target: false,
      sec_rules: false,
      sec_push: false,
      sec_ai: false,
      sec_logs: false,
      sec_author: true,
    },
    lowerLimit: "1.5",
    upperLimit: "4.0",
    costAlertEnabled: true,
    budgetWarnPercent: "80",
    balanceAlertEnabled: true,
    balanceWarnThreshold: "1000",
    overallCostLimit: "",
    singleCostLimit: "",
    cooldownMinutes: 10,
    lowCooldownMin: 30,
    highCooldownMin: 30,
    costCooldownMin: 3,
    mergeBatchAlerts: true,
    summaryReportEnabled: true,
    summaryIntervalMin: 30,
    autoClickRefresh: false,
    refreshIntervalSec: 60,
    preferredPageSize: "100",
    autoOptimizeViewOnStart: true,
    anomalyAlertEnabled: true,
    staleMinutes: 15,
    soundEnabled: true,
    desktopEnabled: true,
    pushOnLow: true,
    pushOnHigh: true,
    pushOnCost: true,
    pushOnExpired: false,
    wecomWebhook: "",
    wecomMobiles: "",
    pushplusToken: "",
    customWebhook: "",
    barkUrl: "",
    aiProvider: "doubao",
    aiApiKey: "",
    aiModel: "doubao-1-5-pro-32k-250115",
    aiEndpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    channelHistory: {
      wecomWebhook: [],
      wecomMobiles: [],
      pushplusToken: [],
      customWebhook: [],
      barkUrl: [],
    },
  };

  const ROI_EXCLUDE_RE = /(目标|出价|设置|预期|建议|保本|门槛|最低)/i;
  const ROI_PREFER_RE = /(调控综合营销|综合营销|整体支付|直接支付|直播间支付|直播间成交|调控净成交|支付roi|成交roi|整体roi|全场roi|当日roi|实时roi)/i;
  const COST_EXCLUDE_RE = /(成本|预算|出价|门槛|补贴|评分|roi)/i;
  const NAME_EXCLUDE_RE = /(状态|设置|操作|工具|类型|方式|时段|时间|出价|预算|消耗|roi|订单|金额|成本|补贴|评分|素材)/i;
  const SUMMARY_ROW_TEXT_RE = /^(合计|总计|汇总|小计|全部合计|当前页合计|筛选合计|总览|共\s*\d+\s*(条计划|条广告|条任务|条记录|条数据|个商品|个计划|个抖音号|个|项|场)\s*$)/;
  const SUMMARY_ROW_CLASS_RE = /(measure-row|placeholder|empty|summary|ovui-t-summary|total-row|tfoot|sticky-summary)/i;
  const TABLE_HEADER_PEER_RE = /(计划|消耗|roi|订单|成交|状态|操作|金额|成本|预算|商品|直播|创意|广告)/i;

  const LOGIN_EXPIRED_RE = /(登录已失效|登录已过期|登录状态已失效|请重新登录|账号已退出|会话已过期|身份认证已过期|登录超时|账号已在其他地方登录|请先登录)/;
  const PAGE_ERROR_RE = /(系统异常|网络异常|服务异常|请求失败|加载失败|数据加载异常|页面加载失败|暂无权限|无权访问|访问受限|系统繁忙，请稍后|服务开小差|接口异常|页面崩溃|502 Bad Gateway|504 Gateway|500 Internal)/;
  const ANNOUNCEMENT_IGNORE_RE = /(尊敬的客户|平台公告|温馨提示|系统通知|升级公告)/;

  let config = {
    ...DEFAULT_CONFIG,
    channelHistory: {
      wecomWebhook: [],
      wecomMobiles: [],
      pushplusToken: [],
      customWebhook: [],
      barkUrl: [],
    },
  };
  let isConfigHydrated = false;
  let lastChannelsUpdatedAt = 0;
  let isExpanded = false;
  let isPicking = false;
  let hoveredEl = null;
  let observer = null;
  let pollTimer = null;
  let refreshTimer = null;
  let cooldownMap = new Map(); // key -> { ts, direction }
  let alertLogs = [];
  let latestDisplay = {
    status: "idle", // idle | ok | high | low | warn | error
    text: "未启动",
    rowsSummary: "",
  };
  let latestAbnormalItems = [];
  let allAbnormalItems = [];
  let activeAbnormalId = "";
  const highlightedRowEls = new Set();
  const highlightedCellEls = new Set();
  const highlightedCostCellEls = new Set();
  const highlightedStatusCellEls = new Set();
  const activeFocusedRowEls = new Set();

  // 注入主页面异常计划高亮样式（使用纯 CSS 属性与 ::after 伪元素，不改动页面原有子节点，不触发 React/MutationObserver 循环）
  function ensurePageHighlightStyle() {
    if (document.getElementById("qc-roi-monitor-page-style")) return;
    const s = document.createElement("style");
    s.id = "qc-roi-monitor-page-style";
    s.textContent = `
      [data-qc-roi-row="low"], [data-qc-roi-row="low"] > td {
        background-color: rgba(239, 68, 68, 0.11) !important;
      }
      [data-qc-roi-row="low"] > td:first-child,
      [data-qc-roi-row="low"]:not(tr) {
        box-shadow: inset 4px 0 0 #ef4444 !important;
      }
      [data-qc-roi-row="high"], [data-qc-roi-row="high"] > td {
        background-color: rgba(245, 158, 11, 0.13) !important;
      }
      [data-qc-roi-row="high"] > td:first-child,
      [data-qc-roi-row="high"]:not(tr) {
        box-shadow: inset 4px 0 0 #f59e0b !important;
      }
      [data-qc-roi-cell="low"] {
        background-color: rgba(239, 68, 68, 0.19) !important;
        box-shadow: inset 0 0 0 1.5px #ef4444 !important;
      }
      [data-qc-roi-cell="high"] {
        background-color: rgba(245, 158, 11, 0.22) !important;
        box-shadow: inset 0 0 0 1.5px #f59e0b !important;
      }
      [data-qc-roi-cell]::after {
        content: attr(data-qc-roi-badge);
        display: block;
        width: fit-content;
        margin-top: 4px;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.45;
        white-space: nowrap;
      }
      [data-qc-roi-cell="low"]::after {
        background: #ef4444;
        color: #ffffff;
      }
      [data-qc-roi-cell="high"]::after {
        background: #f59e0b;
        color: #111827;
      }
      [data-qc-roi-row="cost_warn"], [data-qc-roi-row="cost_warn"] > td {
        background-color: rgba(168, 85, 247, 0.11) !important;
      }
      [data-qc-roi-row="cost_warn"] > td:first-child,
      [data-qc-roi-row="cost_warn"]:not(tr) {
        box-shadow: inset 4px 0 0 #a855f7 !important;
      }
      [data-qc-roi-row="cost_hit"], [data-qc-roi-row="cost_hit"] > td {
        background-color: rgba(225, 29, 72, 0.13) !important;
      }
      [data-qc-roi-row="cost_hit"] > td:first-child,
      [data-qc-roi-row="cost_hit"]:not(tr) {
        box-shadow: inset 4px 0 0 #e11d48 !important;
      }
      [data-qc-cost-cell="cost_warn"] {
        background-color: rgba(168, 85, 247, 0.19) !important;
        box-shadow: inset 0 0 0 1.5px #a855f7 !important;
      }
      [data-qc-cost-cell="cost_hit"] {
        background-color: rgba(225, 29, 72, 0.22) !important;
        box-shadow: inset 0 0 0 1.5px #e11d48 !important;
      }
      [data-qc-cost-cell]::after {
        content: attr(data-qc-cost-badge);
        display: block;
        width: fit-content;
        margin-top: 4px;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.45;
        white-space: nowrap;
      }
      [data-qc-cost-cell="cost_warn"]::after {
        background: #9333ea;
        color: #ffffff;
      }
      [data-qc-cost-cell="cost_hit"]::after {
        background: #e11d48;
        color: #ffffff;
      }
      [data-qc-roi-row="expired"], [data-qc-roi-row="expired"] > td {
        background-color: rgba(250, 204, 21, 0.16) !important;
      }
      [data-qc-roi-row="expired"] > td:first-child,
      [data-qc-roi-row="expired"]:not(tr) {
        box-shadow: inset 4px 0 0 #eab308 !important;
      }
      [data-qc-status-cell="expired"] {
        background-color: rgba(250, 204, 21, 0.24) !important;
        box-shadow: inset 0 0 0 1.5px #eab308 !important;
      }
      [data-qc-status-cell]::after {
        content: attr(data-qc-status-badge);
        display: block;
        width: fit-content;
        margin-top: 4px;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.45;
        white-space: nowrap;
        background: #facc15;
        color: #422006;
      }
      [data-qc-roi-active="1"], [data-qc-roi-active="1"] > td {
        box-shadow: inset 0 2px 0 #3b82f6, inset 0 -2px 0 #3b82f6 !important;
      }
      [data-qc-roi-active="1"] > td:first-child,
      [data-qc-roi-active="1"]:not(tr) {
        box-shadow: inset 5px 0 0 #2563eb, inset 0 2px 0 #3b82f6, inset 0 -2px 0 #3b82f6 !important;
      }
      @keyframes qcRoiFlashPulse {
        0% { outline: 3px solid #3b82f6; outline-offset: -2px; }
        50% { outline: 3px solid #93c5fd; outline-offset: -2px; }
        100% { outline: 3px solid transparent; outline-offset: -2px; }
      }
      [data-qc-roi-flash="1"] {
        animation: qcRoiFlashPulse 1.0s ease-out 2 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function clearActiveRowFocus() {
    for (const el of activeFocusedRowEls) {
      if (el && el.removeAttribute) {
        el.removeAttribute("data-qc-roi-active");
      }
    }
    activeFocusedRowEls.clear();
  }

  function clearPageHighlights() {
    clearActiveRowFocus();
    for (const el of highlightedRowEls) {
      if (el && el.removeAttribute) {
        el.removeAttribute("data-qc-roi-row");
      }
    }
    highlightedRowEls.clear();
    for (const cell of highlightedCellEls) {
      if (cell && cell.removeAttribute) {
        cell.removeAttribute("data-qc-roi-cell");
        cell.removeAttribute("data-qc-roi-badge");
      }
    }
    highlightedCellEls.clear();
    for (const cell of highlightedCostCellEls) {
      if (cell && cell.removeAttribute) {
        cell.removeAttribute("data-qc-cost-cell");
        cell.removeAttribute("data-qc-cost-badge");
      }
    }
    highlightedCostCellEls.clear();
    for (const cell of highlightedStatusCellEls) {
      if (cell && cell.removeAttribute) {
        cell.removeAttribute("data-qc-status-cell");
        cell.removeAttribute("data-qc-status-badge");
      }
    }
    highlightedStatusCellEls.clear();
  }

  function applyPageHighlights(abnormalItems) {
    if (!config.enabled || !config.highlightAbnormalRows || abnormalItems.length === 0) {
      clearPageHighlights();
      return;
    }
    ensurePageHighlightStyle();

    const rowPriority = { low: 5, cost_hit: 4, cost_warn: 3, expired: 2, high: 1 };
    const nextRows = new Map();
    const nextRoiCells = new Map();
    const nextCostCells = new Map();
    const nextStatusCells = new Map();

    for (const item of abnormalItems) {
      for (const rEl of item.rowEls || []) {
        if (rEl && rEl.setAttribute) {
          const prev = nextRows.get(rEl);
          if (!prev || (rowPriority[item.direction] || 0) > (rowPriority[prev] || 0)) {
            nextRows.set(rEl, item.direction);
          }
        }
      }
      if (item.direction === "cost_warn" || item.direction === "cost_hit") {
        if (item.costCell && item.costCell.setAttribute) {
          const pctStr = Number.isFinite(item.budgetPct) ? `${item.budgetPct.toFixed(0)}%` : "";
          const badge = item.direction === "cost_hit" ? `🚨预算已满${pctStr}` : `⚡预算告急${pctStr}`;
          nextCostCells.set(item.costCell, { direction: item.direction, badge });
        }
      } else if (item.direction === "expired") {
        if (item.statusCell && item.statusCell.setAttribute) {
          nextStatusCells.set(item.statusCell, { direction: "expired", badge: "⚠️已过保" });
        }
      } else if (item.roiCell && item.roiCell.setAttribute) {
        const badge =
          item.direction === "low"
            ? `↓跌破下限(<${item.threshold})`
            : `↑突破上限(>${item.threshold})`;
        nextRoiCells.set(item.roiCell, { direction: item.direction, badge });
      }
    }

    for (const el of Array.from(highlightedRowEls)) {
      if (!nextRows.has(el)) {
        el.removeAttribute("data-qc-roi-row");
        highlightedRowEls.delete(el);
      }
    }
    for (const [el, dir] of nextRows.entries()) {
      if (el.getAttribute("data-qc-roi-row") !== dir) {
        el.setAttribute("data-qc-roi-row", dir);
      }
      highlightedRowEls.add(el);
    }

    for (const cell of Array.from(highlightedCellEls)) {
      if (!nextRoiCells.has(cell)) {
        cell.removeAttribute("data-qc-roi-cell");
        cell.removeAttribute("data-qc-roi-badge");
        highlightedCellEls.delete(cell);
      }
    }
    for (const [cell, info] of nextRoiCells.entries()) {
      if (cell.getAttribute("data-qc-roi-cell") !== info.direction) {
        cell.setAttribute("data-qc-roi-cell", info.direction);
      }
      if (cell.getAttribute("data-qc-roi-badge") !== info.badge) {
        cell.setAttribute("data-qc-roi-badge", info.badge);
      }
      highlightedCellEls.add(cell);
    }

    for (const cell of Array.from(highlightedCostCellEls)) {
      if (!nextCostCells.has(cell)) {
        cell.removeAttribute("data-qc-cost-cell");
        cell.removeAttribute("data-qc-cost-badge");
        highlightedCostCellEls.delete(cell);
      }
    }
    for (const [cell, info] of nextCostCells.entries()) {
      if (cell.getAttribute("data-qc-cost-cell") !== info.direction) {
        cell.setAttribute("data-qc-cost-cell", info.direction);
      }
      if (cell.getAttribute("data-qc-cost-badge") !== info.badge) {
        cell.setAttribute("data-qc-cost-badge", info.badge);
      }
      highlightedCostCellEls.add(cell);
    }

    for (const cell of Array.from(highlightedStatusCellEls)) {
      if (!nextStatusCells.has(cell)) {
        cell.removeAttribute("data-qc-status-cell");
        cell.removeAttribute("data-qc-status-badge");
        highlightedStatusCellEls.delete(cell);
      }
    }
    for (const [cell, info] of nextStatusCells.entries()) {
      if (cell.getAttribute("data-qc-status-cell") !== info.direction) {
        cell.setAttribute("data-qc-status-cell", info.direction);
      }
      if (cell.getAttribute("data-qc-status-badge") !== info.badge) {
        cell.setAttribute("data-qc-status-badge", info.badge);
      }
      highlightedStatusCellEls.add(cell);
    }
  }

  // 页面健康与断流追踪状态
  const healthState = {
    monitorStartedAt: 0,
    lastDataChangeAt: 0,
    lastDataFingerprint: "",
    hadValidData: false,
    dataMissingSince: 0,
    lastAnomalyCheckAt: 0,
    lastAutoBindAt: 0,
    lastPageKey: "",
    lastScanMeta: null,
    activeAnomalies: [],
    lastSummaryAt: 0,
    lastSummarySnapshot: null, // { ts, displayRoi, effectiveCost, activeCount }
    latestEvalSnapshot: null,  // 最近一次 evaluateNow 的完整快照，供定时/手动投流总结使用
    trendSamples: [],          // 近 35 分钟每分钟趋势采样（用于计算大盘斜率、单计划走势与撞墙倒计时）
    latestSummaryText: "",
    isGeneratingSummary: false,
    lastOverallRoi: null,
    lastOverallRoiLabel: "整体 ROI",
    lastOverallRoiAt: 0,
    lastOverallCost: null,
    lastOverallCostLabel: "整体消耗",
    lastOverallCostAt: 0,
    lastAccountBalance: null,
    lastAccountBalanceLabel: "可用余额",
    lastAccountBalanceAt: 0,
    abnormalSearchQuery: "",
  };

  // ---------- Shadow DOM UI ----------
  const host = document.createElement("div");
  host.id = "qc-roi-monitor-host";
  host.style.cssText =
    "position:fixed;top:84px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    .pill {
      display: flex; align-items: center; gap: 8px;
      background: #141720; color: #f3f6ff;
      border: 1px solid #2b3347; border-radius: 999px;
      padding: 8px 14px; cursor: pointer; user-select: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.32);
      font-size: 13px; font-weight: 600;
      transition: transform 0.15s ease, border-color 0.2s ease;
    }
    .pill:hover { transform: translateY(-1px); border-color: #4f7cff; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
    .dot.ok { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
    .dot.low, .dot.error { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
    .dot.high { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
    .dot.warn { background: #eab308; box-shadow: 0 0 8px #eab308; }

    .panel {
      width: 382px; max-height: 86vh; overflow-y: auto;
      background: #141720; color: #e5e9f2;
      border: 1px solid #2b3347; border-radius: 14px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.45);
      font-size: 12px; line-height: 1.45;
      display: none; position: relative;
    }
    .panel.open { display: block; }
    .panel.compact .config-section,
    .panel.compact .config-only { display: none !important; }
    .panel:not(.compact) .dashboard-only { display: none !important; }
    .panel.compact .abnormal-list { max-height: 420px; }
    .view-switcher {
      display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
      background: #0d111a; border: 1px solid #242c42; border-radius: 10px; padding: 4px;
    }
    .view-tab {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 6px 10px; border-radius: 7px; border: 1px solid transparent;
      background: transparent; color: #94a3b8; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.15s ease;
    }
    .view-tab:hover { color: #e2e8f0; background: #161d2e; }
    .view-tab.active {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff; border-color: #3b82f6;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
    }
    .kpi-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
    }
    .panel.landscape .kpi-grid {
      grid-template-columns: repeat(4, 1fr);
    }
    .kpi-card {
      background: #1a2133; border: 1px solid #28324a; border-radius: 10px;
      padding: 9px 11px; display: flex; flex-direction: column; gap: 3px; min-width: 0;
    }
    .kpi-label { font-size: 11px; color: #8c98b3; display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    .kpi-value { font-size: 18px; font-weight: 800; color: #f8fafc; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kpi-value.ok { color: #4ade80; }
    .kpi-value.low { color: #f87171; }
    .kpi-value.high { color: #fb923c; }
    .kpi-value.warn { color: #c084fc; }
    .kpi-sub { font-size: 10.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kpi-bar { width: 100%; height: 4px; background: #0f1422; border-radius: 999px; overflow: hidden; margin-top: 2px; }
    .kpi-bar-fill { height: 100%; width: 0%; background: #38bdf8; border-radius: 999px; transition: width 0.25s ease; }
    .kpi-bar-fill.warn { background: #a855f7; }
    .kpi-bar-fill.hit { background: #ef4444; }
    .config-done-bar {
      display: flex; justify-content: center; padding-top: 2px;
    }
    .config-done-btn {
      width: 100%; padding: 8px 12px; font-size: 12px; font-weight: 700;
    }
    .panel.landscape {
      width: min(860px, 94vw);
      max-height: 88vh;
    }
    .panel.landscape .body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .panel.landscape .abnormal-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      max-height: 176px;
      gap: 6px;
    }
    .panel.landscape.compact .abnormal-list {
      max-height: 280px;
    }
    .sections-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .panel.landscape .sections-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: stretch;
    }
    .panel.landscape .sections-grid > .section:not(.collapsed) {
      order: 1;
    }
    .panel.landscape .sections-grid > .section.span-full {
      grid-column: 1 / -1;
    }
    .panel.landscape .sections-grid > .section.collapsed {
      order: 2;
      align-self: start;
      padding: 8px 11px;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      padding: 10px 12px; border-bottom: 1px solid #242b3d;
      background: #1a1f2e; border-radius: 14px 14px 0 0;
      position: sticky; top: 0; z-index: 6;
      cursor: move; user-select: none;
    }
    .header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .title { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .version-tag {
      font-size: 10px; font-weight: 600; color: #93c5fd;
      background: #1f2e4d; border: 1px solid #30497a;
      border-radius: 999px; padding: 1px 6px; flex-shrink: 0;
    }
    .icon-btn {
      background: transparent; border: 1px solid #303952; color: #b8c2d8;
      border-radius: 6px; padding: 3px 7px; cursor: pointer; font-size: 11px; white-space: nowrap;
    }
    .icon-btn:hover { background: #273046; color: #fff; }
    .icon-btn.contact-btn {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(59, 130, 246, 0.22));
      border-color: rgba(251, 191, 36, 0.55);
      color: #fde68a; font-weight: 700;
    }
    .icon-btn.contact-btn:hover {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.36), rgba(59, 130, 246, 0.34));
      border-color: #fbbf24; color: #fffbeb;
      box-shadow: 0 0 10px rgba(251, 191, 36, 0.25);
    }
    .author-info {
      display: flex; flex-direction: column; gap: 7px; min-width: 0;
    }
    .author-wx-row {
      display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
    }
    .wechat-highlight-id {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 11px; border-radius: 8px; cursor: pointer;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13.5px; font-weight: 800; letter-spacing: 0.4px;
      color: #ffffff;
      background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
      border: 1px solid #7dd3fc;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
      transition: transform 0.12s ease, filter 0.15s ease;
      user-select: none;
    }
    .wechat-highlight-id:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .author-home-link {
      color: #60a5fa; font-weight: 700; text-decoration: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      border-bottom: 1px dashed rgba(96, 165, 250, 0.55);
      padding-bottom: 1px;
    }
    .author-home-link:hover { color: #93c5fd; border-bottom-color: #93c5fd; }
    .qr-modal-backdrop {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(6, 10, 20, 0.74); backdrop-filter: blur(3px);
      display: none; align-items: center; justify-content: center;
      padding: 16px;
    }
    .qr-modal-backdrop.open { display: flex; }
    .qr-modal-card {
      width: 268px; max-width: 92vw;
      background: #141a29; color: #e5e9f2;
      border: 1px solid #33456b; border-radius: 14px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.58);
      padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .qr-modal-head {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      font-size: 13px; font-weight: 700; color: #f8fafc;
    }
    .author-qr-wrap {
      background: #ffffff; padding: 8px; border-radius: 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.32);
      text-align: center;
    }
    .author-qr-img {
      display: block; width: 186px; height: 186px; object-fit: contain; border-radius: 6px;
    }
    .author-qr-tip {
      margin-top: 4px; font-size: 11px; color: #475569; font-weight: 600;
    }
    .qr-modal-actions {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .body { padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 12px; }

    .status-card {
      background: #1b2131; border: 1px solid #2b344a; border-radius: 10px;
      padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;
    }
    .status-value { font-size: 19px; font-weight: 700; color: #fff; }
    .status-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; word-break: break-word; }
    .btn {
      border: none; border-radius: 8px; padding: 7px 12px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      transition: opacity 0.15s ease; flex-shrink: 0;
    }
    .btn:hover { opacity: 0.9; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-success { background: #16a34a; color: #fff; }
    .btn-ghost { background: #252d42; color: #dbe3f5; border: 1px solid #33405c; }
    .btn-sm { padding: 5px 9px; font-size: 11px; }

    .section {
      background: #181d2b; border: 1px solid #252d40; border-radius: 10px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
    }
    .section-title { font-size: 12px; font-weight: 700; color: #93c5fd; display: flex; justify-content: space-between; align-items: center; gap: 6px; }

    .tabs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .tab {
      background: #1f2638; color: #9aa7c2; border: 1px solid #2d364d;
      border-radius: 8px; padding: 7px 6px; cursor: pointer; text-align: center; font-weight: 600; font-size: 11px;
    }
    .tab.active { background: #263961; color: #fff; border-color: #4f7cff; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    label.field { display: flex; flex-direction: column; gap: 4px; color: #b7c2d9; font-size: 11px; }
    input[type="text"], input[type="number"], input[type="password"], select {
      width: 100%; background: #0f131c; color: #f8fafc;
      border: 1px solid #303a52; border-radius: 6px;
      padding: 6px 8px; font-size: 12px; outline: none;
    }
    input:focus, select:focus { border-color: #4f7cff; }
    .check-row { display: flex; align-items: center; gap: 8px; color: #cbd5e1; cursor: pointer; }
    .check-row input { accent-color: #3b82f6; }

    .row-between { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .muted { color: #8c98b3; font-size: 11px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; color: #93c5fd; word-break: break-all; }
    .health-bar {
      background: #121724; border: 1px solid #25304a; border-radius: 6px;
      padding: 6px 8px; font-size: 11px; color: #cbd5e1;
    }
    .health-bar.warn { border-color: #854d0e; background: #271f0e; color: #fde68a; }
    .health-bar.error { border-color: #7f1d1d; background: #2a1215; color: #fecaca; }

    .logs {
      max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px;
    }
    .log-item {
      background: #10141f; border-left: 3px solid #3b82f6;
      padding: 6px 8px; border-radius: 4px; font-size: 11px;
    }
    .log-item.low, .log-item.error { border-left-color: #ef4444; }
    .log-item.high, .log-item.warn { border-left-color: #f59e0b; }
    .log-item.ok { border-left-color: #22c55e; }
    .abnormal-box {
      background: #181d2b; border: 1px solid #3c2630; border-radius: 10px;
      padding: 9px 11px; display: none; flex-direction: column; gap: 7px;
    }
    .abnormal-box.show { display: flex; }
    .abnormal-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;
    }
    .mini-pills { display: flex; align-items: center; gap: 4px; }
    .mini-pill {
      background: #1f2638; color: #9aa7c2; border: 1px solid #2d364d;
      border-radius: 999px; padding: 2px 7px; font-size: 10.5px; font-weight: 600;
      cursor: pointer; user-select: none;
    }
    .mini-pill:hover { border-color: #4f7cff; color: #e2e8f0; }
    .mini-pill.active { background: #263961; color: #fff; border-color: #4f7cff; }
    .mini-pill.low.active { background: #7f1d1d; border-color: #ef4444; color: #fff; }
    .mini-pill.high.active { background: #78350f; border-color: #f59e0b; color: #fef3c7; }
    .mini-pill.cost.active { background: #581c87; border-color: #a855f7; color: #f3e8ff; }
    .mini-pill.expired.active { background: #713f12; border-color: #eab308; color: #fef08a; }
    .stepper-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
    }
    .stepper-btns { display: flex; align-items: center; gap: 5px; }
    .step-btn {
      background: #222b40; color: #dbeafe; border: 1px solid #334366;
      border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .step-btn:hover { background: #2d3b59; border-color: #60a5fa; }
    .step-pos { font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .abnormal-list {
      max-height: 176px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px;
    }
    .abnormal-item {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      background: #10141f; border: 1px solid #262f45; border-left: 3px solid #ef4444;
      border-radius: 6px; padding: 6px 8px; cursor: pointer; transition: background 0.12s ease, border-color 0.12s ease;
    }
    .abnormal-item:hover { background: #1a2236; border-color: #4f7cff; }
    .abnormal-item.high { border-left-color: #f59e0b; }
    .abnormal-item.cost_warn { border-left-color: #a855f7; }
    .abnormal-item.cost_hit { border-left-color: #e11d48; }
    .abnormal-item.expired { border-left-color: #eab308; }
    .abnormal-item.active {
      background: #1a2742; border-color: #3b82f6;
      box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.45);
    }
    .row-seq {
      font-size: 10px; font-weight: 700; color: #93c5fd;
      background: #1a243b; border-radius: 4px; padding: 1px 4px; margin-right: 4px;
    }
    .abnormal-main { min-width: 0; flex: 1; }
    .abnormal-name {
      color: #f1f5f9; font-weight: 600; font-size: 11.5px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .abnormal-meta { color: #94a3b8; font-size: 10.5px; margin-top: 2px; }
    .tag-pill {
      font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; flex-shrink: 0;
    }
    .tag-pill.low { background: #ef4444; color: #fff; }
    .tag-pill.high { background: #f59e0b; color: #111827; }
    .tag-pill.cost_warn { background: #9333ea; color: #fff; }
    .tag-pill.cost_hit { background: #e11d48; color: #fff; }
    .tag-pill.expired { background: #facc15; color: #422006; }
    .toast {
      position: sticky; bottom: 8px; z-index: 6; margin: 0 14px 8px;
      font-size: 11px; color: #fde68a; background: rgba(44, 38, 20, 0.96);
      border: 1px solid #786227; border-radius: 8px; padding: 7px 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.45); display: none;
    }
    .toast.show { display: block; }
    .save-status {
      font-size: 10.5px; color: #4ade80; background: rgba(22, 163, 74, 0.14);
      border: 1px solid rgba(34, 197, 94, 0.35); border-radius: 6px; padding: 4px 8px;
    }
    .save-status.warn {
      color: #fde68a; background: rgba(234, 179, 8, 0.12); border-color: rgba(234, 179, 8, 0.35);
    }
    .input-with-btn { display: flex; align-items: center; gap: 5px; }
    .input-with-btn input { flex: 1; min-width: 0; }
    .history-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .history-chip {
      max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 10px; color: #bfdbfe; background: #172136; border: 1px solid #2b3f66;
      border-radius: 999px; padding: 1px 7px; cursor: pointer;
    }
    .history-chip:hover { border-color: #60a5fa; color: #fff; }
    .history-chip.active { background: #1e3a5f; border-color: #3b82f6; color: #fff; }
    .field-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .help-link {
      font-size: 10.5px; color: #60a5fa; cursor: pointer; user-select: none; flex-shrink: 0;
    }
    .help-link:hover { text-decoration: underline; color: #93c5fd; }
    .guide-box {
      display: none; background: #101522; border: 1px solid #2a3958; border-radius: 6px;
      padding: 6px 8px; font-size: 11px; color: #cbd5e1; line-height: 1.5; margin-top: 2px;
    }
    .guide-box.show { display: block; }
    .guide-box a { color: #60a5fa; text-decoration: none; }
    .guide-box a:hover { text-decoration: underline; }
    .guide-box strong { color: #f8fafc; }
    .feedback-footer {
      background: linear-gradient(145deg, #172036 0%, #131927 100%);
      border: 1px solid #2f4166; border-radius: 10px;
      padding: 10px 12px; font-size: 11.5px; color: #cbd5e1;
      transition: border-color 0.25s ease, box-shadow 0.25s ease;
    }
    .feedback-footer.collapsed {
      padding: 8px 12px;
    }
    .feedback-footer:not(.collapsed) .author-fold-hint {
      display: none;
    }
    .feedback-footer.feedback-flash {
      border-color: #fbbf24;
      box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.35), 0 8px 24px rgba(251, 191, 36, 0.18);
    }
    .feedback-title {
      font-size: 12px; font-weight: 700; color: #f8fafc;
    }
    .feedback-custom-tag {
      display: inline-block; width: fit-content;
      color: #fde68a; background: rgba(234, 179, 8, 0.16);
      border: 1px solid rgba(251, 191, 36, 0.45); border-radius: 999px;
      padding: 3px 10px; font-size: 11.5px; font-weight: 700;
    }
    .collapsible-head {
      cursor: pointer; user-select: none;
    }
    .collapsible-head:hover .sec-label { color: #bfdbfe; }
    .sec-head-left {
      display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;
    }
    .sec-chevron {
      display: inline-block; width: 12px; font-size: 11px; color: #64748b;
      transition: transform 0.15s ease; flex-shrink: 0;
    }
    .section.collapsed .sec-chevron { transform: rotate(-90deg); }
    .section.collapsed .sec-body { display: none !important; }
    .sec-body { display: flex; flex-direction: column; gap: 8px; }
    .sec-mini-badge {
      font-size: 10px; color: #94a3b8; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;
    }
    .summary-section {
      background: linear-gradient(180deg, #171f33 0%, #151b2a 100%);
      border: 1px solid #2e4066;
    }
    .engine-pill {
      font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px;
      background: #1e3a5f; color: #93c5fd; border: 1px solid #3b82f6; flex-shrink: 0;
    }
    .engine-pill.ai {
      background: #3b1d60; color: #e9d5ff; border-color: #a855f7;
    }
    .summary-report-body {
      background: #0e131e; border: 1px solid #24304a; border-radius: 8px;
      padding: 8px 10px; font-size: 11.5px; line-height: 1.55; color: #e2e8f0;
      white-space: pre-wrap; max-height: 220px; overflow-y: auto;
    }
    .summary-meta-row {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      font-size: 10.5px; color: #94a3b8;
    }
    .update-banner {
      display: none;
      align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(16, 185, 129, 0.16));
      border: 1px solid rgba(96, 165, 250, 0.55); border-radius: 10px;
      padding: 8px 11px; font-size: 11.5px; color: #e2e8f0;
    }
    .update-banner.show { display: flex; }
    .abnormal-search-row {
      display: flex; align-items: center; gap: 6px;
    }
    .abnormal-search-input {
      flex: 1; background: #0f1420; color: #f8fafc;
      border: 1px solid #2b3852; border-radius: 6px;
      padding: 4px 8px; font-size: 11px; outline: none;
    }
    .abnormal-search-input:focus { border-color: #4f7cff; }
    .kpi-sub.warn { color: #fbbf24; font-weight: 700; }
    .kpi-sub.low { color: #fca5a5; font-weight: 700; }
    .tip-q {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; border-radius: 50%; margin-left: 3px;
      font-size: 9.5px; font-weight: 700; color: #93c5fd;
      background: rgba(59, 130, 246, 0.16); border: 1px solid rgba(96, 165, 250, 0.4);
      cursor: help; vertical-align: middle; flex-shrink: 0;
    }
    .quick-view-box {
      background: #121826; border: 1px solid #26334d; border-radius: 8px;
      padding: 8px 9px; display: flex; flex-direction: column; gap: 6px;
    }
    .quick-view-row {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .quick-view-row select {
      width: auto; min-width: 88px; padding: 4px 6px; font-size: 11px;
    }
    .quick-view-notes {
      font-size: 10.5px; color: #94a3b8; line-height: 1.5;
    }
    .quick-view-notes strong { color: #cbd5e1; }
    .icon-btn.has-update {
      position: relative;
      color: #fef08a !important;
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(234, 88, 12, 0.34)) !important;
      border-color: rgba(251, 191, 36, 0.85) !important;
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.55);
      font-weight: 700;
    }
    .icon-btn.has-update::after {
      content: "";
      position: absolute;
      top: -3px;
      right: -3px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }
  `;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = `
    <div class="pill" id="pillBtn" title="点击展开面板 · 按住可拖动悬浮位置" style="cursor:grab;">
      <span class="dot" id="pillDot"></span>
      <span id="pillText">Kamisama: 未启动</span>
    </div>

    <div class="panel" id="panel">
      <div class="header" id="panelHeader" title="按住标题栏可拖动面板位置">
        <div class="title">
          <span class="dot" id="headerDot"></span>
          <span>Kamisama - 全链路千川</span>
          <span class="version-tag">v1.3.4</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" id="checkUpdateBtn" type="button" title="检查官网 kamisama.si 是否有新版本可更新">更新</button>
          <button class="icon-btn contact-btn" id="contactAuthorBtn" type="button" title="展开并跳转到底部联系作者区">联系作者</button>
          <button class="icon-btn" id="landscapeModeBtn" title="切换横屏宽版 / 竖屏窄版布局">竖屏</button>
          <button class="icon-btn" id="compactModeBtn" title="切换日常盯盘（简洁版）与参数配置界面">配置</button>
          <button class="icon-btn" id="collapseBtn">收起</button>
        </div>
      </div>

      <div class="body">
        <div class="update-banner" id="updateBanner">
          <span id="updateBannerText">正在检查最新版本...</span>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <a class="btn btn-primary btn-sm" id="updateDownloadLink" href="https://www.kamisama.si" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">下载新版</a>
            <button class="icon-btn" id="ignoreUpdateBtn" type="button" style="display:none;" title="忽略此版本提醒，直到下次发布更新版本">忽略此版</button>
            <button class="icon-btn" id="closeUpdateBannerBtn" type="button">关闭</button>
          </div>
        </div>
        <div class="status-card">
          <div>
            <div class="status-value" id="currentRoiValue">--</div>
            <div class="status-sub" id="currentStatusSub">配置上下限后点击开始监控</div>
          </div>
          <button class="btn btn-success" id="toggleMonitorBtn">开始监控</button>
        </div>

        <div class="view-switcher" id="viewSwitcher">
          <button class="view-tab active" id="viewDashboardBtn" type="button">📊 日常盯盘</button>
          <button class="view-tab" id="viewConfigBtn" type="button">⚙️ 参数配置</button>
        </div>

        <!-- 日常盯盘核心数据看板（整体 ROI / 整体消耗 / 可用余额 / 在投巡检） -->
        <div class="kpi-grid dashboard-only" id="dashboardKpiGrid">
          <div class="kpi-card">
            <div class="kpi-label"><span id="dashRoiLabel">整体 ROI</span><span id="dashRoiDelta"></span></div>
            <div class="kpi-value" id="dashRoiVal">--</div>
            <div class="kpi-sub" id="dashRoiSub">等待读取页面 ROI</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label"><span id="dashCostLabel">当前消耗</span><span id="dashCostDelta"></span></div>
            <div class="kpi-value" id="dashCostVal">--</div>
            <div class="kpi-sub" id="dashCostSub">自动识别整体/列表消耗</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label"><span id="dashBalanceLabel">可用余额</span><span id="dashBalanceTag">待读取</span></div>
            <div class="kpi-value" id="dashBalanceVal">--</div>
            <div class="kpi-sub" id="dashBalanceSub">低于预警线自动提醒充值</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label"><span>在投巡检</span><span id="dashHealthTag">待启动</span></div>
            <div class="kpi-value" id="dashPlanCount">--</div>
            <div class="kpi-sub" id="dashPlanBreakdown">跌破0 · 预算0 · 过保0 · 高ROI 0</div>
          </div>
        </div>

        <!-- 异常计划明细（默认严格按表格从上到下顺序排列，支持上一条/下一条、类型筛选与关键词检索） -->
        <div class="abnormal-box dashboard-only" id="abnormalBox">
          <div class="section-title">
            <span id="abnormalBoxTitle">异常/重点计划明细</span>
            <label class="check-row" style="font-size:11px;font-weight:500;">
              <input type="checkbox" id="highlightAbnormalRows">
              <span>表格高亮</span>
            </label>
          </div>
          <div class="abnormal-toolbar">
            <div class="mini-pills" id="abnormalFilterGroup" style="flex-wrap:wrap;">
              <span class="mini-pill active" data-filter="all" id="filterAllPill">全部</span>
              <span class="mini-pill low" data-filter="low" id="filterLowPill">跌破</span>
              <span class="mini-pill high" data-filter="high" id="filterHighPill">突破</span>
              <span class="mini-pill cost" data-filter="cost" id="filterCostPill">预算不足</span>
              <span class="mini-pill expired" data-filter="expired" id="filterExpiredPill">过保</span>
            </div>
            <span class="mini-pill" id="sortOrderToggle" title="切换按表格从上到下顺序 / 按极值排序">顺序：表格↑↓</span>
          </div>
          <div class="abnormal-search-row">
            <input type="text" class="abnormal-search-input" id="abnormalSearchInput" placeholder="检索计划名（如 保暖裤 / xs / 预算不足计划）...">
          </div>
          <div class="stepper-bar">
            <div class="stepper-btns">
              <button class="step-btn" id="prevAbnormalBtn">◀ 上一条</button>
              <button class="step-btn" id="nextAbnormalBtn">下一条 ▶</button>
            </div>
            <span class="step-pos" id="abnormalStepPos">未选中</span>
          </div>
          <div class="abnormal-list" id="abnormalList"></div>
        </div>

        <!-- 面板内直显：30分钟投流总结报告（有AI Key走豆包/DeepSeek等深度诊断，无Key走内置趋势规则引擎） -->
        <div class="section summary-section dashboard-only" data-sec="sec_summary" id="sec_summary">
          <div class="section-title collapsible-head" data-sec-toggle="sec_summary">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label">📊 投流总结报告</span>
              <span class="engine-pill" id="summaryEngineBadge">内置规则引擎</span>
            </span>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-ghost btn-sm" id="refreshSummaryPanelBtn" type="button" title="仅在面板内刷新总结，不发手机推送">刷新</button>
              <button class="btn btn-primary btn-sm" id="sendSummaryCardBtn" type="button" title="生成最新总结并推送到手机渠道">汇报推送</button>
              <button class="btn btn-ghost btn-sm" id="copySummaryBtn" type="button">复制</button>
            </div>
          </div>
          <div class="sec-body">
            <div class="summary-meta-row">
              <span id="summaryReportMeta">尚未生成总结，点「刷新」或在启动监控后每 30 分钟自动生成</span>
            </div>
            <div class="summary-report-body" id="summaryReportContent">点击右上角「刷新」即可生成当前页面的大盘走势预判、好计划放量建议、坏计划止损/补预算/灰保清单；若在下方「4. AI 投流大脑」填入豆包 / 智谱(免费) / DeepSeek Key，将自动切换为 AI 深度诊断。</div>
          </div>
        </div>

        <!-- 1~5 可独立折叠模块容器（横屏下展开卡片自动配对/铺满，折叠卡片紧凑归拢，零留白） -->
        <div class="sections-grid" id="sectionsGrid">
        <!-- 1. 监控对象（可独立折叠） -->
        <div class="section config-section" data-sec="sec_target" id="sec_target">
          <div class="section-title collapsible-head" data-sec-toggle="sec_target">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label">1. 监控对象（实时读取）</span>
            </span>
            <button class="btn btn-ghost btn-sm" id="copyDiagBtn" title="复制页面表格结构诊断JSON（不含Cookie/Token）">复制诊断</button>
          </div>
          <div class="sec-body">
            <div class="tabs">
              <div class="tab active" data-mode="both" id="tabBoth">整体 + 多计划</div>
              <div class="tab" data-mode="single" id="tabSingle">仅整体 ROI</div>
              <div class="tab" data-mode="table" id="tabTable">仅计划列表</div>
            </div>

            <div id="singleModeBox" style="display:flex;flex-direction:column;gap:8px;">
              <div class="row-between">
                <button class="btn btn-primary btn-sm" id="pickElementBtn">点选页面整体 ROI</button>
                <button class="btn btn-ghost btn-sm" id="autoFindRoiBtn">自动查找整体 ROI</button>
              </div>
              <div class="muted" id="selectorPreview">尚未绑定整体 ROI（可自动查找，或点左侧按钮直接点页面数字）</div>
            </div>

            <div id="tableModeBox" style="display:none;flex-direction:column;gap:8px;">
              <div class="grid-3">
                <label class="field" title="用于自动匹配千川表格中的 ROI 列名，多个关键词用逗号隔开，越靠前优先级越高"><span>ROI 列关键词<span class="tip-q">?</span></span>
                  <input type="text" id="roiHeaderKeyword" placeholder="ROI">
                </label>
                <label class="field" title="用于自动匹配千川表格中的消耗列名（如调控消耗、整体消耗）"><span>消耗列关键词<span class="tip-q">?</span></span>
                  <input type="text" id="costHeaderKeyword" placeholder="消耗">
                </label>
                <label class="field" title="用于自动匹配计划名/任务名/抖音号/商品名列，方便告警直指具体计划"><span>名称列关键词<span class="tip-q">?</span></span>
                  <input type="text" id="nameHeaderKeyword" placeholder="计划">
                </label>
              </div>
              <div class="grid-2">
                <label class="field" title="仅对消耗达到该金额的计划判断 ROI 跌破/突破，避免刚花几块钱的新计划误报（默认 20 元）"><span>最低消耗门槛(元)<span class="tip-q">?</span></span>
                  <input type="number" step="10" id="minCost" placeholder="20">
                </label>
                <label class="field" title="配合下方「定时点页内刷新」使用：开启后每隔多少秒自动点击一次千川页面自带的刷新按钮（建议 60~120 秒）"><span>自动点刷新间隔(秒)<span class="tip-q">?</span></span>
                  <input type="number" min="15" step="5" id="refreshIntervalSec" placeholder="60">
                </label>
              </div>
              <div class="row-between" style="flex-wrap:wrap;gap:6px;">
                <label class="check-row" title="只盯正在“投放中”的计划，自动忽略暂停、已结束、审核中计划">
                  <input type="checkbox" id="onlyDelivering">
                  <span>仅“投放中”<span class="tip-q">?</span></span>
                </label>
                <label class="check-row" title="在直播调控任务页中，只盯正在“调控中”的任务">
                  <input type="checkbox" id="onlyRegulating">
                  <span>仅“调控中”<span class="tip-q">?</span></span>
                </label>
                <label class="check-row" title="默认关闭，避免手动调出价时被自动刷新打断；离开工位挂机盯盘且页面不会自动跳数时再勾上，按间隔自动点击千川页内刷新按钮">
                  <input type="checkbox" id="autoClickRefresh">
                  <span>定时点页内刷新<span class="tip-q">?</span></span>
                </label>
              </div>
              <div class="quick-view-box">
                <div class="quick-view-row">
                  <button class="btn btn-primary btn-sm" id="sortCostDescBtn" type="button" title="自动点击千川表头「整体消耗 / 调控消耗」按从高到低排序，优先把花钱最多的计划排在前面盯盘">⬇ 消耗由高到低</button>
                  <button class="btn btn-ghost btn-sm" id="applyPageSizeBtn" type="button" title="自动把千川列表（投放页与调控页通用）切换为右侧选定的每页显示条数，一次展开更多计划免翻页">📄 切每页100条</button>
                  <select id="preferredPageSize" title="可自由切换千川每页展示条数（10 / 20 / 50 / 100 条），默认 100 条方便整页检索">
                    <option value="10">10 条/页</option>
                    <option value="20">20 条/页</option>
                    <option value="50">50 条/页</option>
                    <option value="100">100 条/页</option>
                  </select>
                </div>
                <label class="check-row" title="点击「开始监控」时自动执行一次消耗降序 + 切每页条数，投放与调控页通用">
                  <input type="checkbox" id="autoOptimizeViewOnStart">
                  <span>开始监控时自动：消耗降序 + 切为设定条数</span>
                </label>
                <div class="quick-view-notes">
                  <strong>⬇ 消耗由高到低</strong>：自动按消耗降序排列表格，先把最烧钱的计划排在前面盯盘。<br>
                  <strong>📄 切每页条数（默认100条）</strong>：自动把当前页条数改成 10/20/50/100 条（投放与调控页通用），减少翻页漏看。<br>
                  <span style="color:#fbbf24;">⚠️ 备注：勾选上方自动执行后，每次加载页面都会重新拉取数据，页面会刷新较久，请耐心等待（嫌慢可取消勾选或改选 20/50 条）。</span>
                </div>
              </div>
              <div class="muted" id="tableScanSummary">等待扫描页面表格...</div>
            </div>
          </div>
        </div>

        <!-- 2. ROI 阈值 · 预算 · 余额与汇报（可独立折叠） -->
        <div class="section config-section" data-sec="sec_rules" id="sec_rules">
          <div class="section-title collapsible-head" data-sec-toggle="sec_rules">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label">2. ROI 阈值 · 预算 · 余额与汇报</span>
            </span>
          </div>
          <div class="sec-body">
            <div class="grid-2">
              <label class="field" title="整体或单条计划 ROI 低于此值时标红，并触发跌破提醒（留空表示不设下限）"><span>ROI下限(跌破)<span class="tip-q">?</span></span>
                <input type="number" step="0.01" id="lowerLimit" placeholder="如 1.5">
              </label>
              <label class="field" title="整体或单条计划 ROI 高于此值时标橙，提醒关注爆量优质计划可加预算（留空表示不设上限）"><span>ROI上限(突破)<span class="tip-q">?</span></span>
                <input type="number" step="0.01" id="upperLimit" placeholder="如 4.0">
              </label>
            </div>
            <div class="grid-3">
              <label class="field" title="跌破下限后，同一计划在多少分钟内不重复推送提醒（刷新页面不会重置）"><span>跌破冷却(分)<span class="tip-q">?</span></span>
                <input type="number" min="1" step="5" id="lowCooldownMin" placeholder="30">
              </label>
              <label class="field" title="突破上限后，同一计划在多少分钟内不重复推送提醒（刷新页面不会重置）"><span>突破冷却(分)<span class="tip-q">?</span></span>
                <input type="number" min="1" step="5" id="highCooldownMin" placeholder="30">
              </label>
              <label class="field" title="计划预算告急或打满时最紧急，每隔几分钟催一次加预算（默认 3 分钟，加完预算自动停）"><span>预算急推(分)<span class="tip-q">?</span></span>
                <input type="number" min="1" step="1" id="costCooldownMin" placeholder="3">
              </label>
            </div>
            <div class="row-between" style="flex-wrap:wrap;gap:6px;margin-top:2px;">
              <label class="check-row" title="同一轮扫描如果有多条计划同时跌破/突破/预算不足，合并成 1 条摘要消息推到手机，彻底防刷屏轰炸">
                <input type="checkbox" id="mergeBatchAlerts">
                <span>多计划同轮合并推送（防刷屏）<span class="tip-q">?</span></span>
              </label>
              <label class="check-row" title="仅标黄状态列里灰色的「保」（已过赔付保障期），绿保与无保不标；若开启推送，每条计划当天只推 1 次">
                <input type="checkbox" id="markExpiredGuarantee">
                <span>黄色标记过保计划（仅灰保，当天仅推1次）<span class="tip-q">?</span></span>
              </label>
            </div>
            <div class="row-between" style="flex-wrap:wrap;gap:6px;margin-top:2px;">
              <label class="check-row" title="自动读取表格预算列或单计划上限，消耗快烧满时表格标紫并推手机提醒及时加预算">
                <input type="checkbox" id="costAlertEnabled">
                <span>计划预算提醒（快达预算提醒加预算）<span class="tip-q">?</span></span>
              </label>
              <label class="check-row" title="自动读取千川页面顶部「千川可用余额 / 可用余额」，低于下方预警线时提醒充值防断流">
                <input type="checkbox" id="balanceAlertEnabled">
                <span>千川可用余额提醒（快没余额提醒充值）<span class="tip-q">?</span></span>
              </label>
            </div>
            <div class="grid-3">
              <label class="field" title="单计划消耗达到预算的百分之多少时开始预警（默认 80% 提醒，100% 标已满）"><span>预算预警比例(%)<span class="tip-q">?</span></span>
                <input type="number" min="10" max="100" step="5" id="budgetWarnPercent" placeholder="80">
              </label>
              <label class="field" title="顶部千川可用余额低于此金额时，看板红字提示并推手机提醒记得充值（默认 1000 元）"><span>余额预警线(元)<span class="tip-q">?</span></span>
                <input type="number" min="0" step="100" id="balanceWarnThreshold" placeholder="1000">
              </label>
              <label class="field" title="留空则自动读每条计划自己的日预算/调控预算；填写后会按统一单计划金额预警"><span>单计划上限(元)<span class="tip-q">?</span></span>
                <input type="number" min="0" step="50" id="singleCostLimit" placeholder="留空读预算">
              </label>
            </div>
            <div class="grid-2">
              <label class="field" title="可选：设置全店/当前视图的今日整体消耗预警上限，留空则不限制"><span>整体消耗上限(元)<span class="tip-q">?</span></span>
                <input type="number" min="0" step="100" id="overallCostLimit" placeholder="留空不限">
              </label>
              <div class="muted" id="balanceStatusHint" style="align-self:end;padding-bottom:6px;">可用余额：等待读取顶部千川余额</div>
            </div>
            <div class="muted" id="overallCostStatus">预算提醒：自动监测表格预算（设整体上限可同步盯全店消耗）</div>
            <div class="row-between" style="flex-wrap:wrap;gap:6px;margin-top:2px;">
              <label class="check-row" title="定时自动汇总大盘走势、优质好计划与异常坏计划并推送手机（不接AI用内置逻辑，接AI出深度建议）">
                <input type="checkbox" id="summaryReportEnabled">
                <span>定时投流总结报告<span class="tip-q">?</span></span>
              </label>
              <div style="display:flex;align-items:center;gap:5px;">
                <input type="number" min="5" step="5" id="summaryIntervalMin" placeholder="30" style="width:58px;padding:4px 6px;" title="定时发送投流总结报告的间隔分钟数">
                <span class="muted">分钟/次</span>
                <button class="btn btn-ghost btn-sm" id="sendSummaryNowBtn" type="button">立即汇报</button>
              </div>
            </div>
            <div class="muted" id="summaryNextHint">投流总结：启动监控后每 30 分钟自动推送一次</div>
            <div class="grid-2">
              <label class="check-row" title="监测千川掉登录、页面报错或长时间数据不更新卡死，及时推手机避免挂机失效">
                <input type="checkbox" id="anomalyAlertEnabled">
                <span>登录失效/报错/断流提醒<span class="tip-q">?</span></span>
              </label>
              <label class="field" title="超过多少分钟页面消耗与 ROI 纹丝不动时判定为卡死断流并提醒（填 0 关闭）"><span>数据无更新断流(分,0关)<span class="tip-q">?</span></span>
                <input type="number" min="0" step="1" id="staleMinutes" placeholder="15">
              </label>
            </div>
            <div class="health-bar" id="healthStatusBox">页面健康：等待启动监控</div>
            <div class="row-between">
              <label class="check-row">
                <input type="checkbox" id="desktopEnabled">
                <span>桌面弹窗通知</span>
              </label>
              <label class="check-row">
                <input type="checkbox" id="soundEnabled">
                <span>告警提示音</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 3. 5大推送渠道（可独立折叠，配好即可收起） -->
        <div class="section config-section" data-sec="sec_push" id="sec_push">
          <div class="section-title collapsible-head" data-sec-toggle="sec_push">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label">3. 5大推送渠道（配好可点此折叠）</span>
            </span>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-ghost btn-sm" id="toggleAllGuideBtn" title="展开/收起全部5个渠道的配置连接步骤">教程?</button>
              <button class="btn btn-primary btn-sm" id="savePushBtn">保存</button>
              <button class="btn btn-ghost btn-sm" id="testPushBtn">测试</button>
            </div>
          </div>
          <div class="sec-body">
            <div class="save-status" id="pushSaveStatus">正在读取已保存的推送配置...</div>
            <div class="guide-box" id="guide_desktop">
              <strong>① 桌面弹窗 + 提示音配置：</strong><br>
              1. 勾选上方第 2 区的 <strong>桌面弹窗通知</strong> 与 <strong>告警提示音</strong>。<br>
              2. 若未弹窗，请确认系统通知中已允许 <strong>Google Chrome</strong> 发送通知（Windows 通知设置 / Mac 系统设置→通知）。<br>
              3. 首次打开页面请先点击页面任意位置，以激活浏览器告警提示音。
            </div>
            <div class="row-between" style="flex-wrap:wrap;gap:6px;padding:2px 0;">
              <label class="check-row">
                <input type="checkbox" id="pushOnLow">
                <span>跌破提醒</span>
              </label>
              <label class="check-row">
                <input type="checkbox" id="pushOnHigh">
                <span>突破提醒</span>
              </label>
              <label class="check-row">
                <input type="checkbox" id="pushOnCost">
                <span>预算提醒</span>
              </label>
              <label class="check-row">
                <input type="checkbox" id="pushOnExpired">
                <span>过保提醒</span>
              </label>
            </div>
            <label class="field">
              <span class="field-head">
                <span>② 企业微信群机器人 Webhook（推荐：免费不限量）</span>
                <span class="help-link" data-guide="guide_wecom">怎么获取?</span>
              </span>
              <input type="text" id="wecomWebhook" list="list_wecomWebhook" autocomplete="off" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...">
              <div class="guide-box" id="guide_wecom">
                1. 在企业微信建一个群（可仅自己 1 人）→ 群右上角 <strong>··· → 群机器人 → 添加机器人</strong>。<br>
                2. 复制生成的 <strong>Webhook 地址</strong> 粘到上方，点「测试」。<br>
                3. <strong>个人微信直收</strong>：手机微信关注企业微信「微信插件」并打开消息提醒即可。
              </div>
              <datalist id="list_wecomWebhook"></datalist>
              <div class="history-chips" id="chips_wecomWebhook"></div>
            </label>
            <label class="field">企微 @手机号（可选，填 @all 则提醒所有人，多个用逗号隔开）
              <input type="text" id="wecomMobiles" list="list_wecomMobiles" autocomplete="off" placeholder="如 13800138000 或 @all">
              <datalist id="list_wecomMobiles"></datalist>
              <div class="history-chips" id="chips_wecomMobiles"></div>
            </label>
            <label class="field">
              <span class="field-head">
                <span>③ PushPlus Token（直达个人微信，200条/天，需实名）</span>
                <span class="help-link" data-guide="guide_pushplus">怎么获取?</span>
              </span>
              <div class="input-with-btn">
                <input type="password" id="pushplusToken" list="list_pushplusToken" autocomplete="off" placeholder="粘贴 PushPlus token">
                <button class="btn btn-ghost btn-sm" id="togglePushplusVisBtn" type="button" title="显示或隐藏 Token">显示</button>
              </div>
              <div class="guide-box" id="guide_pushplus">
                1. 打开 <a href="https://www.pushplus.plus/" target="_blank" rel="noopener">pushplus.plus</a>，用微信扫码登录并关注服务号（按指引完成实名）。<br>
                2. 进入「一对一消息 / 发送消息」页面，复制你的 <strong>token</strong> 粘贴到上方。<br>
                3. 点击右上角「保存」与「测试」，个人微信服务号会立刻收到测试通知。
              </div>
              <datalist id="list_pushplusToken"></datalist>
              <div class="history-chips" id="chips_pushplusToken"></div>
            </label>
            <label class="field">
              <span class="field-head">
                <span>④ 飞书 / 钉钉群机器人 Webhook（可选）</span>
                <span class="help-link" data-guide="guide_custom">怎么获取?</span>
              </span>
              <input type="text" id="customWebhook" list="list_customWebhook" autocomplete="off" placeholder="https://open.feishu.cn/... 或 https://oapi.dingtalk.com/...">
              <div class="guide-box" id="guide_custom">
                <strong>飞书</strong>：群右上角 <strong>··· → 设置 → 群机器人 → 添加自定义机器人</strong>，复制 Webhook 粘贴。<br>
                <strong>钉钉</strong>：群设置 → <strong>智能群助手 → 添加自定义机器人</strong> → 安全设置选<strong>自定义关键词</strong>，填入 <code>ROI</code>（或同时加 <code>预算</code>、<code>千川</code>），复制 Webhook 粘贴（暂不支持加签模式）。
              </div>
              <datalist id="list_customWebhook"></datalist>
              <div class="history-chips" id="chips_customWebhook"></div>
            </label>
            <label class="field">
              <span class="field-head">
                <span>⑤ Bark 推送地址（仅 iPhone，免费不限量，可选）</span>
                <span class="help-link" data-guide="guide_bark">怎么获取?</span>
              </span>
              <input type="text" id="barkUrl" list="list_barkUrl" autocomplete="off" placeholder="https://api.day.app/你的Key">
              <div class="guide-box" id="guide_bark">
                1. iPhone 在 App Store 搜索并安装免费软件 <strong>Bark</strong> 并开启通知权限。<br>
                2. 直接点首页示例下方的<strong>「复制」</strong>按钮粘到上方即可（整段 <code>curl</code>、带 <code>/title/body</code> 的链接或纯 Key，插件都会自动提纯为 <code>https://api.day.app/你的Key</code>）。
              </div>
              <datalist id="list_barkUrl"></datalist>
              <div class="history-chips" id="chips_barkUrl"></div>
            </label>
          </div>
        </div>

        <!-- 4. AI 投流大脑（可选：接入豆包/智谱免费/DeepSeek/通义，未填自动用内置规则引擎） -->
        <div class="section config-section" data-sec="sec_ai" id="sec_ai">
          <div class="section-title collapsible-head" data-sec-toggle="sec_ai">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label">4. AI 投流大脑（可选：豆包/智谱/DeepSeek）</span>
            </span>
            <span class="help-link" data-guide="guide_ai">怎么免费获取?</span>
          </div>
          <div class="sec-body">
            <div class="muted">填写 API Key 后，30 分钟总结自动调用 AI 做趋势预判与调优建议；留空则自动使用内置千川趋势规则引擎。</div>
            <div class="guide-box" id="guide_ai">
              <strong>豆包（火山方舟，推荐）</strong>：打开 <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener">火山方舟控制台</a> → 开通模型（新户送免费额度）→ 创建 API Key 粘贴到下方，模型填模型 ID 或推理接入点 <code>ep-xxxx</code>。<br>
              <strong>智谱清言（永久免费模型）</strong>：打开 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener">open.bigmodel.cn</a> → 注册领 API Key，模型选 <code>glm-4-flash</code> 即可免费调用。<br>
              <strong>DeepSeek / 通义 / 硅基流动</strong>：各自开放平台申请 API Key，选对应厂商即可自动填好接口地址。
            </div>
            <div class="grid-2">
              <label class="field">大模型厂商
                <select id="aiProvider">
                  <option value="doubao">豆包（火山方舟）</option>
                  <option value="zhipu">智谱清言（GLM-4-Flash 免费）</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="qwen">通义千问（百炼）</option>
                  <option value="siliconflow">硅基流动（含免费模型）</option>
                  <option value="custom">自定义 OpenAI 兼容接口</option>
                </select>
              </label>
              <label class="field">模型 ID / 接入点
                <input type="text" id="aiModel" autocomplete="off" placeholder="如 doubao-1-5-pro-32k-250115">
              </label>
            </div>
            <label class="field">AI API Key（三层持久化记住，刷新不丢）
              <div class="input-with-btn">
                <input type="password" id="aiApiKey" autocomplete="off" placeholder="留空则使用内置千川趋势规则引擎">
                <button class="btn btn-ghost btn-sm" id="toggleAiKeyVisBtn" type="button">显示</button>
              </div>
            </label>
            <label class="field">接口地址（选厂商自动填充，自定义可修改）
              <input type="text" id="aiEndpoint" autocomplete="off" placeholder="https://ark.cn-beijing.volces.com/api/v3/chat/completions">
            </label>
          </div>
        </div>

        <!-- 5. 实时告警记录（可独立折叠） -->
        <div class="section logs-section dashboard-only" data-sec="sec_logs" id="sec_logs">
          <div class="section-title collapsible-head" data-sec-toggle="sec_logs">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label">5. 实时告警记录</span>
            </span>
            <button class="btn btn-ghost btn-sm" id="clearLogsBtn" title="清空当前记录并重置推送冷却">清空</button>
          </div>
          <div class="sec-body">
            <div class="logs" id="logsContainer">
              <div class="muted">暂无告警记录</div>
            </div>
          </div>
        </div>
        </div><!-- /sectionsGrid -->

        <div class="config-done-bar config-only">
          <button class="btn btn-primary config-done-btn" id="finishConfigBtn" type="button">✅ 配置完成，返回日常盯盘</button>
        </div>

        <!-- 底部联系作者区（默认折叠，点击顶栏「联系作者」或本栏标题展开；点微信号弹出二维码） -->
        <div class="section feedback-footer collapsed" data-sec="sec_author" id="feedbackFooter">
          <div class="section-title collapsible-head" data-sec-toggle="sec_author">
            <span class="sec-head-left">
              <span class="sec-chevron">▾</span>
              <span class="sec-label feedback-title">💬 联系作者 · 内测反馈 / 提建议</span>
            </span>
            <span class="muted author-fold-hint">点击展开</span>
          </div>
          <div class="sec-body">
            <div class="author-info">
              <div class="author-wx-row">
                <span>作者微信：</span>
                <span class="wechat-highlight-id" id="footerWechatId" title="点击弹出微信二维码">OliverRockwell</span>
                <button class="btn btn-primary btn-sm" id="copyWechatBtn" type="button">复制微信号</button>
                <span class="muted">（点微信号弹二维码）</span>
              </div>
              <div class="author-wx-row">
                <span>个人主页：</span>
                <a class="author-home-link" id="authorHomeLink" href="https://www.kamisama.si" target="_blank" rel="noopener noreferrer">www.kamisama.si</a>
              </div>
              <span class="feedback-custom-tag">有什么需求也可以找我聊</span>
              <div class="muted">欢迎反馈使用问题、提新功能建议，或交流 AI 素材；有什么需求和反馈，社恐不想加微信也可以去我的主页留言。</div>
            </div>
          </div>
        </div>
      </div>
      <div class="toast" id="toastBox"></div>
    </div>

    <!-- 点击微信号后弹出的二维码弹窗 -->
    <div class="qr-modal-backdrop" id="wechatQrModal" aria-hidden="true">
      <div class="qr-modal-card" id="wechatQrModalCard">
        <div class="qr-modal-head">
          <span>💬 作者微信二维码</span>
          <button class="icon-btn" id="closeWechatQrBtn" type="button">关闭</button>
        </div>
        <div class="author-qr-wrap">
          <img class="author-qr-img" id="authorQrImg" alt="作者微信二维码">
          <div class="author-qr-tip">微信扫一扫添加好友</div>
        </div>
        <div class="muted">微信号：<strong style="color:#f8fafc;">OliverRockwell</strong></div>
        <div class="qr-modal-actions">
          <button class="btn btn-primary btn-sm" id="modalCopyWechatBtn" type="button">复制微信号</button>
          <a class="btn btn-ghost btn-sm" href="https://www.kamisama.si" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">去主页留言</a>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(root);
  document.documentElement.appendChild(host);

  // 高亮框（放在主文档用于点选元素）
  const pickerHighlight = document.createElement("div");
  pickerHighlight.style.cssText =
    "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #3b82f6;background:rgba(59,130,246,0.16);border-radius:4px;display:none;transition:all 0.05s ease;";
  document.documentElement.appendChild(pickerHighlight);

  const $ = (id) => shadow.getElementById(id);

  // ---------- 工具函数 ----------
  function showToast(msg, duration = 3500) {
    const box = $("toastBox");
    box.textContent = msg;
    box.classList.add("show");
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove("show"), duration);
  }

  function normalizeText(str) {
    return String(str || "").replace(/\s+/g, " ").trim();
  }

  // 智能解析数值：优先取多行单元格首行（如 "2.81\n基础 2.81"），支持 万/w/亿/千 单位，排除 "-" 和纯百分比涨跌幅
  function parseMetricNumber(rawText, options = {}) {
    const { rejectPercent = true } = options;
    if (rawText === null || rawText === undefined) return null;
    const lines = String(rawText)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;

    const primary = lines[0];
    if (/^[-—–]+$/.test(primary) || /^(暂无|无|N\/A|null|undefined)$/i.test(primary)) {
      return null;
    }

    const cleaned = primary.replace(/[,，\s￥¥元]/g, "");
    const match = cleaned.match(/(-?\d+(?:\.\d+)?)(亿|万|w|W|千|k|K)?(%?)/);
    if (!match) return null;
    if (rejectPercent && match[3] === "%" && !match[2]) {
      return null;
    }

    let val = Number(match[1]);
    if (!Number.isFinite(val)) return null;

    const unit = match[2] || "";
    if (unit === "亿") val *= 1e8;
    else if (unit === "万" || unit === "w" || unit === "W") val *= 1e4;
    else if (unit === "千" || unit === "k" || unit === "K") val *= 1e3;

    return Math.round(val * 10000) / 10000;
  }

  function formatCostDisplay(costVal) {
    if (costVal === null || costVal === undefined) return "--";
    if (costVal >= 1e8) {
      return `¥${(costVal / 1e8).toFixed(2)}亿`;
    }
    if (costVal >= 10000) {
      return `¥${(costVal / 10000).toFixed(2)}万 (${costVal.toFixed(0)}元)`;
    }
    return `¥${Math.round(costVal * 100) / 100}`;
  }

  function formatCompactCost(costVal) {
    if (costVal === null || costVal === undefined || !Number.isFinite(costVal)) return "--";
    if (costVal >= 1e8) return `¥${(costVal / 1e8).toFixed(2)}亿`;
    if (costVal >= 10000) return `¥${(costVal / 10000).toFixed(2)}万`;
    return `¥${Math.round(costVal).toLocaleString("zh-CN")}`;
  }

  function formatTime(date = new Date()) {
    return date.toTimeString().slice(0, 8);
  }

  function playBeep(direction = "low") {
    if (!config.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const freqs =
        direction === "low" || direction === "error"
          ? [520, 390, 520]
          : direction === "warn"
            ? [600, 480]
            : [740, 960];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.14, ctx.currentTime + idx * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.16 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.16);
        osc.stop(ctx.currentTime + idx * 0.16 + 0.15);
      });
    } catch {
      // 浏览器未交互前可能阻止音频，静默忽略
    }
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (host.contains(el)) return false;
    const styleObj = window.getComputedStyle(el);
    if (styleObj.display === "none" || styleObj.visibility === "hidden" || styleObj.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function buildUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && /^[A-Za-z][\w-]*$/.test(cur.id)) {
        parts.unshift(`#${CSS.escape(cur.id)}`);
        break;
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function splitKeywords(raw, fallback) {
    const list = String(raw || "")
      .split(/[,，|｜/]+/)
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, ""))
      .filter(Boolean);
    return list.length > 0 ? list : [fallback.toLowerCase()];
  }

  function getPageBindingKey() {
    return `${location.origin}${location.pathname}`;
  }

  function getActivePageBinding() {
    const key = getPageBindingKey();
    const map = config.pageBindings && typeof config.pageBindings === "object" ? config.pageBindings : {};
    if (map[key] && map[key].selector) {
      return map[key];
    }
    // 仅在尚未建立任何按页绑定时兼容旧版全局 selector，防止 /overall-prom 的选择器串到 /overall-prom/detail 等无指标卡页面
    if (Object.keys(map).length === 0 && config.selector) {
      return { selector: config.selector, label: config.selectorLabel || "" };
    }
    return { selector: "", label: "" };
  }

  function setActivePageBinding(selector, label) {
    const key = getPageBindingKey();
    if (!config.pageBindings || typeof config.pageBindings !== "object") {
      config.pageBindings = {};
    }
    config.pageBindings[key] = { selector, label };
    config.selector = selector;
    config.selectorLabel = label;
    saveConfig();
    renderSelectorPreview();
  }

  // 读取元素数值文本：兼容千川全域/千川乘方 Aurora 等将整数与小数拆分为多个 span/div 的指标卡，并剔除同容器内的 % 涨跌幅
  function readElementMetricText(el) {
    if (!el) return "";
    if (
      el.matches?.(".oc-promotion-metric-card-number") ||
      el.querySelector?.(".oc-promotion-metric-card-number-val, .oc-promotion-metric-card-number-tail, .oc-typography-value-slot")
    ) {
      return String(el.textContent || "").replace(/\s+/g, "");
    }

    const compact = String(el.textContent || "").replace(/[\s,，￥¥]/g, "");
    if (/^-?\d+(?:\.\d+)?$/.test(compact)) {
      return compact;
    }

    // 兼容千川乘方 Aurora 指标卡（如 "11.02\n-3.08%"）及整数 + 小数 + 涨跌幅同容器布局
    const innerLines = String(el.innerText || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (innerLines.length >= 2 && /%/.test(innerLines[innerLines.length - 1])) {
      const firstLineClean = innerLines[0].replace(/[\s,，￥¥]/g, "");
      if (/^-?\d+(?:\.\d+)?$/.test(firstLineClean)) {
        return firstLineClean;
      }
    }

    if (el.childNodes && el.childNodes.length >= 2 && el.childNodes.length <= 10) {
      let acc = "";
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 1 && !isVisible(child)) continue;
        if (child.nodeType === 1) {
          const cls = typeof child.className === "string" ? child.className : "";
          if (/(trend|rate|ratio|percent|compare|comparison|diff|change|sub)/i.test(cls) && acc) {
            break;
          }
        }
        const part = String(child.textContent || "").replace(/\s+/g, "");
        if (!part) continue;
        if (/%/.test(part) || /[^\d.,，￥¥-]/.test(part)) {
          if (acc) break;
          continue;
        }
        const candidate = (acc + part).replace(/[,，￥¥]/g, "");
        if (/^-?\d*\.?\d*$/.test(candidate)) {
          acc += part;
        } else if (acc) {
          break;
        }
      }
      const cleanedAcc = acc.replace(/[,，￥¥]/g, "");
      if (/^-?\d+(?:\.\d+)?$/.test(cleanedAcc)) {
        return cleanedAcc;
      }
    }

    return String(el.innerText || el.textContent || "");
  }

  // 智能列头匹配：支持逗号分隔多关键词（按顺序优先），自动避开“目标ROI/出价ROI”和“计划状态”等干扰列
  function findBestColumnIndex(headers, rawKeyword, type) {
    const fallback = type === "roi" ? "roi" : type === "cost" ? "消耗" : type === "status" ? "状态" : "计划";
    const keywords = splitKeywords(rawKeyword, fallback);
    const userWantsExcludedRoi = keywords.some((k) => ROI_EXCLUDE_RE.test(k));
    const userWantsExcludedCost = keywords.some((k) => COST_EXCLUDE_RE.test(k));
    const userWantsExcludedName = keywords.some((k) => NAME_EXCLUDE_RE.test(k));

    let bestIdx = -1;
    let bestScore = -1;

    headers.forEach((rawHeader, idx) => {
      const h = normalizeText(rawHeader);
      if (!h) return;
      const compact = h.toLowerCase().replace(/\s+/g, "");
      const pure = compact.replace(/[（(][^）)]*[）)]/g, "");

      const matchedKwIdx = keywords.findIndex((kw) => compact.includes(kw));
      if (matchedKwIdx === -1) return;
      const matchedKw = keywords[matchedKwIdx];

      if (type === "roi" && !userWantsExcludedRoi && ROI_EXCLUDE_RE.test(compact)) {
        return;
      }
      if (type === "cost" && !userWantsExcludedCost && COST_EXCLUDE_RE.test(compact)) {
        return;
      }
      if (type === "name" && !userWantsExcludedName && NAME_EXCLUDE_RE.test(compact)) {
        return;
      }

      // 关键词列表中越靠前的优先级越高
      let score = 10 + Math.max(0, (keywords.length - matchedKwIdx) * 30);
      if (pure === matchedKw || compact === matchedKw) score += 100;

      if (type === "roi") {
        if (/调控综合营销roi|综合营销roi|整体支付roi/.test(pure)) score += 90;
        else if (/直接支付roi|直播间支付roi|直播间成交roi|调控净成交roi/.test(pure)) score += 75;
        else if (/支付roi|成交roi|全场roi/.test(pure)) score += 55;
        else if (ROI_PREFER_RE.test(pure)) score += 30;
      } else if (type === "cost") {
        if (/调控消耗|整体消耗|总消耗|消耗/.test(pure)) score += 50;
      } else if (type === "name") {
        if (/^(计划|计划名称|任务名称|调控任务|抖音号|广告计划|推广计划|商品信息|商品|商品名称|直播间|名称)$/.test(pure)) score += 70;
        else if (/名称|信息|任务/.test(pure)) score += 40;
      } else if (type === "status") {
        if (/^(调控状态|计划状态|投放状态|商品状态|状态)$/.test(pure)) score += 80;
      } else if (type === "budget") {
        if (/^(调控预算|每日预算|日预算|计划预算|预算)$/.test(pure)) score += 80;
      } else if (type === "settings") {
        if (/^(投放设置|商品推广设置|推广设置|设置)$/.test(pure)) score += 80;
      }

      if (compact.length > 20) score -= 25;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    return bestIdx;
  }

  function isIgnoredTableRow(rowEl, firstCellsText = []) {
    if (!rowEl || rowEl.nodeType !== 1) return true;
    if (rowEl.closest("thead, tfoot")) return true;
    if (rowEl.getAttribute("aria-hidden") === "true") return true;

    const cls = typeof rowEl.className === "string" ? rowEl.className : "";
    if (SUMMARY_ROW_CLASS_RE.test(cls)) return true;

    const rect = rowEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 1) return true;

    const samples = firstCellsText.length > 0
      ? firstCellsText
      : [normalizeText(rowEl.innerText || rowEl.textContent || "").slice(0, 60)];

    // 仅检查首个非空单元格，避免第 3 列「素材：共10条视频」等正常业务字段被误判为汇总行
    const firstNonEmpty = samples.map((s) => normalizeText(s)).find(Boolean) || "";
    if (firstNonEmpty && SUMMARY_ROW_TEXT_RE.test(firstNonEmpty)) {
      return true;
    }
    return false;
  }

  function extractPlanIdentity(nameCell, rowEl, fallbackIndex) {
    const rawText = String(nameCell?.innerText || nameCell?.textContent || "");
    const idMatch = rawText.match(/ID[:：\s]*(\d{6,})/i);
    const rowKeyAttr =
      rowEl?.getAttribute?.("data-row-key") ||
      rowEl?.getAttribute?.("data-key") ||
      rowEl?.dataset?.rowKey ||
      "";
    const planId = idMatch ? idMatch[1] : rowKeyAttr;

    // 优先匹配千川全域推商品/直播间/乘方商品视图专用名称节点（干净排除“扶持中/商品自选/ID/商品/素材/升级乘方”等角标）
    let candidateName = "";
    if (nameCell && nameCell.querySelector) {
      const titleEl = nameCell.querySelector(
        ".oc-promotion-product-adinfo-name, .oc-promotion-live-adinfo-pointer, [class*='adinfo-name'], [class^='name-'], [class*=' name-'], a[title], [class*='plan-name'], [class*='campaign-name'], [class*='name'][title], [class*='title'][title], a"
      );
      if (titleEl) {
        const t = normalizeText(titleEl.getAttribute("title") || titleEl.innerText || titleEl.textContent);
        if (
          t &&
          t.length >= 2 &&
          !/^(扶持中|冷启动中|学习中|商品自选|推商品|推直播间|商品卡|商品|素材|编辑|详情|升级乘方|ID[:：])/i.test(t)
        ) {
          candidateName = t;
        }
      }
    }

    if (!candidateName) {
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .filter(
          (l) =>
            !/^ID[:：\s]*\d+/i.test(l) &&
            !/^\d+$/.test(l) &&
            !/^(扶持中|冷启动中|学习中|赔付保障中|保|商品卡|推商品|推直播间|商品|直播|图文|视频|素材|素材\d+|投放中|已暂停|待投放|升级乘方.*)$/i.test(
              l
            )
        );
      if (lines.length > 0) {
        candidateName = lines[0].replace(/^(扶持中|商品卡|推商品|全站推广|全域推广|图文|视频)\s+/i, "");
      }
    }

    const cleanName =
      normalizeText(candidateName || rawText)
        .replace(/\s*ID[:：\s]*\d+.*$/i, "")
        .trim()
        .slice(0, 38) || `计划#${fallbackIndex + 1}`;
    const uniqueKey = planId ? `id:${planId}` : `name:${cleanName}`;
    return { id: uniqueKey, planId, name: cleanName };
  }

  function extractPlanStatus(statusCell) {
    if (!statusCell) return "";
    const lines = String(statusCell.innerText || statusCell.textContent || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return lines[0] || "";
  }

  function parseCssColorRgb(colorStr) {
    if (!colorStr || colorStr === "transparent" || colorStr === "none") return null;
    const s = String(colorStr).trim();
    const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (rgbMatch) {
      const a = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1;
      if (a <= 0.05) return null;
      return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
    }
    const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      let h = hexMatch[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    return null;
  }

  // 绿保（传统赔付保障中）或 蓝保（千川乘方/新版盾牌✓赔付保障中）均属于未过保的有效保障色
  function isCssProtectedColor(colorStr) {
    const c = parseCssColorRgb(colorStr);
    if (!c) return false;
    const { r, g, b } = c;
    const isGreen = g > r + 15 && g > b + 10 && g >= 95;
    const isBlue = b > r + 25 && b > g + 10 && b >= 120;
    return isGreen || isBlue;
  }

  // 识别状态单元格里的「保」赔付保障状态：
  // "protected" = 蓝保 / 绿保（赔付保障中，未过保）
  // "expired"   = 灰保（纯灰色，已过保）或文字明确提示已过保/保障已结束
  // "none"      = 无「保」徽标
  function extractGuaranteeState(statusCell) {
    if (!statusCell) return "unknown";
    const fullText = normalizeText(statusCell.innerText || statusCell.textContent);
    if (/(已过保|保障已结束|赔付已结束|保障失效|不保障)/.test(fullText)) {
      return "expired";
    }
    const candidates = Array.from(statusCell.querySelectorAll("span, div, i, em, b, svg, [class*='tag'], [class*='badge'], [class*='compensat'], [class*='guarantee'], [class*='protect'], [class*='insur']"));
    const baoNodes = candidates.filter((el) => {
      if (!isVisible(el)) return false;
      const t = normalizeText(el.innerText || el.textContent);
      const title = normalizeText(el.getAttribute("title") || el.getAttribute("aria-label"));
      const cls = typeof el.className === "string" ? el.className : "";
      const hasBaoText = (t === "保" || (t.length <= 8 && /保/.test(t) && !/保护|保存|保证金/.test(t)));
      const hasBaoHint = /赔付|保障/.test(title) || /(compensat|guarantee|baozhang|protect)/i.test(cls);
      return hasBaoText || hasBaoHint;
    });

    if (baoNodes.length === 0) {
      return "none";
    }

    // 任意一个「保」节点或其包裹容器/SVG 路径呈蓝色或绿色，即判定为「保障中（蓝保/绿保）」
    for (const node of baoNodes) {
      const parentEl = node.parentElement;
      const checkChain = [
        node,
        parentEl,
        ...Array.from(node.querySelectorAll("svg, path, rect, circle, polygon")).slice(0, 8),
        ...(parentEl ? Array.from(parentEl.querySelectorAll("svg, path, rect, circle, polygon")).slice(0, 8) : []),
      ].filter(Boolean);
      for (const el of checkChain) {
        const cls = typeof el.className === "string" ? el.className : "";
        if (
          /(success|green|primary|blue|info|active-guarantee|in-guarantee|protecting)/i.test(cls) &&
          !/(gray|grey|disabled|expired|inactive)/i.test(cls)
        ) {
          return "protected";
        }
        const attrFill = el.getAttribute?.("fill");
        const attrStroke = el.getAttribute?.("stroke");
        if (isCssProtectedColor(attrFill) || isCssProtectedColor(attrStroke)) {
          return "protected";
        }
        try {
          const st = window.getComputedStyle(el);
          if (
            isCssProtectedColor(st.color) ||
            isCssProtectedColor(st.backgroundColor) ||
            isCssProtectedColor(st.borderColor) ||
            isCssProtectedColor(st.fill) ||
            isCssProtectedColor(st.stroke)
          ) {
            return "protected";
          }
        } catch {
          // ignore
        }
      }
    }

    // 存在「保」图标但既非蓝保也非绿保（即纯灰色「保」），判定为明确过保
    return "expired";
  }

  // 自动提取单条计划/调控任务的预算金额（优先独立「调控预算/每日预算」列，其次从「投放设置」提取 "每日预算 3000元"）
  function extractBudgetFromRow(budgetCell, settingsCell) {
    if (budgetCell) {
      const txt = normalizeText(budgetCell.innerText || budgetCell.textContent);
      if (txt && !/不限/.test(txt)) {
        const val = parseMetricNumber(txt);
        if (val !== null && val > 0) return val;
      }
    }
    if (settingsCell) {
      const raw = String(settingsCell.innerText || settingsCell.textContent || "");
      const m = raw.match(/(?:每日预算|日预算|调控预算|总预算|预算)\s*[:：¥￥]?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(亿|万|w|W|千|k|K)?/);
      if (m) {
        let val = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(val) && val > 0) {
          const u = m[2] || "";
          if (u === "亿") val *= 1e8;
          else if (u === "万" || u === "w" || u === "W") val *= 1e4;
          else if (u === "千" || u === "k" || u === "K") val *= 1e3;
          return Math.round(val * 100) / 100;
        }
      }
    }
    return null;
  }

  // 自动查找页面顶部「千川可用余额 / 账户余额」（用于看板直显 + 余额不足提醒充值）
  function autoFindAccountBalanceElement() {
    const BALANCE_LABEL_RE = /(千川可用余额|账户可用余额|可用余额|账户余额|千川余额|余额\s*[\(（]元[\)）])/;
    const BALANCE_EXCLUDE_RE = /(冻结|不可用|消返|红包|赠款|授信|昨日|总充值|待入账|退回)/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    const labelHits = [];
    while ((node = walker.nextNode())) {
      const txt = normalizeText(node.textContent);
      if (!txt || txt.length > 44 || !BALANCE_LABEL_RE.test(txt) || BALANCE_EXCLUDE_RE.test(txt)) continue;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      if (parent.closest("table, thead, tbody, [role='table'], [role='grid']")) continue;
      const rect = parent.getBoundingClientRect();
      // 兼容页面轻度滚动或固定顶栏：允许 top 在 -200 ~ 480px 范围内
      if (rect.top < -200 || rect.top > 480 || rect.height > 120) continue;

      // 情况 1：标签与金额在同一个文本里（如 "可用余额(元) 598,490.56" 或 "可用余额：500元"）
      const inlineMatch = txt.match(/(?:千川可用余额|账户可用余额|可用余额|账户余额|千川余额|余额)(?:\s*[\(（]元[\)）])?\s*[:：¥￥]?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(亿|万|w|W|千|k|K)?/);
      if (inlineMatch) {
        let val = Number(inlineMatch[1].replace(/,/g, ""));
        if (Number.isFinite(val)) {
          const u = inlineMatch[2] || "";
          if (u === "亿") val *= 1e8;
          else if (u === "万" || u === "w" || u === "W") val *= 1e4;
          else if (u === "千" || u === "k" || u === "K") val *= 1e3;
          return { el: parent, label: "可用余额", value: Math.round(val * 100) / 100 };
        }
      }

      const priority = /千川可用余额|账户可用余额/.test(txt) ? 100 : /可用余额/.test(txt) ? 85 : /余额\s*[\(（]元[\)）]/.test(txt) ? 75 : 50;
      labelHits.push({ el: parent, label: "可用余额", priority });
    }

    labelHits.sort((a, b) => b.priority - a.priority);
    for (const hit of labelHits) {
      let container = hit.el.parentElement;
      for (let depth = 0; depth < 6 && container && container !== document.body; depth++) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 560 || rect.height > 160) break;
        const valEl = findBestMetricElementInCard(container, hit.el);
        if (valEl) {
          const val = parseMetricNumber(readElementMetricText(valEl));
          if (val !== null && val >= 0) {
            return { el: valEl, label: hit.label || "可用余额", value: val };
          }
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  // 自动查找顶部「整体消耗」指标卡（兼容千川乘方 Aurora / 全域推商品 / 推直播间）
  function autoFindOverallCostElement() {
    const direct = document.querySelector(".card.stat_cost .oc-promotion-metric-card-number");
    if (direct && isVisible(direct)) {
      const val = parseMetricNumber(readElementMetricText(direct));
      if (val !== null) return { el: direct, label: "整体消耗", value: val };
    }
    const cards = Array.from(
      document.querySelectorAll(
        ".aurora-qc-statistic, .oc-promotion-metric-card, .oc-statistic, [class*='metricCardStatistic'], [class*='metric-card'], .card"
      )
    ).filter((c) => isVisible(c));
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.width > 640 || rect.height > 280) continue;
      const titleEl = card.querySelector(
        "[data-testid='metric-card-title-region'], .aurora-qc-statistic-title, .oc-statistic-title, .card-label, [class*='title']"
      );
      const titleTxt = normalizeText(titleEl?.getAttribute?.("title") || titleEl?.innerText || titleEl?.textContent);
      if (!titleTxt || titleTxt.length > 20 || !/消耗/.test(titleTxt) || COST_EXCLUDE_RE.test(titleTxt)) continue;
      const auroraRow = card.querySelector(".aurora-qc-statistic-value-row");
      const auroraInner = card.querySelector(".aurora-qc-statistic-value-row > .aurora-qc-statistic-value-text");
      const numBox =
        (auroraInner && parseMetricNumber(readElementMetricText(auroraInner)) !== null ? auroraInner : null) ||
        (auroraRow && parseMetricNumber(readElementMetricText(auroraRow)) !== null ? auroraRow : null) ||
        card.querySelector(".oc-promotion-metric-card-number, .oc-statistic-content, .card-value") ||
        findBestMetricElementInCard(card, titleEl);
      if (!numBox || !isVisible(numBox)) continue;
      const val = parseMetricNumber(readElementMetricText(numBox));
      if (val !== null) {
        return { el: numBox, label: titleTxt, value: val };
      }
    }
    return null;
  }

  // ---------- 自动查找页面整体 ROI 元素（兼容千川全域 / 千川乘方 Aurora / 推直播间 / 标准投放 / 实时大屏） ----------
  function findBestMetricElementInCard(container, labelEl) {
    const rawEls = Array.from(container.querySelectorAll("*")).filter((el) => {
      if (el === labelEl || el.contains(labelEl) || labelEl.contains(el) || !isVisible(el)) return false;
      if (el.querySelector("table, thead, tbody, ul, ol")) return false;
      if (el.closest("svg, canvas")) return false;
      const rect = el.getBoundingClientRect();
      if (rect.height > 96 || rect.width > 380 || rect.width < 8) return false;
      const rawText = String(el.textContent || "").trim();
      if (!rawText || rawText.length > 36) return false;
      // 若自身就是纯百分比涨跌幅（如 -0.21% / +4.17%），直接排除
      if (/^[+-]?\s*\d+(?:\.\d+)?\s*%$/.test(rawText)) return false;

      const t = readElementMetricText(el).trim();
      if (!t || t.length > 18 || /%/.test(t)) return false;
      if (!/^\d+(?:,\d+)*(?:\.\d+)?$/.test(t)) return false;
      return true;
    });

    if (rawEls.length === 0) return null;

    rawEls.sort((a, b) => {
      const ta = readElementMetricText(a);
      const tb = readElementMetricText(b);
      const na = parseMetricNumber(ta);
      const nb = parseMetricNumber(tb);
      const nonZeroA = na !== null && na > 0 ? 1 : 0;
      const nonZeroB = nb !== null && nb > 0 ? 1 : 0;
      if (nonZeroB !== nonZeroA) return nonZeroB - nonZeroA;

      const hasDecA = ta.includes(".") ? 1 : 0;
      const hasDecB = tb.includes(".") ? 1 : 0;
      if (hasDecB !== hasDecA) return hasDecB - hasDecA;

      const rawA = String(a.textContent || "").replace(/\s+/g, "");
      const rawB = String(b.textContent || "").replace(/\s+/g, "");
      const pureA = /^\d+(?:,\d+)*(?:\.\d+)?$/.test(rawA) ? 1 : 0;
      const pureB = /^\d+(?:,\d+)*(?:\.\d+)?$/.test(rawB) ? 1 : 0;
      if (pureB !== pureA) return pureB - pureA;

      // 包含完整数字的更小/更紧凑节点优先（避开整行大容器）
      const fa = parseFloat(getComputedStyle(a).fontSize) || 12;
      const fb = parseFloat(getComputedStyle(b).fontSize) || 12;
      if (Math.abs(fb - fa) >= 1) return fb - fa;

      const depthA = a.querySelectorAll("*").length;
      const depthB = b.querySelectorAll("*").length;
      if (depthA !== depthB) return depthA - depthB;
      return a.getBoundingClientRect().width - b.getBoundingClientRect().width;
    });

    return rawEls[0];
  }

  function autoFindRoiElement() {
    // 1) 千川全域/专业版顶部指标卡精准直连（避免整数与小数拆分为两个 span 时只读到整数位）
    const directCardNum = document.querySelector(
      ".card.total_prepay_and_pay_order_roi2 .oc-promotion-metric-card-number"
    );
    if (directCardNum && isVisible(directCardNum)) {
      const valText = readElementMetricText(directCardNum);
      if (parseMetricNumber(valText) !== null) {
        return {
          el: directCardNum,
          selector: ".card.total_prepay_and_pay_order_roi2 .oc-promotion-metric-card-number",
          label: "整体支付ROI",
          value: valText,
        };
      }
    }

    const metricCards = Array.from(
      document.querySelectorAll(
        ".aurora-qc-statistic, .oc-promotion-metric-card, .oc-statistic, [class*='metricCardStatistic'], [class*='metric-card'], [class*='kpi-card'], [class*='stat-card'], .card"
      )
    ).filter((c) => isVisible(c));
    const preferredCardMatches = [];
    for (const card of metricCards) {
      const rect = card.getBoundingClientRect();
      if (rect.width > 640 || rect.height > 280) continue;
      const titleEl =
        card.querySelector("[data-testid='metric-card-title-region']") ||
        card.querySelector(".aurora-qc-statistic-title, .oc-statistic-title, .card-label") ||
        card.querySelector("[class*='title'], [class*='label'], [class*='name']");
      const titleTxt = normalizeText(titleEl?.getAttribute?.("title") || titleEl?.innerText || titleEl?.textContent);
      if (!titleTxt || titleTxt.length > 26 || !/ROI/i.test(titleTxt) || ROI_EXCLUDE_RE.test(titleTxt) || /建议/.test(titleTxt)) {
        continue;
      }
      const auroraRow = card.querySelector(".aurora-qc-statistic-value-row");
      const auroraInner = card.querySelector(".aurora-qc-statistic-value-row > .aurora-qc-statistic-value-text");
      const auroraTarget =
        auroraInner && parseMetricNumber(readElementMetricText(auroraInner)) !== null
          ? auroraInner
          : auroraRow && parseMetricNumber(readElementMetricText(auroraRow)) !== null
            ? auroraRow
            : null;
      const numBox =
        auroraTarget ||
        card.querySelector(".oc-promotion-metric-card-number, .oc-statistic-content") ||
        findBestMetricElementInCard(card, titleEl);
      if (!numBox || !isVisible(numBox)) continue;
      const valText = readElementMetricText(numBox);
      const numVal = parseMetricNumber(valText);
      if (numVal === null) continue;
      const cleanLabel = titleTxt.replace(/\s*(重要|核心|推荐|新)$/g, "").trim() || titleTxt;
      let score = /综合营销ROI|整体支付ROI/i.test(cleanLabel)
        ? 100
        : /直接支付ROI|直播间支付ROI|直播间成交ROI/i.test(cleanLabel)
          ? 85
          : /支付ROI|成交ROI|全场ROI/i.test(cleanLabel)
            ? 70
            : 50;
      if (numVal > 0) score += 60;
      if (valText.includes(".")) score += 15;
      if (card.matches?.(".aurora-qc-statistic, .oc-promotion-metric-card, .oc-statistic")) score += 25;
      preferredCardMatches.push({
        el: numBox,
        selector: buildUniqueSelector(numBox),
        label: cleanLabel,
        value: valText,
        score,
      });
    }
    if (preferredCardMatches.length > 0) {
      preferredCardMatches.sort((a, b) => b.score - a.score);
      return preferredCardMatches[0];
    }

    // 2) 通用网页 & 千川乘方 Aurora / 实时大屏回退扫描（支持最多 8 层标题包裹 + 拆分的整数/小数节点）
    const candidates = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = normalizeText(node.textContent);
      if (!txt || txt.length > 26 || !/ROI/i.test(txt)) continue;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      if (
        parent.closest(
          "table, thead, tbody, [role='table'], [role='grid'], [role='columnheader'], [class*='table-head'], [class*='table-header'], [class*='table-body']"
        )
      ) {
        continue;
      }
      if (ROI_EXCLUDE_RE.test(txt) || /建议|说明|调整为/.test(txt)) continue;

      let labelScore = 10;
      if (/综合营销ROI|整体支付ROI/i.test(txt)) labelScore += 90;
      else if (/直接支付ROI|直播间支付ROI|直播间成交ROI/i.test(txt)) labelScore += 80;
      else if (/支付ROI|成交ROI|整体ROI|全场ROI|千川ROI/i.test(txt)) labelScore += 55;
      if (txt.length <= 12) labelScore += 10;
      candidates.push({ el: parent, label: txt, score: labelScore });
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const item of candidates) {
      let container = item.el.parentElement;
      for (let depth = 0; depth < 12 && container && container !== document.body; depth++) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 640 || rect.height > 280) break;
        if (rect.width >= 80 && rect.height >= 36) {
          const target = findBestMetricElementInCard(container, item.el);
          if (target) {
            return {
              el: target,
              selector: buildUniqueSelector(target),
              label: item.label,
              value: readElementMetricText(target),
            };
          }
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  // ---------- 多架构计划列表表格扫描 ----------
  // 判断 <thead> 内的某一行是否为千川汇总行（如 ovui-table 会把「共18条计划 | 1120.58 | 2.97」放在 thead 的第二行）
  function isTheadSummaryRow(tr) {
    if (!tr) return true;
    const cls = typeof tr.className === "string" ? tr.className : "";
    if (SUMMARY_ROW_CLASS_RE.test(cls)) return true;

    const cells = Array.from(tr.children).filter((c) => c.tagName === "TH" || c.tagName === "TD");
    if (cells.length === 0) return true;

    const nonEmptyTexts = cells
      .map((c) => normalizeText(c.innerText || c.textContent))
      .filter(Boolean);
    if (nonEmptyTexts.length === 0) return true;

    if (nonEmptyTexts.slice(0, 3).some((t) => SUMMARY_ROW_TEXT_RE.test(t))) {
      return true;
    }

    // 真实表头应以中文/英文列名为主；若半数以上非空单元格是纯数字或 "-"，说明是汇总数据行
    const numericLikeCount = nonEmptyTexts.filter((t) =>
      /^([-—–]+|[¥￥]?\d+(?:,\d+)*(?:\.\d+)?[万亿wWkK%]?)$/.test(t)
    ).length;
    if (nonEmptyTexts.length >= 3 && numericLikeCount / nonEmptyTexts.length >= 0.5) {
      return true;
    }

    return false;
  }

  // 解析 <thead>（支持多行合并表头，并自动剔除放在 thead 里的千川「共N条计划」汇总行）
  function extractTableHeaderLeafCells(table) {
    const rawHeaderRows = Array.from(table.querySelectorAll("thead tr")).filter((tr) => isVisible(tr));
    let headerRows = rawHeaderRows.filter((tr) => !isTheadSummaryRow(tr));
    // 若所有 thead tr 都被过滤（极少数纯数字表头场景），回退使用第一行
    if (headerRows.length === 0 && rawHeaderRows.length > 0) {
      headerRows = [rawHeaderRows[0]];
    }
    if (headerRows.length === 0) {
      const firstRow = table.querySelector("tr");
      if (firstRow && firstRow.querySelector("th") && !isTheadSummaryRow(firstRow)) {
        headerRows.push(firstRow);
      }
    }
    if (headerRows.length === 0) return [];

    // 构建虚拟二维网格展开 rowSpan / colSpan
    const grid = [];
    headerRows.forEach((tr, rIdx) => {
      if (!grid[rIdx]) grid[rIdx] = [];
      let cIdx = 0;
      const cells = Array.from(tr.children).filter((c) => c.tagName === "TH" || c.tagName === "TD");
      for (const cell of cells) {
        while (grid[rIdx][cIdx]) cIdx++;
        const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
        const colSpan = Math.max(1, Number(cell.colSpan) || 1);
        for (let dr = 0; dr < rowSpan; dr++) {
          if (!grid[rIdx + dr]) grid[rIdx + dr] = [];
          for (let dc = 0; dc < colSpan; dc++) {
            grid[rIdx + dr][cIdx + dc] = cell;
          }
        }
        cIdx += colSpan;
      }
    });

    const lastRow = grid[grid.length - 1] || [];
    return lastRow.map((cell, idx) => ({
      idx,
      cell,
      text: normalizeText(cell?.innerText || cell?.textContent || ""),
      rect: cell ? cell.getBoundingClientRect() : null,
      colCount: lastRow.length,
    }));
  }

  function findRowCellByColumn(cells, colIdx, headerRect, expectedColCount = 0) {
    // 列数完全一致时直接按列下标取单元格（免疫横向滚动与 sticky 固定列遮挡重叠）
    if (expectedColCount > 0 && cells.length === expectedColCount && colIdx >= 0 && colIdx < cells.length) {
      return cells[colIdx];
    }
    // 列数不一致时（如 colSpan 或固定列拆分表）通过 X 坐标中心点/重叠匹配
    if (headerRect && headerRect.width > 0) {
      const hCenter = headerRect.left + headerRect.width / 2;
      let best = null;
      let bestOverlap = 0;
      for (const c of cells) {
        const r = c.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const overlap = Math.min(r.right, headerRect.right) - Math.max(r.left, headerRect.left);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = c;
        } else if (!best && hCenter >= r.left - 4 && hCenter <= r.right + 4) {
          best = c;
        }
      }
      if (best && bestOverlap >= Math.min(headerRect.width, 16) * 0.25) {
        return best;
      }
    }
    if (colIdx >= 0 && colIdx < cells.length) {
      return cells[colIdx];
    }
    return null;
  }

  function getDirectRowCells(tr) {
    return Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
  }

  // 策略 1 & 2：标准 <table> + Arco/Semi/Ant/rc-table 表头表体拆分 & 左右固定列拆分 <table>
  function scanHtmlTables() {
    const tables = Array.from(document.querySelectorAll("table")).filter((t) => isVisible(t));
    if (tables.length === 0) return null;

    const seenRows = new Set();
    const rowsResult = [];
    let excludedSummaryCount = 0;
    let matchedMeta = null;

    // 1) 标准单表（同一 <table> 同时含表头和数据行）
    for (const table of tables) {
      const headerCols = extractTableHeaderLeafCells(table);
      if (headerCols.length < 2) continue;

      const bodyRows = Array.from(table.querySelectorAll("tbody tr")).filter((tr) => getDirectRowCells(tr).length > 0);
      if (bodyRows.length === 0) continue;

      const headerTexts = headerCols.map((c) => c.text);
      const roiIdx = findBestColumnIndex(headerTexts, config.roiHeaderKeyword, "roi");
      if (roiIdx === -1) continue;

      const costIdx = findBestColumnIndex(headerTexts, config.costHeaderKeyword, "cost");
      const statusIdx = findBestColumnIndex(headerTexts, "调控状态,计划状态,投放状态,商品状态,状态", "status");
      const budgetIdx = findBestColumnIndex(headerTexts, "调控预算,每日预算,日预算,计划预算,预算", "budget");
      const settingsIdx = findBestColumnIndex(headerTexts, "投放设置,商品推广设置,推广设置,设置", "settings");
      let nameIdx = findBestColumnIndex(headerTexts, config.nameHeaderKeyword, "name");
      if (nameIdx === -1) nameIdx = 0;

      matchedMeta = {
        engine: "standard-table",
        roiHeader: headerTexts[roiIdx],
        costHeader: costIdx >= 0 ? headerTexts[costIdx] : "(未匹配)",
        nameHeader: headerTexts[nameIdx] || "(首列)",
      };

      bodyRows.forEach((tr, i) => {
        const cells = getDirectRowCells(tr);
        const firstTexts = cells.slice(0, 3).map((c) => normalizeText(c.innerText || c.textContent));
        if (isIgnoredTableRow(tr, firstTexts)) {
          excludedSummaryCount++;
          return;
        }
        const expectedCols = headerCols.length;
        const roiCell = findRowCellByColumn(cells, roiIdx, headerCols[roiIdx]?.rect, expectedCols);
        const roiVal = parseMetricNumber(roiCell?.innerText || roiCell?.textContent);
        const costCell =
          costIdx >= 0 ? findRowCellByColumn(cells, costIdx, headerCols[costIdx]?.rect, expectedCols) : null;
        const costVal = costCell ? parseMetricNumber(costCell.innerText || costCell.textContent) : null;
        if (roiVal === null && (costVal === null || costVal <= 0)) return;

        const budgetCell =
          budgetIdx >= 0 ? findRowCellByColumn(cells, budgetIdx, headerCols[budgetIdx]?.rect, expectedCols) : null;
        const settingsCell =
          settingsIdx >= 0 ? findRowCellByColumn(cells, settingsIdx, headerCols[settingsIdx]?.rect, expectedCols) : null;
        const budgetVal = extractBudgetFromRow(budgetCell, settingsCell);

        const statusCell =
          statusIdx >= 0 ? findRowCellByColumn(cells, statusIdx, headerCols[statusIdx]?.rect, expectedCols) : null;
        const statusText = extractPlanStatus(statusCell);
        const guaranteeState = extractGuaranteeState(statusCell);
        const nameCell = findRowCellByColumn(cells, nameIdx, headerCols[nameIdx]?.rect, expectedCols) || cells[0];
        const ident = extractPlanIdentity(nameCell, tr, i);

        if (!seenRows.has(ident.id)) {
          seenRows.add(ident.id);
          rowsResult.push({
            id: ident.id,
            name: ident.name,
            status: statusText,
            guaranteeState,
            roi: roiVal,
            cost: costVal,
            budget: budgetVal,
            rowEls: [tr],
            roiCell,
            costCell,
            statusCell,
          });
        }
      });

      if (rowsResult.length > 0) {
        return { rows: rowsResult, meta: { ...matchedMeta, excludedSummaryCount } };
      }
    }

    // 2) 表头/表体拆分表（Arco / Semi / Ant / ByteDance 固定表头或固定列双/多 <table>）
    const headerOnlyTables = tables.filter((t) => {
      const headers = extractTableHeaderLeafCells(t);
      const dataTrs = Array.from(t.querySelectorAll("tbody tr")).filter((tr) => !isIgnoredTableRow(tr));
      return headers.length >= 2 && dataTrs.length === 0;
    });

    for (const hTable of headerOnlyTables) {
      // 向上查找包含对应表体 <table> 的公共表格容器（最多 6 层）
      let wrapper = hTable.parentElement;
      let siblingBodyTables = [];
      let wrapperHeaderTables = [];
      for (let depth = 0; depth < 6 && wrapper && wrapper !== document.body; depth++) {
        const innerTables = Array.from(wrapper.querySelectorAll("table")).filter((t) => isVisible(t));
        const bodies = innerTables.filter(
          (t) => t !== hTable && Array.from(t.querySelectorAll("tbody tr")).some((tr) => getDirectRowCells(tr).length > 0)
        );
        if (bodies.length > 0) {
          siblingBodyTables = bodies;
          wrapperHeaderTables = innerTables.filter((t) => extractTableHeaderLeafCells(t).length >= 1);
          break;
        }
        wrapper = wrapper.parentElement;
      }

      if (siblingBodyTables.length === 0) continue;

      // 合并容器内所有表头单元格（支持左侧固定列独立 header table + 右侧主 header table）
      const allHeaderCols = [];
      for (const wt of wrapperHeaderTables) {
        const cols = extractTableHeaderLeafCells(wt);
        cols.forEach((c) => allHeaderCols.push({ ...c, table: wt }));
      }

      const headerTexts = allHeaderCols.map((c) => c.text);
      let roiHIdx = findBestColumnIndex(headerTexts, config.roiHeaderKeyword, "roi");
      if (roiHIdx === -1) continue;

      const costHIdx = findBestColumnIndex(headerTexts, config.costHeaderKeyword, "cost");
      const statusHIdx = findBestColumnIndex(headerTexts, "调控状态,计划状态,投放状态,商品状态,状态", "status");
      const budgetHIdx = findBestColumnIndex(headerTexts, "调控预算,每日预算,日预算,计划预算,预算", "budget");
      const settingsHIdx = findBestColumnIndex(headerTexts, "投放设置,商品推广设置,推广设置,设置", "settings");
      const nameHIdx = findBestColumnIndex(headerTexts, config.nameHeaderKeyword, "name");

      let roiCol = allHeaderCols[roiHIdx];
      const costCol = costHIdx >= 0 ? allHeaderCols[costHIdx] : null;
      const statusCol = statusHIdx >= 0 ? allHeaderCols[statusHIdx] : null;
      const budgetCol = budgetHIdx >= 0 ? allHeaderCols[budgetHIdx] : null;
      const settingsCol = settingsHIdx >= 0 ? allHeaderCols[settingsHIdx] : null;
      const firstNamedHeader = allHeaderCols.find((c) => normalizeText(c.text).length > 0) || allHeaderCols[0];
      const nameCol = nameHIdx >= 0 ? allHeaderCols[nameHIdx] : firstNamedHeader;

      // 找到与 roiCol 水平位置重叠的主表体 table
      const pickBodyTableForHeader = (col) => {
        if (!col || !col.rect) return siblingBodyTables[0];
        let bestTable = null;
        let bestScore = -1;
        for (const bt of siblingBodyTables) {
          const bRect = bt.getBoundingClientRect();
          const overlap = Math.min(bRect.right, col.rect.right) - Math.max(bRect.left, col.rect.left);
          const colCountMatch =
            bt.querySelector("tbody tr") &&
            getDirectRowCells(bt.querySelector("tbody tr")).length === extractTableHeaderLeafCells(col.table).length
              ? 1000
              : 0;
          const score = (overlap > 0 ? overlap : 0) + colCountMatch;
          if (score > bestScore) {
            bestScore = score;
            bestTable = bt;
          }
        }
        return bestTable || siblingBodyTables[0];
      };

      let roiBodyTable = pickBodyTableForHeader(roiCol);
      const costBodyTable = costCol ? pickBodyTableForHeader(costCol) : roiBodyTable;
      const statusBodyTable = statusCol ? pickBodyTableForHeader(statusCol) : roiBodyTable;
      const budgetBodyTable = budgetCol ? pickBodyTableForHeader(budgetCol) : roiBodyTable;
      const settingsBodyTable = settingsCol ? pickBodyTableForHeader(settingsCol) : roiBodyTable;
      const nameBodyTable = nameCol ? pickBodyTableForHeader(nameCol) : roiBodyTable;

      const getValidRows = (bt) => {
        const allTrs = Array.from(bt.querySelectorAll("tbody tr")).filter((tr) => getDirectRowCells(tr).length > 0);
        const valid = [];
        allTrs.forEach((tr) => {
          const cells = getDirectRowCells(tr);
          const firstTexts = cells.slice(0, 3).map((c) => normalizeText(c.innerText || c.textContent));
          if (isIgnoredTableRow(tr, firstTexts)) {
            excludedSummaryCount++;
            return;
          }
          valid.push({
            tr,
            cells,
            rect: tr.getBoundingClientRect(),
            rowKey: tr.getAttribute("data-row-key") || tr.dataset?.rowKey || "",
          });
        });
        return valid;
      };

      let roiRows = getValidRows(roiBodyTable);
      // 兜底：如 /uni-prom（推直播间）存在「综合营销ROI」全为 "-" 而「整体支付ROI」有实数，自动切换到有实数的候选 ROI 列
      const countNumericForCol = (col, rowsPool) =>
        rowsPool.reduce((acc, r) => {
          const cell = findRowCellByColumn(r.cells, col.idx, col.rect, col.colCount || 0);
          return acc + (parseMetricNumber(cell?.innerText || cell?.textContent) !== null ? 1 : 0);
        }, 0);
      if (roiRows.length > 0 && countNumericForCol(roiCol, roiRows) === 0) {
        const altIndices = headerTexts
          .map((txt, idx) => ({ txt, idx }))
          .filter(({ txt, idx }) => idx !== roiHIdx && /roi/i.test(txt) && !ROI_EXCLUDE_RE.test(txt));
        for (const alt of altIndices) {
          const altCol = allHeaderCols[alt.idx];
          const altBody = pickBodyTableForHeader(altCol);
          const altRows = altBody === roiBodyTable ? roiRows : getValidRows(altBody);
          if (countNumericForCol(altCol, altRows) > 0) {
            roiHIdx = alt.idx;
            roiCol = altCol;
            roiBodyTable = altBody;
            roiRows = altRows;
            break;
          }
        }
      }
      const costRows = costBodyTable === roiBodyTable ? roiRows : getValidRows(costBodyTable);
      const statusRows = statusBodyTable === roiBodyTable ? roiRows : getValidRows(statusBodyTable);
      const budgetRows = budgetBodyTable === roiBodyTable ? roiRows : getValidRows(budgetBodyTable);
      const settingsRows = settingsBodyTable === roiBodyTable ? roiRows : getValidRows(settingsBodyTable);
      const nameRows = nameBodyTable === roiBodyTable ? roiRows : getValidRows(nameBodyTable);

      const findPairedRow = (targetRow, targetIdx, pool) => {
        if (pool === roiRows) return targetRow;
        if (targetRow.rowKey) {
          const byKey = pool.find((r) => r.rowKey && r.rowKey === targetRow.rowKey);
          if (byKey) return byKey;
        }
        // 按 Y 坐标对齐（支持固定列与滚动表独立渲染）
        const byY = pool.find((r) => Math.abs(r.rect.top - targetRow.rect.top) <= 14);
        if (byY) return byY;
        return pool[targetIdx] || null;
      };

      matchedMeta = {
        engine: "split-table",
        roiHeader: roiCol.text,
        costHeader: costCol ? costCol.text : "(未匹配)",
        nameHeader: nameCol ? nameCol.text : "(首列)",
      };

      roiRows.forEach((rowObj, idx) => {
        const roiCell = findRowCellByColumn(rowObj.cells, roiCol.idx, roiCol.rect, roiCol.colCount || 0);
        const roiVal = parseMetricNumber(roiCell?.innerText || roiCell?.textContent);

        let costVal = null;
        let costRow = null;
        let costCell = null;
        if (costCol) {
          costRow = findPairedRow(rowObj, idx, costRows);
          if (costRow) {
            costCell = findRowCellByColumn(costRow.cells, costCol.idx, costCol.rect, costCol.colCount || 0);
            costVal = parseMetricNumber(costCell?.innerText || costCell?.textContent);
          }
        }
        if (roiVal === null && (costVal === null || costVal <= 0)) return;

        let budgetCell = null;
        if (budgetCol) {
          const budgetRow = findPairedRow(rowObj, idx, budgetRows);
          if (budgetRow) {
            budgetCell = findRowCellByColumn(budgetRow.cells, budgetCol.idx, budgetCol.rect, budgetCol.colCount || 0);
          }
        }
        let settingsCell = null;
        if (settingsCol) {
          const settingsRow = findPairedRow(rowObj, idx, settingsRows);
          if (settingsRow) {
            settingsCell = findRowCellByColumn(settingsRow.cells, settingsCol.idx, settingsCol.rect, settingsCol.colCount || 0);
          }
        }
        const budgetVal = extractBudgetFromRow(budgetCell, settingsCell);

        let statusText = "";
        let statusRow = null;
        let statusCell = null;
        let guaranteeState = "unknown";
        if (statusCol) {
          statusRow = findPairedRow(rowObj, idx, statusRows);
          if (statusRow) {
            statusCell = findRowCellByColumn(statusRow.cells, statusCol.idx, statusCol.rect, statusCol.colCount || 0);
            statusText = extractPlanStatus(statusCell);
            guaranteeState = extractGuaranteeState(statusCell);
          }
        }

        const nameRow = findPairedRow(rowObj, idx, nameRows) || rowObj;
        const nameCell =
          (nameCol ? findRowCellByColumn(nameRow.cells, nameCol.idx, nameCol.rect, nameCol.colCount || 0) : null) ||
          nameRow.cells[0];
        const ident = extractPlanIdentity(nameCell, nameRow.tr, idx);

        if (!seenRows.has(ident.id)) {
          seenRows.add(ident.id);
          const pairedRowEls = Array.from(
            new Set([rowObj.tr, nameRow?.tr, costRow?.tr, statusRow?.tr].filter(Boolean))
          );
          rowsResult.push({
            id: ident.id,
            name: ident.name,
            status: statusText,
            guaranteeState,
            roi: roiVal,
            cost: costVal,
            budget: budgetVal,
            rowEls: pairedRowEls,
            roiCell,
            costCell,
            statusCell,
          });
        }
      });

      if (rowsResult.length > 0) {
        return { rows: rowsResult, meta: { ...matchedMeta, excludedSummaryCount } };
      }
    }

    return null;
  }

  // 策略 3：ARIA role="table" / role="grid" 虚拟表格
  function scanAriaGridTables() {
    const headerCellsAll = Array.from(document.querySelectorAll('[role="columnheader"]')).filter((el) =>
      isVisible(el)
    );
    if (headerCellsAll.length < 2) return null;

    // 按所属 grid/table 容器分组
    const groupMap = new Map();
    for (const hc of headerCellsAll) {
      const grid = hc.closest('[role="table"], [role="grid"], [class*="table"]') || hc.parentElement?.parentElement;
      if (!grid) continue;
      if (!groupMap.has(grid)) groupMap.set(grid, []);
      groupMap.get(grid).push(hc);
    }

    for (const [grid, hCells] of groupMap.entries()) {
      const headerInfos = hCells.map((cell, idx) => ({
        idx,
        cell,
        text: normalizeText(cell.innerText || cell.textContent),
        rect: cell.getBoundingClientRect(),
      }));
      const headerTexts = headerInfos.map((h) => h.text);
      const roiIdx = findBestColumnIndex(headerTexts, config.roiHeaderKeyword, "roi");
      if (roiIdx === -1) continue;

      const costIdx = findBestColumnIndex(headerTexts, config.costHeaderKeyword, "cost");
      const statusIdx = findBestColumnIndex(headerTexts, "调控状态,计划状态,投放状态,商品状态,状态", "status");
      const budgetIdx = findBestColumnIndex(headerTexts, "调控预算,每日预算,日预算,计划预算,预算", "budget");
      const settingsIdx = findBestColumnIndex(headerTexts, "投放设置,商品推广设置,推广设置,设置", "settings");
      let nameIdx = findBestColumnIndex(headerTexts, config.nameHeaderKeyword, "name");
      if (nameIdx === -1) nameIdx = 0;

      const dataRows = Array.from(grid.querySelectorAll('[role="row"]')).filter(
        (r) => isVisible(r) && !r.querySelector('[role="columnheader"]')
      );
      if (dataRows.length === 0) continue;

      // 将同一视觉水平带（或同一 data-row-key）的拆分行合并
      const bands = [];
      for (const r of dataRows) {
        const cells = Array.from(r.querySelectorAll('[role="cell"], [role="gridcell"]')).filter((c) => isVisible(c));
        if (cells.length === 0) continue;
        const rect = r.getBoundingClientRect();
        const key = r.getAttribute("data-row-key") || "";
        let band = bands.find((b) => (key && b.key === key) || Math.abs(b.top - rect.top) <= 14);
        if (!band) {
          band = { key, top: rect.top, rowEl: r, cells: [] };
          bands.push(band);
        }
        band.cells.push(...cells);
      }

      const rowsResult = [];
      const seen = new Set();
      let excludedSummaryCount = 0;

      bands.forEach((band, idx) => {
        const firstTexts = band.cells.slice(0, 3).map((c) => normalizeText(c.innerText || c.textContent));
        if (isIgnoredTableRow(band.rowEl, firstTexts)) {
          excludedSummaryCount++;
          return;
        }
        const roiCell = findRowCellByColumn(band.cells, roiIdx, headerInfos[roiIdx].rect);
        const roiVal = parseMetricNumber(roiCell?.innerText || roiCell?.textContent);

        const costCell =
          costIdx >= 0 ? findRowCellByColumn(band.cells, costIdx, headerInfos[costIdx].rect) : null;
        const costVal = costCell ? parseMetricNumber(costCell.innerText || costCell.textContent) : null;
        if (roiVal === null && (costVal === null || costVal <= 0)) return;

        const budgetCell =
          budgetIdx >= 0 ? findRowCellByColumn(band.cells, budgetIdx, headerInfos[budgetIdx].rect) : null;
        const settingsCell =
          settingsIdx >= 0 ? findRowCellByColumn(band.cells, settingsIdx, headerInfos[settingsIdx].rect) : null;
        const budgetVal = extractBudgetFromRow(budgetCell, settingsCell);

        const statusCell =
          statusIdx >= 0 ? findRowCellByColumn(band.cells, statusIdx, headerInfos[statusIdx].rect) : null;
        const statusText = extractPlanStatus(statusCell);
        const guaranteeState = extractGuaranteeState(statusCell);
        const nameCell = findRowCellByColumn(band.cells, nameIdx, headerInfos[nameIdx]?.rect) || band.cells[0];
        const ident = extractPlanIdentity(nameCell, band.rowEl, idx);

        if (!seen.has(ident.id)) {
          seen.add(ident.id);
          rowsResult.push({
            id: ident.id,
            name: ident.name,
            status: statusText,
            guaranteeState,
            roi: roiVal,
            cost: costVal,
            budget: budgetVal,
            rowEls: [band.rowEl],
            roiCell,
            costCell,
            statusCell,
          });
        }
      });

      if (rowsResult.length > 0) {
        return {
          rows: rowsResult,
          meta: {
            engine: "aria-grid",
            roiHeader: headerTexts[roiIdx],
            costHeader: costIdx >= 0 ? headerTexts[costIdx] : "(未匹配)",
            nameHeader: headerTexts[nameIdx] || "(首列)",
            excludedSummaryCount,
          },
        };
      }
    }

    return null;
  }

  // 策略 4：通用 Div / 虚拟滚动表格几何对齐引擎（专治无 <table> 且无 role="columnheader" 的千川全域/推商品虚拟列表）
  function scanGeometricDivTables() {
    const roiKeywords = splitKeywords(config.roiHeaderKeyword, "roi");
    const userWantsExcludedRoi = roiKeywords.some((k) => ROI_EXCLUDE_RE.test(k));

    // 1) 查找页面上所有可能是表格 ROI 列头的元素
    const roiHeaderCandidates = [];
    const allEls = document.querySelectorAll("th, [role='columnheader'], [class*='head'] *, [class*='th'], [class*='header'] *, div, span");
    for (const el of allEls) {
      if (!isVisible(el)) continue;
      // 跳过大容器，只看紧凑的列头节点
      const rect = el.getBoundingClientRect();
      if (rect.height > 64 || rect.width > 340 || rect.width < 24) continue;
      // 跳过包含嵌套块级大布局的元素，优先最内层文本容器
      if (el.querySelector("table, tr, [role='row']")) continue;

      const txt = normalizeText(el.innerText || el.textContent);
      if (!txt || txt.length > 26) continue;
      const compact = txt.toLowerCase().replace(/\s+/g, "");
      if (!roiKeywords.some((kw) => compact.includes(kw))) continue;
      if (!userWantsExcludedRoi && ROI_EXCLUDE_RE.test(compact)) continue;

      // 避免父子同时命中：只保留不含同样匹配子元素的最深节点
      const hasMatchingChild = Array.from(el.children).some((ch) => {
        const ct = normalizeText(ch.innerText || ch.textContent).toLowerCase().replace(/\s+/g, "");
        return ct && roiKeywords.some((kw) => ct.includes(kw));
      });
      if (hasMatchingChild) continue;

      roiHeaderCandidates.push({ el, text: txt, rect });
    }

    if (roiHeaderCandidates.length === 0) return null;

    for (const cand of roiHeaderCandidates) {
      // 向上找公共表头行 / 表格容器：需要同一水平 Y 带上存在 >= 2 个其他常见表头词（如 计划/消耗/订单/成交/操作）
      let tableRoot = null;
      let peerHeaders = [];
      let headerBottom = cand.rect.bottom;

      let cur = cand.el.parentElement;
      for (let depth = 0; depth < 7 && cur && cur !== document.body; depth++) {
        const curRect = cur.getBoundingClientRect();
        if (curRect.width >= 420 && curRect.height >= 120) {
          // 收集与 cand 在同一水平带上的所有紧凑列头文本节点
          const bandNodes = [];
          const descendants = cur.querySelectorAll("th, [role='columnheader'], [class*='th'], [class*='cell'], [class*='head'] div, [class*='head'] span, div, span");
          for (const d of descendants) {
            if (!isVisible(d)) continue;
            const r = d.getBoundingClientRect();
            if (r.height > 64 || r.width < 20 || r.width > 340) continue;
            if (Math.abs(r.top - cand.rect.top) > 22 && Math.abs((r.top + r.bottom) / 2 - (cand.rect.top + cand.rect.bottom) / 2) > 22) {
              continue;
            }
            const t = normalizeText(d.innerText || d.textContent);
            if (!t || t.length > 26) continue;
            // 仅保留无同文本子元素的叶子/表头单元
            const dupChild = Array.from(d.children).some((ch) => normalizeText(ch.innerText || ch.textContent) === t);
            if (dupChild) continue;
            bandNodes.push({ el: d, text: t, rect: r });
          }

          // 去重（按 X 坐标重叠去重，保留更紧凑节点）
          bandNodes.sort((a, b) => a.rect.left - b.rect.left || a.rect.width - b.rect.width);
          const deduped = [];
          for (const bn of bandNodes) {
            const existing = deduped.find(
              (e) => Math.abs(e.rect.left - bn.rect.left) < 12 && Math.abs(e.rect.right - bn.rect.right) < 12
            );
            if (!existing) deduped.push(bn);
          }

          const peerScore = deduped.filter((h) => TABLE_HEADER_PEER_RE.test(h.text)).length;
          if (deduped.length >= 3 && peerScore >= 2 && curRect.bottom > cand.rect.bottom + 50) {
            tableRoot = cur;
            peerHeaders = deduped;
            headerBottom = Math.max(...deduped.map((h) => h.rect.bottom));
            break;
          }
        }
        cur = cur.parentElement;
      }

      if (!tableRoot || peerHeaders.length < 3) continue;

      const headerTexts = peerHeaders.map((h) => h.text);
      const roiIdx = findBestColumnIndex(headerTexts, config.roiHeaderKeyword, "roi");
      if (roiIdx === -1) continue;
      const costIdx = findBestColumnIndex(headerTexts, config.costHeaderKeyword, "cost");
      const statusIdx = findBestColumnIndex(headerTexts, "调控状态,计划状态,投放状态,商品状态,状态", "status");
      const budgetIdx = findBestColumnIndex(headerTexts, "调控预算,每日预算,日预算,计划预算,预算", "budget");
      const settingsIdx = findBestColumnIndex(headerTexts, "投放设置,商品推广设置,推广设置,设置", "settings");
      const nameIdx = findBestColumnIndex(headerTexts, config.nameHeaderKeyword, "name");

      const roiHeader = peerHeaders[roiIdx];
      const costHeader = costIdx >= 0 ? peerHeaders[costIdx] : null;
      const statusHeader = statusIdx >= 0 ? peerHeaders[statusIdx] : null;
      const budgetHeader = budgetIdx >= 0 ? peerHeaders[budgetIdx] : null;
      const settingsHeader = settingsIdx >= 0 ? peerHeaders[settingsIdx] : null;
      const nameHeader = nameIdx >= 0 ? peerHeaders[nameIdx] : peerHeaders[0];

      // 收集表头下方的数据行元素
      const rowSelectors = [
        "tbody tr",
        "[role='row']",
        "[data-row-key]",
        "[class*='table-row']",
        "[class*='TableRow']",
        "[class*='table_row']",
        "[class*='body-row']",
        "[class*='tr-row']",
      ].join(",");

      const rawRows = Array.from(tableRoot.querySelectorAll(rowSelectors)).filter((r) => {
        if (!isVisible(r)) return false;
        const rect = r.getBoundingClientRect();
        return rect.top >= headerBottom - 6 && rect.height >= 24 && rect.width >= 150;
      });

      if (rawRows.length === 0) continue;

      // 按 data-row-key 或 Y 坐标合并拆分的固定列与主滚动列
      const bands = [];
      for (const r of rawRows) {
        // 跳过嵌套在其他候选行内部的子元素
        if (rawRows.some((other) => other !== r && other.contains(r))) continue;
        const rect = r.getBoundingClientRect();
        const key = r.getAttribute("data-row-key") || r.dataset?.rowKey || "";
        let band = bands.find((b) => (key && b.key === key) || Math.abs(b.top - rect.top) <= 14);
        if (!band) {
          band = { key, top: rect.top, rowEls: [] };
          bands.push(band);
        }
        band.rowEls.push(r);
      }

      const rowsResult = [];
      const seen = new Set();
      let excludedSummaryCount = 0;

      bands.forEach((band, idx) => {
        const primaryRow = band.rowEls[0];
        const allCells = [];
        for (const rEl of band.rowEls) {
          const explicitCells = Array.from(
            rEl.querySelectorAll("td, [role='cell'], [role='gridcell'], [class*='table-cell'], [class*='TableCell'], [class*='table-td'], [class*='cell']")
          ).filter((c) => {
            if (!isVisible(c)) return false;
            const cr = c.getBoundingClientRect();
            return cr.width >= 20 && cr.width <= 460 && cr.height >= 16;
          });
          if (explicitCells.length >= 2) {
            // 去掉嵌套外层容器，只保留最直接的单元格
            explicitCells.forEach((c) => {
              if (!explicitCells.some((other) => other !== c && c.contains(other) && other.getBoundingClientRect().width > 20)) {
                allCells.push(c);
              }
            });
          } else {
            Array.from(rEl.children)
              .filter((c) => isVisible(c))
              .forEach((c) => allCells.push(c));
          }
        }

        const firstTexts = allCells.slice(0, 3).map((c) => normalizeText(c.innerText || c.textContent));
        if (band.rowEls.some((rEl) => isIgnoredTableRow(rEl, firstTexts))) {
          excludedSummaryCount++;
          return;
        }

        const roiCell = findRowCellByColumn(allCells, -1, roiHeader.rect);
        const roiVal = parseMetricNumber(roiCell?.innerText || roiCell?.textContent);

        const costCell = costHeader ? findRowCellByColumn(allCells, -1, costHeader.rect) : null;
        const costVal = costCell ? parseMetricNumber(costCell.innerText || costCell.textContent) : null;
        if (roiVal === null && (costVal === null || costVal <= 0)) return;

        const budgetCell = budgetHeader ? findRowCellByColumn(allCells, -1, budgetHeader.rect) : null;
        const settingsCell = settingsHeader ? findRowCellByColumn(allCells, -1, settingsHeader.rect) : null;
        const budgetVal = extractBudgetFromRow(budgetCell, settingsCell);

        const statusCell = statusHeader ? findRowCellByColumn(allCells, -1, statusHeader.rect) : null;
        const statusText = extractPlanStatus(statusCell);
        const guaranteeState = extractGuaranteeState(statusCell);

        const nameCell = (nameHeader ? findRowCellByColumn(allCells, -1, nameHeader.rect) : null) || allCells[0];
        const ident = extractPlanIdentity(nameCell, primaryRow, idx);

        if (!seen.has(ident.id)) {
          seen.add(ident.id);
          rowsResult.push({
            id: ident.id,
            name: ident.name,
            status: statusText,
            guaranteeState,
            roi: roiVal,
            cost: costVal,
            budget: budgetVal,
            rowEls: band.rowEls,
            roiCell,
            costCell,
            statusCell,
          });
        }
      });

      if (rowsResult.length > 0) {
        return {
          rows: rowsResult,
          meta: {
            engine: "geometric-div-table",
            roiHeader: roiHeader.text,
            costHeader: costHeader ? costHeader.text : "(未匹配)",
            nameHeader: nameHeader ? nameHeader.text : "(首列)",
            excludedSummaryCount,
          },
        };
      }
    }

    return null;
  }

  function scanCampaignTables() {
    const res = scanHtmlTables() || scanAriaGridTables() || scanGeometricDivTables();
    if (res) {
      healthState.lastScanMeta = res.meta;
      return res;
    }
    healthState.lastScanMeta = null;
    return { rows: [], meta: null };
  }

  // ---------- 页面异常检测（登录失效 / 页面报错 / 断流卡死 / 目标丢失） ----------
  function findPageUpdateTimeText() {
    // 识别千川顶部如 "11-26 16:14 更新" 的更新时间文本，辅助判断断流
    const els = document.querySelectorAll("span, div, p");
    for (const el of els) {
      if (el.children.length > 0 || !isVisible(el)) continue;
      const t = normalizeText(el.textContent);
      if (t.length >= 6 && t.length <= 28 && /\d{1,2}:\d{2}\s*更新/.test(t)) {
        return t;
      }
    }
    return "";
  }

  function detectPageAnomalies(hasValidData, fingerprint) {
    if (!config.enabled || !config.anomalyAlertEnabled) {
      updateHealthBox("ok", "页面异常提醒已关闭");
      return [];
    }

    const now = Date.now();
    if (hasValidData && fingerprint) {
      healthState.hadValidData = true;
      healthState.dataMissingSince = 0;
      if (fingerprint !== healthState.lastDataFingerprint) {
        healthState.lastDataFingerprint = fingerprint;
        healthState.lastDataChangeAt = now;
      }
    } else if (healthState.hadValidData && !healthState.dataMissingSince) {
      healthState.dataMissingSince = now;
    }

    // DOM 异常扫描每 3 秒执行一次，避免高频遍历消耗性能
    if (now - healthState.lastAnomalyCheckAt < 3000) {
      return healthState.activeAnomalies;
    }
    healthState.lastAnomalyCheckAt = now;

    const detected = [];

    // 1) 登录态失效检测（URL 跳转或登录弹窗）
    if (/(^|\/)(login|passport|signin|sso)(\/|$|\?)/i.test(location.pathname)) {
      detected.push({
        key: "anomaly:login_url",
        level: "error",
        title: "🔐 页面登录态失效提醒",
        summary: `当前页面已跳转至登录页（${location.pathname}），ROI 监控已中断`,
      });
    } else {
      const dialogNodes = document.querySelectorAll(
        "[role='dialog'], [role='alertdialog'], [class*='modal'], [class*='dialog'], [class*='login'], [class*='passport']"
      );
      for (const el of dialogNodes) {
        if (!isVisible(el)) continue;
        const txt = normalizeText(el.innerText || el.textContent).slice(0, 260);
        if (!txt || ANNOUNCEMENT_IGNORE_RE.test(txt)) continue;
        const m = txt.match(LOGIN_EXPIRED_RE);
        if (m) {
          detected.push({
            key: "anomaly:login_modal",
            level: "error",
            title: "🔐 千川登录态失效提醒",
            summary: `检测到登录弹窗/提示「${m[0]}」，请尽快重新登录恢复监控`,
          });
          break;
        }
      }
    }

    // 2) 页面报错 / 接口异常检测（避开顶部公告条）
    if (detected.length === 0) {
      const alertNodes = document.querySelectorAll(
        "[role='alert'], [role='dialog'], [class*='message'], [class*='toast'], [class*='error'], [class*='exception'], [class*='empty']"
      );
      for (const el of alertNodes) {
        if (!isVisible(el)) continue;
        if (
          el.closest(
            "[class*='banner'], [class*='announce'], [class*='notice-bar'], [class*='marquee'], .overall-notice, #promotion-banner-content, .banner-container"
          )
        ) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.height > 460 && rect.width > window.innerWidth * 0.85) continue;
        const txt = normalizeText(el.innerText || el.textContent).slice(0, 220);
        if (!txt || ANNOUNCEMENT_IGNORE_RE.test(txt)) continue;
        const m = txt.match(PAGE_ERROR_RE);
        if (m) {
          detected.push({
            key: `anomaly:error:${m[0]}`,
            level: "error",
            title: "🚨 千川页面异常/报错提醒",
            summary: `页面出现异常提示「${m[0]}」，请检查网络或刷新页面`,
            snippet: txt.slice(0, 80),
          });
          break;
        }
      }
    }

    // 3) 监控目标突然持续丢失 >= 2 分钟（曾正常读到过数据，随后页面白屏/切页/崩溃）
    if (healthState.hadValidData && healthState.dataMissingSince > 0) {
      const missingMin = (now - healthState.dataMissingSince) / 60000;
      if (missingMin >= 2) {
        detected.push({
          key: "anomaly:data_missing",
          level: "warn",
          title: "⚠️ 监控数据丢失提醒",
          summary: `已连续 ${Math.floor(missingMin)} 分钟无法读取到 ROI 数据，页面可能已切页、卡死或加载失败`,
        });
      }
    }

    // 4) 数据长时间无更新 / 断流卡死检测
    const staleMinLimit = Number(config.staleMinutes || 0);
    if (staleMinLimit > 0 && healthState.lastDataChangeAt > 0 && hasValidData) {
      const idleMin = (now - healthState.lastDataChangeAt) / 60000;
      if (idleMin >= staleMinLimit) {
        detected.push({
          key: "anomaly:data_stale",
          level: "warn",
          title: "⏸️ 页面数据长时间未更新（断流提醒）",
          summary: `已连续 ${Math.floor(idleMin)} 分钟未检测到任何 ROI/消耗数据变动，可能已断流或未开启刷新`,
        });
      }
    }

    healthState.activeAnomalies = detected;

    if (detected.length > 0) {
      const top = detected[0];
      updateHealthBox(top.level, `异常：${top.summary}`);
      for (const item of detected) {
        triggerAnomalyAlert(item);
      }
    } else {
      const idleSec = healthState.lastDataChangeAt ? Math.floor((now - healthState.lastDataChangeAt) / 1000) : 0;
      const idleText = healthState.lastDataChangeAt
        ? idleSec < 60
          ? `${idleSec}秒前有数据更新`
          : `${Math.floor(idleSec / 60)}分钟前有数据更新`
        : "已启动健康监测";
      updateHealthBox("ok", `页面健康：正常（${idleText}）`);
    }

    return detected;
  }

  function updateHealthBox(level, text) {
    const box = $("healthStatusBox");
    if (!box) return;
    box.textContent = text;
    box.className = `health-bar${level === "warn" ? " warn" : level === "error" ? " error" : ""}`;
  }

  // ---------- 跨刷新/多标签持久化冷却表（修掉刷新重推，按自然日自动清理） ----------
  let lastCooldownSyncTs = 0;

  function getLocalDayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function pruneCooldownMap() {
    const today = getLocalDayKey();
    const now = Date.now();
    for (const [k, v] of cooldownMap.entries()) {
      if (!v || !v.ts || (v.day && v.day !== today) || now - v.ts > 24 * 60 * 60 * 1000) {
        cooldownMap.delete(k);
      }
    }
  }

  function persistCooldownMap() {
    pruneCooldownMap();
    const today = getLocalDayKey();
    const entries = {};
    for (const [k, v] of cooldownMap.entries()) {
      entries[k] = { ts: v.ts, count: v.count || 1, direction: v.direction || "", day: v.day || today };
    }
    const payload = { day: today, updatedAt: Date.now(), entries };
    lastCooldownSyncTs = payload.updatedAt;
    try {
      window.localStorage.setItem(COOLDOWN_BACKUP_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    if (isExtensionAlive() && chrome.storage?.local) {
      try {
        chrome.storage.local.set({ [COOLDOWN_STORAGE_KEY]: payload });
      } catch {
        // ignore
      }
    }
  }

  function clearPersistedCooldowns() {
    cooldownMap.clear();
    const payload = { day: getLocalDayKey(), updatedAt: Date.now(), entries: {} };
    lastCooldownSyncTs = payload.updatedAt;
    try {
      window.localStorage.setItem(COOLDOWN_BACKUP_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    if (isExtensionAlive() && chrome.storage?.local) {
      try {
        chrome.storage.local.set({ [COOLDOWN_STORAGE_KEY]: payload });
      } catch {
        // ignore
      }
    }
  }

  function applyCooldownPayload(payload) {
    if (!payload || typeof payload !== "object") return;
    const today = getLocalDayKey();
    if (payload.day && payload.day !== today) return;
    const entries = payload.entries && typeof payload.entries === "object" ? payload.entries : {};
    const now = Date.now();
    for (const [k, v] of Object.entries(entries)) {
      if (!v || !v.ts || now - v.ts > 24 * 60 * 60 * 1000) continue;
      const prev = cooldownMap.get(k);
      if (!prev || v.ts > prev.ts || (v.count || 0) > (prev.count || 0)) {
        cooldownMap.set(k, {
          ts: Number(v.ts),
          count: Number(v.count || 1),
          direction: String(v.direction || ""),
          day: v.day || today,
        });
      }
    }
  }

  async function hydrateCooldownMap() {
    let localPayload = null;
    try {
      const raw = window.localStorage.getItem(COOLDOWN_BACKUP_KEY);
      if (raw) localPayload = JSON.parse(raw);
    } catch {
      // ignore
    }
    let storagePayload = null;
    if (isExtensionAlive() && chrome.storage?.local) {
      storagePayload = await new Promise((resolve) => {
        try {
          chrome.storage.local.get([COOLDOWN_STORAGE_KEY], (res) => {
            if (chrome.runtime?.lastError) resolve(null);
            else resolve(res?.[COOLDOWN_STORAGE_KEY] || null);
          });
        } catch {
          resolve(null);
        }
      });
    }
    if (localPayload) applyCooldownPayload(localPayload);
    if (storagePayload) applyCooldownPayload(storagePayload);
    pruneCooldownMap();
    lastCooldownSyncTs = Math.max(Number(localPayload?.updatedAt || 0), Number(storagePayload?.updatedAt || 0));
  }

  function triggerAnomalyAlert(item) {
    const cooldownMs = Math.max(5, Number(config.cooldownMinutes || 10)) * 60 * 1000;
    const last = cooldownMap.get(item.key);
    const now = Date.now();
    if (last && now - last.ts < cooldownMs) {
      return;
    }
    cooldownMap.set(item.key, { ts: now, count: (last?.count || 0) + 1, direction: item.level, day: getLocalDayKey() });
    persistCooldownMap();

    const detailLines = [
      `检测时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      ...(item.snippet ? [`异常片段：${item.snippet}`] : []),
      `当前页面：${document.title || location.pathname}`,
    ];

    playBeep(item.level);
    pushLog(item.level, `${item.title} - ${item.summary}`);
    dispatchToBackground({
      title: item.title,
      summary: item.summary,
      detailLines,
      level: item.level,
    });
  }

  // ---------- 同轮多计划合并推送（减少刷屏与通道限流） ----------
  function flushAlertBatch(batchQueue) {
    if (!Array.isArray(batchQueue) || batchQueue.length === 0) return;
    const groups = new Map();
    for (const item of batchQueue) {
      const gKey = item.category;
      if (!groups.has(gKey)) groups.set(gKey, []);
      groups.get(gKey).push(item);
    }

    const groupTitleMap = {
      low: "⚠️ ROI 跌破下限提醒",
      high: "🔥 ROI 突破上限提醒",
      cost_hit: "🚨 计划预算已满（请加预算）",
      cost_warn: "⚡ 计划预算不足（请加预算）",
      expired: "⚠️ 计划已过保提醒（防跑偏/跑飞）",
    };

    const timeStr = new Date().toLocaleString("zh-CN", { hour12: false });
    for (const [category, items] of groups.entries()) {
      if (items.length === 1) {
        const it = items[0];
        playBeep(it.beepLevel);
        pushLog(it.logLevel, it.summary);
        dispatchToBackground({
          title: it.title,
          summary: it.summary,
          detailLines: it.detailLines,
          level: it.pushLevel,
        });
        continue;
      }

      const first = items[0];
      const baseTitle = groupTitleMap[category] || first.title;
      const title = `${baseTitle}（共 ${items.length} 条）`;
      const previewNames = items
        .slice(0, 3)
        .map((it) => it.shortLabel || it.label)
        .join("、");
      const summary = `${previewNames}${items.length > 3 ? ` 等 ${items.length} 条计划` : ""} 触发${baseTitle.replace(/^[^\u4e00-\u9fa5]+/, "")}`;
      const detailLines = [
        `触发时间：${timeStr}`,
        ...items.slice(0, 10).map((it, idx) => `${idx + 1}. ${it.compactLine || it.summary}`),
        ...(items.length > 10 ? [`…其余 ${items.length - 10} 条请查看面板「异常/重点计划明细」`] : []),
        `页面标题：${document.title || "监控页面"}`,
      ];

      playBeep(first.beepLevel);
      pushLog(first.logLevel, `${title}：${previewNames}${items.length > 3 ? "等" : ""}`);
      dispatchToBackground({
        title,
        summary,
        detailLines,
        level: first.pushLevel,
      });
    }
  }

  // ---------- 阈值判断与推送（跌破/突破独立冷却 + 临界点防抖 + 持久化不因刷新重推） ----------
  function checkAndAlert(targetKey, label, roiVal, extraLines = [], batchQueue = null) {
    const lower = config.lowerLimit !== "" && config.lowerLimit !== null ? Number(config.lowerLimit) : null;
    const upper = config.upperLimit !== "" && config.upperLimit !== null ? Number(config.upperLimit) : null;

    let direction = null;
    let threshold = null;
    if (lower !== null && Number.isFinite(lower) && roiVal < lower) {
      direction = "low";
      threshold = lower;
    } else if (upper !== null && Number.isFinite(upper) && roiVal > upper) {
      direction = "high";
      threshold = upper;
    }

    if (!direction) return "ok";

    // 按推送触发复选框过滤：未勾选的方向仅做页面/明细标亮，不发推送不响铃
    if (direction === "low" && config.pushOnLow === false) {
      return direction;
    }
    if (direction === "high" && config.pushOnHigh === false) {
      return direction;
    }

    // 分方向独立键 + 严格锁满冷却时间（避免临界点 1.49↔1.51 反复横跳刷屏，也免疫页面刷新重推）
    const cdKey = `${targetKey}:${direction}`;
    const cdMin =
      direction === "low"
        ? Math.max(1, Number(config.lowCooldownMin ?? 30))
        : Math.max(1, Number(config.highCooldownMin ?? 30));
    const cooldownMs = cdMin * 60 * 1000;
    const last = cooldownMap.get(cdKey);
    const now = Date.now();
    if (last && now - last.ts < cooldownMs) {
      return direction;
    }
    cooldownMap.set(cdKey, { ts: now, count: (last?.count || 0) + 1, direction, day: getLocalDayKey() });
    persistCooldownMap();

    const isLow = direction === "low";
    const title = isLow ? "⚠️ ROI 跌破下限提醒" : "🔥 ROI 突破上限提醒";
    const summary = `${label} 当前 ROI = ${roiVal}（${isLow ? `低于下限 ${threshold}` : `高于上限 ${threshold}`}）`;
    const detailLines = [
      `触发时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      ...extraLines,
      `冷却策略：同类 ${cdMin} 分钟内不重复推送`,
      `页面标题：${document.title || "监控页面"}`,
    ];

    const alertObj = {
      category: direction,
      label,
      shortLabel: label.replace(/^计划「|」$/g, ""),
      title,
      summary,
      compactLine: `${label} ROI=${roiVal}（${isLow ? `<${threshold}` : `>${threshold}`}）${extraLines[0] ? ` · ${extraLines[0]}` : ""}`,
      detailLines,
      beepLevel: direction,
      logLevel: direction,
      pushLevel: direction,
    };

    if (batchQueue && config.mergeBatchAlerts !== false) {
      batchQueue.push(alertObj);
    } else {
      playBeep(direction);
      pushLog(direction, summary);
      dispatchToBackground({ title, summary, detailLines, level: direction });
    }

    return direction;
  }

  // ---------- 消耗即将撞线 / 已撞线 判断与推送（紧急高频推送，默认每3分钟催一次直到加预算） ----------
  function checkAndAlertCost(targetKey, label, costVal, capVal, extraLines = [], batchQueue = null) {
    if (!config.costAlertEnabled) return { state: "ok", pct: 0 };
    if (costVal === null || capVal === null || !Number.isFinite(costVal) || !Number.isFinite(capVal) || capVal <= 0) {
      return { state: "ok", pct: 0 };
    }
    const warnPct = Math.max(1, Math.min(100, Number(config.budgetWarnPercent || 80)));
    const pct = (costVal / capVal) * 100;
    if (pct < warnPct) return { state: "ok", pct };

    const isHit = pct >= 100;
    const state = isHit ? "cost_hit" : "cost_warn";

    // 若关闭了“消耗撞线推送”，仅在页面和明细中标亮，不发推送不响铃
    if (config.pushOnCost === false) {
      return { state, pct };
    }

    // 即将撞线(80%)与已撞线(100%)分键冷却：80%提醒后，真正到100%仍立即强提醒一次；默认每3分钟急推一次（最低1分钟防限流）
    const cdKey = `${targetKey}:${state}`;
    const cdMin = Math.max(1, Number(config.costCooldownMin ?? 3));
    const cooldownMs = cdMin * 60 * 1000;
    const last = cooldownMap.get(cdKey);
    const now = Date.now();
    if (last && now - last.ts < cooldownMs) {
      return { state, pct };
    }
    cooldownMap.set(cdKey, { ts: now, count: (last?.count || 0) + 1, direction: state, day: getLocalDayKey() });
    persistCooldownMap();

    const remain = Math.max(0, capVal - costVal);
    const title = isHit ? "🚨 计划预算已满（请加预算）" : "⚡ 计划预算不足（请加预算）";
    const summary = isHit
      ? `${label} 消耗已达 ${formatCostDisplay(costVal)} / 预算 ${formatCostDisplay(capVal)}（${pct.toFixed(1)}%，预算已用满，请及时加预算）`
      : `${label} 消耗 ${formatCostDisplay(costVal)} / 预算 ${formatCostDisplay(capVal)}（已烧 ${pct.toFixed(1)}%，仅剩 ${formatCostDisplay(remain)}，请及时加预算）`;
    const detailLines = [
      `触发时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      `预算预警比例：${warnPct}%（紧急提醒每 ${cdMin} 分钟一次，加预算后自动停止）`,
      ...extraLines,
      `页面标题：${document.title || "监控页面"}`,
    ];

    const alertObj = {
      category: state,
      label,
      shortLabel: label.replace(/^计划「|」$/g, ""),
      title,
      summary,
      compactLine: `${label} 已烧 ${pct.toFixed(0)}%（${formatCostDisplay(costVal)}/${formatCostDisplay(capVal)}）`,
      detailLines,
      beepLevel: isHit ? "low" : "warn",
      logLevel: isHit ? "low" : "warn",
      pushLevel: isHit ? "error" : "warn",
    };

    if (batchQueue && config.mergeBatchAlerts !== false) {
      batchQueue.push(alertObj);
    } else {
      playBeep(alertObj.beepLevel);
      pushLog(alertObj.logLevel, summary);
      dispatchToBackground({ title, summary, detailLines, level: alertObj.pushLevel });
    }

    return { state, pct };
  }

  // ---------- 千川账户可用余额不足提醒（每 30 分钟内最多推一次，提醒及时充值防断流） ----------
  function checkAndAlertBalance(balanceVal, thresholdVal, label = "千川可用余额") {
    if (!config.balanceAlertEnabled) return "ok";
    if (balanceVal === null || !Number.isFinite(balanceVal) || !Number.isFinite(thresholdVal) || thresholdVal <= 0) {
      return "ok";
    }
    if (balanceVal > thresholdVal) return "ok";

    const cdKey = "account_balance:low";
    const cooldownMs = 30 * 60 * 1000;
    const last = cooldownMap.get(cdKey);
    const now = Date.now();
    if (last && now - last.ts < cooldownMs) {
      return "warn";
    }
    cooldownMap.set(cdKey, { ts: now, count: (last?.count || 0) + 1, direction: "warn", day: getLocalDayKey() });
    persistCooldownMap();

    const title = "💰 千川可用余额不足，记得充值！";
    const summary = `${label} 仅剩 ${formatCostDisplay(balanceVal)}（低于预警线 ${formatCostDisplay(thresholdVal)}），请及时充值防止在投计划断流`;
    const detailLines = [
      `检测时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      `提醒冷却：30 分钟内不重复推送`,
      `页面标题：${document.title || "监控页面"}`,
    ];
    playBeep("low");
    pushLog("low", summary);
    dispatchToBackground({ title, summary, detailLines, level: "error" });
    return "low";
  }

  // ---------- 过保计划可选提醒（有计划过保当天只推送 1 次，跨刷新记忆不重复轰炸） ----------
  function checkAndAlertExpired(targetKey, label, guaranteeState, extraLines = [], batchQueue = null) {
    if (!config.pushOnExpired) return;
    const cdKey = `expired:${targetKey}`;
    const last = cooldownMap.get(cdKey);
    const now = Date.now();
    const prevCount = Number(last?.count || 0);
    if (prevCount >= 1) return;

    cooldownMap.set(cdKey, { ts: now, count: 1, direction: "expired", day: getLocalDayKey() });
    persistCooldownMap();

    const tagText = guaranteeState === "expired" ? "已过赔付保障期（灰保）" : "无赔付保障（过保）";
    const title = "⚠️ 计划已过保提醒（防跑偏/跑飞）";
    const summary = `${label} 当前${tagText}，建议重点盯盘防止跑偏跑飞`;
    const detailLines = [
      `检测时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      ...extraLines,
      `页面标题：${document.title || "监控页面"}`,
    ];

    const alertObj = {
      category: "expired",
      label,
      shortLabel: label.replace(/^计划「|」$/g, ""),
      title,
      summary,
      compactLine: `${label} ${tagText}${extraLines[0] ? ` · ${extraLines[0]}` : ""}`,
      detailLines,
      beepLevel: "warn",
      logLevel: "warn",
      pushLevel: "warn",
    };

    if (batchQueue && config.mergeBatchAlerts !== false) {
      batchQueue.push(alertObj);
    } else {
      playBeep("warn");
      pushLog("warn", summary);
      dispatchToBackground({ title, summary, detailLines, level: "warn" });
    }
  }

  // ---------- 趋势采样器（每分钟记录一次快照，支撑近30分钟趋势预判、单计划涨跌与预计撞墙倒计时） ----------
  function recordTrendSample(displayRoi, effectiveCost, rows, roiSource = "overall") {
    const now = Date.now();
    const list = healthState.trendSamples;
    const last = list[list.length - 1];
    if (last && now - last.ts < 55000 && last.roiSource === roiSource) return;
    const planMap = {};
    for (const r of (rows || []).slice(0, 120)) {
      if (r.id) {
        planMap[r.id] = { roi: r.roi, cost: r.cost };
      }
    }
    list.push({ ts: now, displayRoi, roiSource, effectiveCost, planMap });
    const cutoff = now - 40 * 60 * 1000;
    while (list.length > 0 && list[0].ts < cutoff) {
      list.shift();
    }
    if (list.length > 45) list.splice(0, list.length - 45);
  }

  function renderSummaryCardInPanel({ engineType, engineLabel, metaText, bodyText }) {
    const badge = $("summaryEngineBadge");
    const metaEl = $("summaryReportMeta");
    const bodyEl = $("summaryReportContent");
    if (badge) {
      badge.textContent = engineLabel || "内置规则引擎";
      badge.className = `engine-pill${engineType === "ai" ? " ai" : ""}`;
    }
    if (metaEl && metaText) {
      metaEl.textContent = metaText;
    }
    if (bodyEl && bodyText !== undefined) {
      bodyEl.textContent = bodyText;
      healthState.latestSummaryText = bodyText;
    }
  }

  function syncAiEngineBadge() {
    const badge = $("summaryEngineBadge");
    if (!badge) return;
    const hasKey = Boolean(String(config.aiApiKey || "").trim());
    if (hasKey) {
      const pName =
        config.aiProvider === "doubao"
          ? "豆包 AI"
          : config.aiProvider === "zhipu"
            ? "智谱 AI"
            : config.aiProvider === "deepseek"
              ? "DeepSeek AI"
              : config.aiProvider === "qwen"
                ? "通义 AI"
                : config.aiProvider === "siliconflow"
                  ? "硅基 AI"
                  : "自定义 AI";
      badge.textContent = pName;
      badge.className = "engine-pill ai";
    } else {
      badge.textContent = "内置规则引擎";
      badge.className = "engine-pill";
    }
  }

  // ---------- 定时 / 手动「投流总结报告」（面板内直显 + 手机推送；有AI Key走豆包/DeepSeek等深度诊断，无Key走内置千川趋势规则） ----------
  async function buildAndSendSummaryReport(options = {}) {
    // 兼容旧调用方式 buildAndSendSummaryReport(true/false)
    const opts = typeof options === "boolean" ? { isManual: options, shouldPush: true } : options;
    const isManual = Boolean(opts.isManual);
    const shouldPush = opts.shouldPush !== false;

    if (healthState.isGeneratingSummary) return;
    healthState.isGeneratingSummary = true;

    try {
      const snap = healthState.latestEvalSnapshot;
      const now = Date.now();
      const intervalMin = Math.max(5, Number(config.summaryIntervalMin || 30));

      let overallRoi = snap?.overallRoi ?? null;
      let overallRoiLabel = snap?.overallRoiLabel || "整体 ROI";
      let overallCost = snap?.overallCost ?? null;
      let overallCostLabel = snap?.overallCostLabel || "整体消耗";
      let rows = snap?.filteredRows || null;
      let abnormal = snap?.abnormalItems || [];
      let scanMeta = snap?.scanMeta || healthState.lastScanMeta;

      if (!rows) {
        const autoRoi = autoFindRoiElement();
        if (autoRoi) {
          overallRoi = parseMetricNumber(autoRoi.value);
          overallRoiLabel = autoRoi.label || "整体 ROI";
        }
        const autoCost = autoFindOverallCostElement();
        if (autoCost) {
          overallCost = autoCost.value;
          overallCostLabel = autoCost.label || "整体消耗";
        }
        const scanned = scanCampaignTables();
        scanMeta = scanned.meta;
        const wantDel = Boolean(config.onlyDelivering);
        const wantReg = Boolean(config.onlyRegulating);
        rows = (scanned.rows || []).filter((r) => {
          if (!wantDel && !wantReg) return true;
          const st = String(r.status || "");
          return (wantDel && /投放中/.test(st)) || (wantReg && /调控中/.test(st));
        });
        abnormal = allAbnormalItems || [];
      }

      const isLiveControlScene =
        location.pathname.includes("/overall-prom/detail") ||
        /调控/.test(scanMeta?.roiHeader || "") ||
        /调控/.test(scanMeta?.costHeader || "") ||
        rows.some((r) => /调控中/.test(String(r.status || "")));
      const sceneName = isLiveControlScene ? "直播调控" : "商品卡投流";
      const unitWord = isLiveControlScene ? "条调控任务" : "条计划";

      const lowItems = abnormal.filter((i) => i.direction === "low").sort((a, b) => a.roi - b.roi);
      const highItems = abnormal.filter((i) => i.direction === "high").sort((a, b) => b.roi - a.roi);
      const costItems = abnormal
        .filter((i) => i.direction === "cost_warn" || i.direction === "cost_hit")
        .sort((a, b) => (b.budgetPct || 0) - (a.budgetPct || 0));
      const expiredItems = abnormal.filter((i) => i.direction === "expired");

      const validRoiRows = rows.filter((r) => r.roi !== null);
      const totalRowCost = rows.reduce((acc, r) => acc + (r.cost || 0), 0);
      const budgetRows = rows.filter((r) => r.budget && r.budget > 0);
      const totalRowBudget = budgetRows.reduce((acc, r) => acc + (r.budget || 0), 0);
      const effectiveCost = isLiveControlScene
        ? totalRowCost > 0 ? totalRowCost : overallCost
        : overallCost !== null ? overallCost : totalRowCost > 0 ? totalRowCost : null;
      const weightedRoi =
        validRoiRows.length > 0
          ? Math.round((validRoiRows.reduce((acc, r) => acc + r.roi, 0) / validRoiRows.length) * 100) / 100
          : null;
      const displayRoi = overallRoi !== null ? overallRoi : weightedRoi;
      const displayRoiLabel = overallRoi !== null ? overallRoiLabel : isLiveControlScene ? "调控均ROI" : "列表均ROI";

      // 寻找最早对比基准（优先 30 分钟内最早的趋势点或上一次总结快照）
      const oldestSample = healthState.trendSamples[0] || null;
      const prev = oldestSample || healthState.lastSummarySnapshot;
      const elapsedMin = prev ? Math.max(1, Math.round((now - prev.ts) / 60000)) : 0;
      const roiDiff = prev && displayRoi !== null && prev.displayRoi !== null ? displayRoi - prev.displayRoi : null;
      const costDiff =
        prev && effectiveCost !== null && prev.effectiveCost !== null ? effectiveCost - prev.effectiveCost : null;

      // 判断大盘走势与后续预判
      let trendWord = "数据刚采集中（持续运行约10分钟后给出精准走势）";
      let forecastWord = "建议继续观察15~30分钟趋势变化";
      if (roiDiff !== null && elapsedMin >= 2) {
        if (roiDiff >= 0.15) {
          trendWord = `📈 明显走高（近${elapsedMin}分 +${roiDiff.toFixed(2)}）`;
          forecastWord = "大盘正处于放量上升通道，后续有望继续跑高，可顺势给高ROI优质计划补预算放量";
        } else if (roiDiff <= -0.15) {
          trendWord = `📉 明显走弱（近${elapsedMin}分 ${roiDiff.toFixed(2)}）`;
          forecastWord = "大盘出现下滑惯性，如不及时压低或关停低ROI计划，接下来半小时大概率继续被拉低";
        } else {
          trendWord = `➡️ 窄幅平稳（近${elapsedMin}分 ${roiDiff >= 0 ? "+" : ""}${roiDiff.toFixed(2)}）`;
          forecastWord = "整体走势平稳，保持当前出价节奏，重点防预算打满断流即可";
        }
      }

      // 单计划走势辅助标注
      const getPlanTrendTag = (planId, curRoi) => {
        if (!oldestSample || !oldestSample.planMap || !oldestSample.planMap[planId] || curRoi === null) return "";
        const oldRoi = oldestSample.planMap[planId].roi;
        if (oldRoi === null || oldRoi === undefined) return "";
        const d = curRoi - oldRoi;
        if (Math.abs(d) < 0.08) return "";
        return d > 0 ? ` 📈${oldRoi}→${curRoi}` : ` 📉${oldRoi}→${curRoi}`;
      };

      // 单计划预计撞墙时间估算
      const getBudgetEtaTag = (item) => {
        if (!oldestSample || !oldestSample.planMap || elapsedMin < 2) return "";
        const baseId = String(item.id || "").replace(/:cost$/, "");
        const oldCost = oldestSample.planMap[baseId]?.cost;
        if (oldCost === null || oldCost === undefined || item.cost === null || !item.budget) return "";
        const burn = item.cost - oldCost;
        const remain = item.budget - item.cost;
        if (burn > 1 && remain > 0) {
          const etaMin = Math.max(1, Math.round((remain / burn) * elapsedMin));
          return etaMin <= 180 ? ` · 按增速约${etaMin}分后打满预算` : "";
        }
        return "";
      };

      // 优质好计划（高ROI异常 或 排名前列且ROI高于下限+0.5的稳定计划）
      const lowerNum = config.lowerLimit !== "" ? Number(config.lowerLimit) : 1.5;
      const goodPlanPool =
        highItems.length > 0
          ? highItems.slice(0, 3)
          : validRoiRows
              .filter((r) => r.roi >= (Number.isFinite(lowerNum) ? lowerNum + 0.3 : 2.0) && (r.cost === null || r.cost >= Number(config.minCost || 0)))
              .sort((a, b) => b.roi - a.roi)
              .slice(0, 3);

      const timeStr = new Date(now).toLocaleString("zh-CN", { hour12: false });
      const hhmm = formatTime(new Date(now)).slice(0, 5);
      const title = isManual
        ? `📊 Kamisama ${sceneName}总结（${hhmm}）`
        : `📊 Kamisama ${sceneName} ${intervalMin}分钟总结（${hhmm}）`;

      // 深度诊断增强指标：消耗流速(¥/h)、头部3条集中度、隐形失血计划（全天达标但近30分ROI骤降>=0.25）
      const burnRatePerHour =
        costDiff !== null && elapsedMin >= 2 && costDiff > 0
          ? Math.round((costDiff / elapsedMin) * 60)
          : null;
      const spendSortedRows = rows
        .filter((r) => r.cost !== null && r.cost > 0)
        .sort((a, b) => (b.cost || 0) - (a.cost || 0));
      const top3CostSum = spendSortedRows.slice(0, 3).reduce((s, r) => s + (r.cost || 0), 0);
      const top3CostSharePct =
        effectiveCost && effectiveCost > 0 ? Math.round((top3CostSum / effectiveCost) * 100) : null;
      const silentBleedPlans = [];
      if (oldestSample && oldestSample.planMap && elapsedMin >= 2) {
        validRoiRows.forEach((r) => {
          const oldP = oldestSample.planMap[r.id];
          if (!oldP || oldP.roi === null || oldP.roi === undefined) return;
          const drop = r.roi - oldP.roi;
          if (r.roi >= lowerNum && drop <= -0.25 && (r.cost === null || r.cost >= Number(config.minCost || 0))) {
            silentBleedPlans.push({
              name: r.name.slice(0, 20),
              oldRoi: oldP.roi,
              curRoi: r.roi,
              drop: Number(drop.toFixed(2)),
              cost: r.cost,
            });
          }
        });
        silentBleedPlans.sort((a, b) => a.drop - b.drop);
      }
      const curBalance = healthState.lastBalanceValue ?? null;
      const balanceHoursLeft =
        curBalance !== null && burnRatePerHour && burnRatePerHour > 50
          ? Number((curBalance / burnRatePerHour).toFixed(1))
          : null;

      // 生成极简短行、一眼看懂的内置规则报告
      const ruleLines = [];
      const costBurnStr =
        costDiff !== null && elapsedMin >= 2 ? `（近${elapsedMin}分+${formatCostDisplay(Math.max(0, costDiff))}）` : "";
      ruleLines.push(
        `📊 大盘体检`,
        `• ${displayRoiLabel}：${displayRoi ?? "--"}｜${trendWord}`,
        `• ${isLiveControlScene ? "调控消耗" : overallCostLabel}：${formatCostDisplay(effectiveCost)}${costBurnStr}｜活跃 ${rows.length} ${unitWord}`
      );
      if (curBalance !== null) {
        ruleLines.push(
          `• 可用余额：${formatCostDisplay(curBalance)}${balanceHoursLeft !== null ? `（按当前流速约撑 ${balanceHoursLeft}h）` : ""}`
        );
      }
      if (top3CostSharePct !== null && top3CostSharePct >= 55) {
        ruleLines.push(`• 集中风险：头部 3 条占总消耗 ${top3CostSharePct}%，防单计划波动`);
      }
      ruleLines.push(`• 预判：${forecastWord}`);

      ruleLines.push(`\n🔥 放量候选`);
      if (goodPlanPool.length > 0) {
        goodPlanPool.forEach((p) => {
          const cleanId = String(p.id || "").replace(/:cost|:expired$/, "");
          const trend = getPlanTrendTag(cleanId, p.roi);
          ruleLines.push(
            `• ${p.name.slice(0, 16)}｜ROI ${p.roi}${trend}${p.cost !== null ? ` · 耗${formatCostDisplay(p.cost)}` : ""} → 小幅加预算`
          );
        });
      } else {
        ruleLines.push(`• 暂无显著放量计划，建议观察或补新素材`);
      }

      ruleLines.push(`\n🚨 异常处置`);
      let hasBad = false;
      if (lowItems.length > 0) {
        hasBad = true;
        lowItems.slice(0, 3).forEach((p) => {
          const trend = getPlanTrendTag(p.id, p.roi);
          ruleLines.push(
            `• 🔴 ${p.name.slice(0, 15)}｜ROI ${p.roi}${trend}（<${p.threshold}）→ 降出价/暂停`
          );
        });
      }
      if (costItems.length > 0) {
        hasBad = true;
        costItems.slice(0, 3).forEach((p) => {
          const eta = getBudgetEtaTag(p);
          ruleLines.push(
            `• ⚡ ${p.name.slice(0, 15)}｜已烧${Math.round(p.budgetPct || 0)}%${eta} → 补预算防断流`
          );
        });
      }
      if (silentBleedPlans.length > 0) {
        hasBad = true;
        silentBleedPlans.slice(0, 2).forEach((p) => {
          ruleLines.push(
            `• ⚠️ 隐形下滑 ${p.name.slice(0, 14)}｜ROI ${p.oldRoi}→${p.curRoi} → 提前压出价`
          );
        });
      }
      if (expiredItems.length > 0) {
        hasBad = true;
        const expNames = expiredItems.slice(0, 3).map((p) => p.name.slice(0, 12)).join("、");
        ruleLines.push(`• 🟡 灰保过保(${expiredItems.length}条)：${expNames} → 重点盯防跑偏`);
      }
      if (!hasBad) {
        ruleLines.push(`• 当前无跌破、撞墙或过保风险，运行健康`);
      }

      const actions = [];
      if (lowItems.length > 0) actions.push(`1. P0：止损/降价 ${lowItems.length} 条跌破下限计划`);
      if (costItems.length > 0) actions.push(`${actions.length + 1}. P0：给 ${costItems.length} 条预算不足计划补预算`);
      if (silentBleedPlans.length > 0) actions.push(`${actions.length + 1}. P1：排查 ${silentBleedPlans.length} 条近${elapsedMin}分隐形下滑计划`);
      if (goodPlanPool.length > 0) actions.push(`${actions.length + 1}. P1：对 Top ${goodPlanPool.length} 高ROI计划加预算放量`);
      if (expiredItems.length > 0) actions.push(`${actions.length + 1}. P2：紧盯 ${expiredItems.length} 条灰保已过保计划`);
      ruleLines.push(
        `\n🎯 立刻执行`,
        ...(actions.length > 0 ? actions : [`1. 保持当前出价与预算节奏，继续盯盘`])
      );

      const ruleReportText = ruleLines.join("\n");
      let finalReportText = ruleReportText;
      let usedEngineType = "rule";
      let usedEngineLabel = "内置规则引擎";

      // 若配置了 AI API Key，优先调用国内大模型生成趋势预判与深度投流建议（失败则无缝兜底内置规则报告）
      const hasAiKey = Boolean(String(config.aiApiKey || "").trim());
      if (hasAiKey && isExtensionAlive()) {
        renderSummaryCardInPanel({
          engineType: "ai",
          engineLabel: "AI 分析中...",
          metaText: `${timeStr} · 正在调用 AI 生成${sceneName}深度诊断...`,
          bodyText: "⏳ 正在将大盘流速、余额、集中度与优劣计划发送给 AI 大模型诊断，请稍候...",
        });

        const metricsData = {
          scene: sceneName,
          time: timeStr,
          thresholds: {
            roiLower: config.lowerLimit,
            roiUpper: config.upperLimit,
            budgetWarnPct: config.budgetWarnPercent,
            balanceWarnLine: config.balanceWarnThreshold ?? null,
          },
          overall: {
            roiLabel: displayRoiLabel,
            roi: displayRoi,
            roiDelta: roiDiff !== null ? Number(roiDiff.toFixed(2)) : null,
            elapsedMinutes: elapsedMin,
            cost: effectiveCost,
            costDelta: costDiff !== null ? Number(costDiff.toFixed(2)) : null,
            burnRatePerHour,
            accountBalance: curBalance,
            balanceHoursLeft,
            top3CostSharePct,
            totalBudget: totalRowBudget > 0 ? totalRowBudget : null,
            activeCount: rows.length,
          },
          topSpendPlans: spendSortedRows.slice(0, 5).map((p) => ({
            name: p.name.slice(0, 20),
            cost: p.cost,
            costSharePct: effectiveCost > 0 ? Math.round(((p.cost || 0) / effectiveCost) * 100) : null,
            roi: p.roi,
            budgetPct: p.budget ? Math.round(((p.cost || 0) / p.budget) * 100) : null,
            trend: getPlanTrendTag(p.id, p.roi).trim(),
          })),
          silentBleedPlans: silentBleedPlans.slice(0, 4),
          goodPlans: goodPlanPool.map((p) => ({
            name: p.name.slice(0, 22),
            roi: p.roi,
            cost: p.cost,
            trend: getPlanTrendTag(String(p.id || "").replace(/:cost|:expired$/, ""), p.roi).trim(),
          })),
          badLowRoiPlans: lowItems.slice(0, 5).map((p) => ({
            name: p.name.slice(0, 22),
            roi: p.roi,
            cost: p.cost,
            trend: getPlanTrendTag(p.id, p.roi).trim(),
          })),
          budgetWallPlans: costItems.slice(0, 5).map((p) => ({
            name: p.name.slice(0, 22),
            cost: p.cost,
            budget: p.budget,
            pct: Math.round(p.budgetPct || 0),
            eta: getBudgetEtaTag(p).trim(),
          })),
          grayExpiredPlans: expiredItems.slice(0, 5).map((p) => ({
            name: p.name.slice(0, 22),
            roi: p.roi,
            cost: p.cost,
          })),
        };

        const aiResp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              {
                type: "GENERATE_AI_SUMMARY",
                payload: {
                  aiConfig: {
                    provider: config.aiProvider || "doubao",
                    apiKey: config.aiApiKey,
                    model: config.aiModel,
                    endpoint: config.aiEndpoint,
                  },
                  metricsData,
                },
              },
              (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "无响应" })
            );
          } catch (e) {
            resolve({ ok: false, error: String(e) });
          }
        });

        if (aiResp && aiResp.ok && aiResp.text) {
          finalReportText = aiResp.text;
          usedEngineType = "ai";
          usedEngineLabel = `AI · ${aiResp.providerName || "大模型"}`;
        } else {
          usedEngineType = "rule";
          usedEngineLabel = "规则兜底(AI未通)";
          finalReportText = `[AI 调用失败已自动切内置规则：${aiResp?.error || "请检查Key/模型ID"}]\n\n${ruleReportText}`;
        }
      }

      // 更新面板内直显总结卡片
      renderSummaryCardInPanel({
        engineType: usedEngineType,
        engineLabel: usedEngineLabel,
        metaText: `${timeStr} · ${sceneName} · 活跃${rows.length}条（跌破${lowItems.length}/预算${costItems.length}/灰保${expiredItems.length}/高ROI${highItems.length}）`,
        bodyText: finalReportText,
      });

      // 更新周期快照与下次汇报时间
      if (shouldPush) {
        healthState.lastSummaryAt = now;
        healthState.lastSummarySnapshot = { ts: now, displayRoi, effectiveCost, activeCount: rows.length };
        updateSummaryNextHint();

        const compactSummary = `${displayRoiLabel} ${displayRoi ?? "--"} | ${isLiveControlScene ? "调控耗" : "耗"} ${formatCostDisplay(effectiveCost)} | 跌破${lowItems.length}·预算${costItems.length}·灰保${expiredItems.length}·高ROI${highItems.length}`;
        const pushLines = finalReportText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 14);
        pushLog("ok", `${title}（${usedEngineLabel}）`);
        dispatchToBackground(
          { title, summary: compactSummary, detailLines: pushLines, level: lowItems.length > 0 ? "warn" : "high" },
          isManual
        );
      } else if (isManual) {
        showToast(`总结报告已在面板刷新（${usedEngineLabel}）`, 2400);
      }
    } finally {
      healthState.isGeneratingSummary = false;
    }
  }

  function updateSummaryNextHint() {
    const el = $("summaryNextHint");
    if (!el) return;
    const intervalMin = Math.max(5, Number(config.summaryIntervalMin || 30));
    if (!config.summaryReportEnabled) {
      el.textContent = "投流总结：已关闭（可点「立即汇报」手动发送）";
      return;
    }
    if (!config.enabled) {
      el.textContent = `投流总结：启动监控后每 ${intervalMin} 分钟自动推送一次`;
      return;
    }
    const baseTs = healthState.lastSummaryAt || healthState.monitorStartedAt || Date.now();
    const nextTime = new Date(baseTs + intervalMin * 60 * 1000).toTimeString().slice(0, 5);
    el.textContent = `投流总结：每 ${intervalMin} 分钟自动推送（下次约 ${nextTime}）`;
  }

  function dispatchToBackground({ title, summary, detailLines, level }, isTest = false) {
    const channels = {
      desktop: config.desktopEnabled,
      wecomWebhook: config.wecomWebhook,
      wecomMobiles: config.wecomMobiles,
      pushplusToken: config.pushplusToken,
      customWebhook: config.customWebhook,
      barkUrl: config.barkUrl,
    };

    chrome.runtime.sendMessage(
      {
        type: "DISPATCH_ALERT",
        payload: { title, summary, detailLines, level, channels },
      },
      (resp) => {
        if (chrome.runtime.lastError) {
          const msg = `推送通信异常：${chrome.runtime.lastError.message}`;
          if (isTest) showToast(msg, 5000);
          pushLog("low", msg);
          return;
        }
        const results = resp?.results || [];
        if (results.length === 0) {
          if (isTest) showToast("未开启任何推送渠道，请先勾选桌面通知或填写 Webhook/Token", 4500);
          return;
        }
        const summaryText = results
          .map((r) => `${r.channel}:${r.ok ? "成功" : `失败(${r.error})`}`)
          .join(" | ");
        if (isTest) {
          showToast(`测试推送结果 → ${summaryText}`, 5500);
          pushLog("ok", `测试推送 → ${summaryText}`);
        } else {
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) {
            pushLog("low", `部分推送失败 → ${summaryText}`);
          }
        }
      }
    );
  }

  // ---------- 核心评估函数（秒级回调 + 轮询兜底） ----------
  function mergeStatus(a, b) {
    const rank = { error: 5, low: 4, high: 3, ok: 2, warn: 1, idle: 0 };
    return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
  }

  function evaluateNow() {
    if (!config.enabled) return;

    // 检测 SPA 路由切换，自动刷新当前页绑定展示并清空旧页面的趋势基线与大盘缓存（避免跨页算错涨跌幅）
    const curPageKey = getPageBindingKey();
    if (healthState.lastPageKey && healthState.lastPageKey !== curPageKey) {
      healthState.lastPageKey = curPageKey;
      healthState.lastAutoBindAt = 0;
      healthState.trendSamples = [];
      healthState.lastSummarySnapshot = null;
      healthState.lastOverallRoi = null;
      healthState.lastOverallRoiAt = 0;
      healthState.lastOverallCost = null;
      healthState.lastOverallCostAt = 0;
      renderSelectorPreview();
    } else if (!healthState.lastPageKey) {
      healthState.lastPageKey = curPageKey;
    }

    const wantSingle = config.mode === "both" || config.mode === "single";
    const wantTable = config.mode === "both" || config.mode === "table";

    let singleStatus = "idle";
    let singleValueText = "--";
    let singleSubText = "";
    const batchQueue = [];
    let singleValid = false;
    let singleFp = "";
    let singleNumericVal = null;
    let singleLabelText = "整体 ROI";

    if (wantSingle) {
      let binding = getActivePageBinding();
      let el = binding.selector ? document.querySelector(binding.selector) : null;
      // 防止千川乘方切换「商品视图 / 计划视图 / 直播」导致同位置卡片变成「整体消耗」等其他指标：校验所在指标卡标题
      if (el && binding.label && /ROI/i.test(binding.label)) {
        const hostCard = el.closest?.(".aurora-qc-statistic, .oc-promotion-metric-card, .oc-statistic");
        if (hostCard) {
          const cardTitleEl = hostCard.querySelector(
            "[data-testid='metric-card-title-region'], .aurora-qc-statistic-title, .oc-statistic-title, [class*='title']"
          );
          const cardTitle = normalizeText(cardTitleEl?.getAttribute?.("title") || cardTitleEl?.innerText || cardTitleEl?.textContent);
          if (cardTitle && !/ROI/i.test(cardTitle)) {
            el = null;
            healthState.lastAutoBindAt = 0; // 立刻重探正确卡片
          }
        }
      }
      let val = el ? parseMetricNumber(readElementMetricText(el)) : null;

      // 当前页未绑定、切页后失效、异步加载中或误绑到值为 0 的节点时，每 3 秒自动重探真正的整体 ROI 指标卡
      if (!el || val === null || val === 0) {
        const nowTs = Date.now();
        if (nowTs - healthState.lastAutoBindAt >= 3000) {
          healthState.lastAutoBindAt = nowTs;
          const found = autoFindRoiElement();
          const foundNum = found ? parseMetricNumber(found.value) : null;
          if (found && (val === null || (foundNum !== null && foundNum > 0))) {
            setActivePageBinding(found.selector, found.label);
            binding = { selector: found.selector, label: found.label };
            el = found.el;
            val = foundNum;
          }
        }
      }

      if (val !== null && val > 0) {
        const label = (binding.label || "整体 ROI").replace(/\s*(重要|核心|推荐|新)$/g, "").trim() || "整体 ROI";
        healthState.lastOverallRoi = val;
        healthState.lastOverallRoiLabel = label;
        healthState.lastOverallRoiAt = Date.now();
        singleStatus = checkAndAlert("single_roi", label, val, [], batchQueue);
        singleValueText = String(val);
        singleSubText = `${label}: ${val}`;
        singleValid = true;
        singleFp = `S:${val}`;
        singleNumericVal = val;
        singleLabelText = label;
      } else if (healthState.lastOverallRoi !== null && healthState.lastOverallRoi > 0 && Date.now() - healthState.lastOverallRoiAt <= 15000) {
        // 防闪烁缓冲：滚动页面把顶部大盘滚出视口或前端短暂加载返回 0 时，15秒内保持上次有效整体ROI不乱闪
        const label = healthState.lastOverallRoiLabel || "整体 ROI";
        singleStatus = "ok";
        singleValueText = String(healthState.lastOverallRoi);
        singleSubText = `${label}: ${healthState.lastOverallRoi}`;
        singleValid = true;
        singleFp = `S:${healthState.lastOverallRoi}`;
        singleNumericVal = healthState.lastOverallRoi;
        singleLabelText = label;
      } else if (val === 0) {
        // 读到 0 时暂不按跌破发红警（多半为数据加载占位或误绑），等待下次重探或交由表格兜底
        singleStatus = "warn";
        singleValueText = "加载中";
        singleSubText = `${binding.label || "整体 ROI"} 暂为 0，等待刷新`;
      } else if (!binding.selector) {
        singleStatus = "warn";
        singleValueText = "未绑定";
        singleSubText = "整体ROI未绑定";
      } else if (!el) {
        singleStatus = "warn";
        singleValueText = "未找到";
        singleSubText = "整体ROI暂不在当前视图";
      } else {
        singleStatus = "warn";
        singleValueText = "无数字";
        singleSubText = `读取到：${normalizeText(readElementMetricText(el)).slice(0, 16)}`;
      }
    }

    let tableStatus = "idle";
    let tableValueText = "--";
    let tableSubText = "";
    let tableValid = false;
    let tableFp = "";
    let latestFilteredRows = [];
    let latestTableMeta = null;
    const abnormalItems = [];

    if (wantTable) {
      const { rows, meta } = scanCampaignTables();
      latestTableMeta = meta;
      const minCost = Number(config.minCost || 0);
      const lowerVal = config.lowerLimit !== "" && config.lowerLimit !== null ? Number(config.lowerLimit) : null;
      const upperVal = config.upperLimit !== "" && config.upperLimit !== null ? Number(config.upperLimit) : null;

      if (rows.length === 0) {
        $("tableScanSummary").textContent =
          "暂未识别到含 ROI 列的表格（请确认列表已加载，或点右上角「复制诊断」发给开发者）";
        tableStatus = "warn";
        tableValueText = "0条计划";
        tableSubText = "未识别到计划表格";
      } else {
        tableValid = true;
        tableFp = rows.map((r) => `${r.id}:${r.cost ?? ""}:${r.roi}`).join("|");

        let activeCount = 0;
        let alertCount = 0;
        let statusSkipped = 0;
        let costSkipped = 0;
        let worst = "ok";
        let minRoi = Infinity;
        let maxRoi = -Infinity;

        const wantDelivering = Boolean(config.onlyDelivering);
        const wantRegulating = Boolean(config.onlyRegulating);
        const manualSingleCap =
          config.singleCostLimit !== "" && config.singleCostLimit !== null && Number(config.singleCostLimit) > 0
            ? Number(config.singleCostLimit)
            : null;
        let costAlertCount = 0;
        let expiredCount = 0;

        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx];
          if (wantDelivering || wantRegulating) {
            const stText = String(row.status || "");
            const matchDel = wantDelivering && /投放中/.test(stText);
            const matchReg = wantRegulating && /调控中/.test(stText);
            if (!matchDel && !matchReg) {
              statusSkipped++;
              continue;
            }
          }
          latestFilteredRows.push(row);

          // 0) 过保计划黄色标记：仅标记明确的灰色「保」（已过保），绿保和无保图标均不显示
          if (config.markExpiredGuarantee !== false && row.guaranteeState === "expired") {
            expiredCount++;
            const expExtra = [];
            if (row.cost !== null) expExtra.push(`当前消耗：${formatCostDisplay(row.cost)}`);
            if (row.roi !== null) expExtra.push(`当前 ROI：${row.roi}`);
            if (row.status) expExtra.push(`状态：${row.status}`);
            checkAndAlertExpired(row.id, `计划「${row.name}」`, row.guaranteeState, expExtra, batchQueue);
            abnormalItems.push({
              id: `${row.id}:expired`,
              rowOrder: rowIdx + 1,
              name: row.name,
              status: row.status,
              guaranteeState: row.guaranteeState,
              roi: row.roi,
              cost: row.cost,
              budget: row.budget || null,
              direction: "expired",
              rowEls: row.rowEls || [],
              roiCell: row.roiCell || null,
              costCell: row.costCell || null,
              statusCell: row.statusCell || null,
            });
          }

          // 1) 单计划 / 调控任务「消耗撞墙」监测（不受 minCost 限制，以免小预算任务如 ¥80 预算撞墙时被 ¥100 门槛漏报！）
          let rowCostState = "ok";
          if (config.costAlertEnabled && row.cost !== null && row.cost > 0) {
            const cap = manualSingleCap || (row.budget && row.budget > 0 ? row.budget : null);
            if (cap) {
              const costExtra = [];
              if (row.roi !== null) costExtra.push(`当前 ROI：${row.roi}`);
              if (row.status) costExtra.push(`状态：${row.status}`);
              const costRes = checkAndAlertCost(`cost_row:${row.id}`, `计划「${row.name}」`, row.cost, cap, costExtra, batchQueue);
              if (costRes.state !== "ok") {
                rowCostState = costRes.state;
                costAlertCount++;
                alertCount++;
                worst = mergeStatus(worst, costRes.state === "cost_hit" ? "low" : "high");
                abnormalItems.push({
                  id: `${row.id}:cost`,
                  rowOrder: rowIdx + 1,
                  name: row.name,
                  status: row.status,
                  roi: row.roi,
                  cost: row.cost,
                  budget: cap,
                  budgetPct: costRes.pct,
                  direction: costRes.state,
                  threshold: cap,
                  rowEls: row.rowEls || [],
                  roiCell: row.roiCell || null,
                  costCell: row.costCell || null,
                  statusCell: row.statusCell || null,
                });
              }
            }
          }

          if (row.cost !== null && minCost > 0 && row.cost < minCost) {
            costSkipped++;
            continue;
          }
          if (row.roi === null) continue;

          activeCount++;
          if (row.roi < minRoi) minRoi = row.roi;
          if (row.roi > maxRoi) maxRoi = row.roi;

          const extra = [];
          if (row.cost !== null) extra.push(`当前消耗：${formatCostDisplay(row.cost)}`);
          if (row.budget) extra.push(`计划预算：${formatCostDisplay(row.budget)}`);
          if (row.status) extra.push(`状态：${row.status}`);
          const st = checkAndAlert(`row:${row.id}`, `计划「${row.name}」`, row.roi, extra, batchQueue);
          if (st !== "ok") {
            alertCount++;
            worst = mergeStatus(worst, st);
            abnormalItems.push({
              id: row.id,
              rowOrder: rowIdx + 1,
              name: row.name,
              status: row.status,
              roi: row.roi,
              cost: row.cost,
              budget: row.budget || null,
              direction: st,
              threshold: st === "low" ? lowerVal : upperVal,
              rowEls: row.rowEls || [],
              roiCell: row.roiCell || null,
              costCell: row.costCell || null,
              statusCell: row.statusCell || null,
            });
          }
        }

        const filterNotes = [];
        if (statusSkipped > 0) filterNotes.push(`状态过滤${statusSkipped}条`);
        if (costSkipped > 0) filterNotes.push(`低于消耗门槛¥${minCost}过滤${costSkipped}条`);
        const filterNoteStr = filterNotes.length > 0 ? `（${filterNotes.join("，")}）` : "";
        const rangeText = activeCount > 0 ? `ROI ${minRoi}~${maxRoi}` : `0条达标${filterNoteStr}`;
        const costNote = costAlertCount > 0 ? `，预算不足 ${costAlertCount} 条` : "";
        const expNote = expiredCount > 0 ? `，过保 ${expiredCount} 条` : "";
        const colHint = meta ? ` · 列[${meta.nameHeader}|${meta.costHeader}|${meta.roiHeader}]` : "";
        $("tableScanSummary").textContent = `已识别 ${rows.length} 条，达标 ${activeCount} 条，异常 ${alertCount} 条${costNote}${expNote}${filterNoteStr}${activeCount > 0 ? `（${rangeText}）` : ""}${colHint}`;
        tableStatus = worst;
        tableValueText = alertCount > 0 ? `${alertCount}条异常` : `${activeCount}条正常`;
        tableSubText = rangeText;
      }
    }

    // 整体消耗撞线监测（若设置了「整体消耗上限」）
    let overallCostStatusLevel = "idle";
    const foundOverallCost = autoFindOverallCostElement();
    const overallCap =
      config.overallCostLimit !== "" && config.overallCostLimit !== null && Number(config.overallCostLimit) > 0
        ? Number(config.overallCostLimit)
        : null;
    const overallCostBox = $("overallCostStatus");
    if (config.costAlertEnabled && overallCap) {
      if (foundOverallCost) {
        const res = checkAndAlertCost("cost_overall", foundOverallCost.label || "整体消耗", foundOverallCost.value, overallCap, [], batchQueue);
        const remain = Math.max(0, overallCap - foundOverallCost.value);
        if (overallCostBox) {
          overallCostBox.textContent = `${foundOverallCost.label}：${formatCostDisplay(foundOverallCost.value)} / ${formatCostDisplay(overallCap)}（${res.pct.toFixed(1)}%，剩 ${formatCostDisplay(remain)}）`;
          overallCostBox.style.color =
            res.state === "cost_hit" ? "#fda4af" : res.state === "cost_warn" ? "#d8b4fe" : "#94a3b8";
        }
        if (res.state === "cost_hit") overallCostStatusLevel = "low";
        else if (res.state === "cost_warn") overallCostStatusLevel = "high";
      } else if (overallCostBox) {
        overallCostBox.textContent = `整体消耗上限 ${formatCostDisplay(overallCap)}：当前页未找到顶部整体消耗卡片`;
        overallCostBox.style.color = "#94a3b8";
      }
    } else if (overallCostBox) {
      overallCostBox.textContent = config.costAlertEnabled
        ? `预算提醒已开启（${config.budgetWarnPercent || 80}% 提醒加预算，自动读预算列；设整体上限可同步盯全店消耗）`
        : "计划预算提醒已关闭";
      overallCostBox.style.color = "#8c98b3";
    }

    // 千川可用余额监测（防余额不足导致计划断流，滚动页面离开顶部后保持上次有效余额避免闪烁消失）
    let currentBalance = null;
    let currentBalanceLabel = "可用余额";
    const foundBalance = autoFindAccountBalanceElement();
    if (foundBalance && Number.isFinite(foundBalance.value)) {
      currentBalance = foundBalance.value;
      currentBalanceLabel = foundBalance.label || "可用余额";
      healthState.lastAccountBalance = currentBalance;
      healthState.lastAccountBalanceLabel = currentBalanceLabel;
      healthState.lastAccountBalanceAt = Date.now();
    } else if (healthState.lastAccountBalance !== null) {
      currentBalance = healthState.lastAccountBalance;
      currentBalanceLabel = healthState.lastAccountBalanceLabel || "可用余额";
    }
    const balThreshold =
      config.balanceWarnThreshold !== "" && config.balanceWarnThreshold !== null
        ? Number(config.balanceWarnThreshold)
        : 1000;
    const isBalanceLow =
      Boolean(config.balanceAlertEnabled) &&
      currentBalance !== null &&
      Number.isFinite(balThreshold) &&
      balThreshold > 0 &&
      currentBalance <= balThreshold;
    if (isBalanceLow) {
      const balLevel = checkAndAlertBalance(currentBalance, balThreshold, currentBalanceLabel);
      overallCostStatusLevel = mergeStatus(overallCostStatusLevel, balLevel);
    }
    const balHintEl = $("balanceStatusHint");
    if (balHintEl) {
      if (currentBalance !== null) {
        balHintEl.textContent = isBalanceLow
          ? `⚠️ ${currentBalanceLabel} ${formatCompactCost(currentBalance)}（低于 ¥${balThreshold}，请充值）`
          : `${currentBalanceLabel}：${formatCompactCost(currentBalance)}（预警线 ¥${balThreshold}）`;
        balHintEl.style.color = isBalanceLow ? "#fca5a5" : "#86efac";
      } else {
        balHintEl.textContent = "可用余额：当前页未识别到顶部余额";
        balHintEl.style.color = "#8c98b3";
      }
    }

    // 统一发送本轮触发的告警（单条直发，多条按类型合并为一条摘要）
    flushAlertBatch(batchQueue);

    refreshAbnormalView(abnormalItems);

    // 记录最新快照并检查是否到达「定时投流总结报告」周期（默认每 30 分钟一次，免疫后台标签节流）
    healthState.latestEvalSnapshot = {
      overallRoi: singleNumericVal,
      overallRoiLabel: singleLabelText,
      overallCost: foundOverallCost ? foundOverallCost.value : null,
      overallCostLabel: foundOverallCost ? foundOverallCost.label : "整体消耗",
      filteredRows: latestFilteredRows,
      abnormalItems,
      scanMeta: latestTableMeta,
    };
    const totalRowCostCur = latestFilteredRows.reduce((acc, r) => acc + (r.cost || 0), 0);
    const validRoiCur = latestFilteredRows.filter((r) => r.roi !== null);
    const weightedRoiRows = validRoiCur.filter((r) => r.cost !== null && r.cost > 0);
    const weightedCostSum = weightedRoiRows.reduce((a, r) => a + r.cost, 0);
    const weightedGmvSum = weightedRoiRows.reduce((a, r) => a + r.roi * r.cost, 0);
    const isWeightedFallback = weightedCostSum > 0;
    const avgRoiCur =
      weightedCostSum > 0
        ? Math.round((weightedGmvSum / weightedCostSum) * 100) / 100
        : validRoiCur.length > 0
          ? Math.round((validRoiCur.reduce((a, r) => a + r.roi, 0) / validRoiCur.length) * 100) / 100
          : null;
    const curRoiSource = singleNumericVal !== null ? "overall" : isWeightedFallback ? "weighted" : "simple_avg";
    const curDisplayRoi = singleNumericVal !== null ? singleNumericVal : avgRoiCur;
    const curEffCost = foundOverallCost ? foundOverallCost.value : totalRowCostCur > 0 ? totalRowCostCur : null;
    const hasValidDataForSummary = singleValid || tableValid;
    if (hasValidDataForSummary) {
      const nowSum = Date.now();
      recordTrendSample(curDisplayRoi, curEffCost, latestFilteredRows, curRoiSource);

      if (!healthState.lastSummarySnapshot || healthState.lastSummarySnapshot.roiSource !== curRoiSource) {
        healthState.lastSummarySnapshot = {
          ts: nowSum,
          displayRoi: curDisplayRoi,
          roiSource: curRoiSource,
          effectiveCost: curEffCost,
          activeCount: latestFilteredRows.length,
        };
      }
      if (config.summaryReportEnabled) {
        const intervalMs = Math.max(5, Number(config.summaryIntervalMin || 30)) * 60 * 1000;
        const baseTs = healthState.lastSummaryAt || healthState.monitorStartedAt || nowSum;
        if (nowSum - baseTs >= intervalMs) {
          buildAndSendSummaryReport({ isManual: false, shouldPush: true });
        }
      }
    }
    updateSummaryNextHint();

    // 更新日常盯盘 3 格核心数据看板（整体 ROI / 消耗+余额 / 在投巡检）
    updateDashboardKpiCards({
      displayRoi: curDisplayRoi,
      roiSource: curRoiSource,
      roiLabel: singleNumericVal !== null ? singleLabelText : isWeightedFallback ? "本页加权ROI" : "本页均ROI",
      roiStatus: singleStatus !== "idle" ? singleStatus : tableStatus,
      effectiveCost: curEffCost,
      costLabel: foundOverallCost ? foundOverallCost.label || "整体消耗" : "本页在投消耗",
      accountBalance: currentBalance,
      isBalanceLow,
      filteredRows: latestFilteredRows,
      abnormalItems,
    });

    // 页面健康与断流监测
    const pageTimeTag = findPageUpdateTimeText();
    const hasValidData = singleValid || tableValid;
    const fingerprint = [singleFp, tableFp, pageTimeTag].filter(Boolean).join("#");
    const anomalies = detectPageAnomalies(hasValidData, fingerprint);
    const anomalyLevel = anomalies.length > 0 ? anomalies[0].level : "idle";

    const limitHint = `区间[${config.lowerLimit || "-∞"}, ${config.upperLimit || "+∞"}]`;
    if (config.mode === "both") {
      // 当页面没有顶部整体 ROI 卡片（或当前为空）但计划列表正常时，使用消耗加权 ROI 兜底展示，避免误报「整体 无数字」
      const fallbackSingleActive = !singleValid && tableValid && avgRoiCur !== null;
      const effectiveSingleStatus = fallbackSingleActive ? "ok" : singleStatus;
      const effectiveSingleTitle = fallbackSingleActive
        ? `${isWeightedFallback ? "加权ROI" : "均ROI"} ${avgRoiCur}`
        : `整体 ${singleValueText}`;
      const combinedStatus = mergeStatus(
        mergeStatus(mergeStatus(effectiveSingleStatus, tableStatus), overallCostStatusLevel),
        anomalyLevel
      );
      updateDisplay(
        combinedStatus,
        `${effectiveSingleTitle} · ${tableValueText}`,
        `${limitHint} | ${tableSubText || singleSubText}`
      );
    } else if (config.mode === "single") {
      updateDisplay(mergeStatus(mergeStatus(singleStatus, overallCostStatusLevel), anomalyLevel), singleValueText, `${singleSubText} · ${limitHint}`);
    } else {
      updateDisplay(mergeStatus(mergeStatus(tableStatus, overallCostStatusLevel), anomalyLevel), tableValueText, `${tableSubText} · ${limitHint}`);
    }
  }

  function updateDashboardKpiCards({
    displayRoi,
    roiSource,
    roiLabel,
    roiStatus,
    effectiveCost,
    costLabel,
    accountBalance,
    isBalanceLow,
    filteredRows,
    abnormalItems,
  }) {
    const roiValEl = $("dashRoiVal");
    if (!roiValEl) return;

    const lower = config.lowerLimit !== "" && config.lowerLimit !== null ? Number(config.lowerLimit) : null;
    const upper = config.upperLimit !== "" && config.upperLimit !== null ? Number(config.upperLimit) : null;
    // 只与同口径基线（overall 对 overall、weighted 对 weighted）比涨跌，杜绝切视图或兜底时出现虚假大幅涨跌
    const sameSourceSample =
      (healthState.trendSamples || []).find((s) => s && s.roiSource === roiSource && s.displayRoi !== null) ||
      (healthState.lastSummarySnapshot?.roiSource === roiSource ? healthState.lastSummarySnapshot : null);
    const costBaseSample = healthState.trendSamples?.[0] || healthState.lastSummarySnapshot || null;

    // 1. 整体 ROI（官方全账户大盘优先；无大盘卡时明确标为「仅当前页加权」）
    $("dashRoiLabel").textContent = (roiLabel || "整体 ROI").slice(0, 10);
    roiValEl.textContent = displayRoi !== null && displayRoi !== undefined ? String(displayRoi) : "--";
    let roiCls = "";
    if (displayRoi !== null && displayRoi !== undefined) {
      if (lower !== null && Number.isFinite(lower) && displayRoi < lower) roiCls = " low";
      else if (upper !== null && Number.isFinite(upper) && displayRoi > upper) roiCls = " high";
      else roiCls = " ok";
    }
    roiValEl.className = `kpi-value${roiCls}`;
    if (sameSourceSample && sameSourceSample.displayRoi !== null && sameSourceSample.displayRoi !== undefined && displayRoi !== null) {
      const diff = Math.round((displayRoi - sameSourceSample.displayRoi) * 100) / 100;
      $("dashRoiDelta").textContent = diff > 0 ? `▲+${diff}` : diff < 0 ? `▼${diff}` : "持平";
      $("dashRoiDelta").style.color = diff > 0 ? "#4ade80" : diff < 0 ? "#f87171" : "#94a3b8";
    } else {
      $("dashRoiDelta").textContent = "";
    }
    const roiSourceHint =
      roiSource === "overall"
        ? "官方全量"
        : roiSource === "weighted"
          ? `仅本页${(filteredRows || []).length}条`
          : "仅本页均值";
    $("dashRoiSub").textContent = `区间 [${config.lowerLimit || "-∞"} ~ ${config.upperLimit || "+∞"}] · ${roiSourceHint}`;

    // 2. 当前消耗
    $("dashCostLabel").textContent = (costLabel || "当前消耗").slice(0, 10);
    $("dashCostVal").textContent = effectiveCost !== null && effectiveCost !== undefined ? formatCompactCost(effectiveCost) : "--";
    if (costBaseSample && costBaseSample.effectiveCost !== null && costBaseSample.effectiveCost !== undefined && effectiveCost !== null) {
      const burn = Math.max(0, effectiveCost - costBaseSample.effectiveCost);
      $("dashCostDelta").textContent = burn > 0 ? `+${formatCompactCost(burn)}` : "";
      $("dashCostDelta").style.color = "#38bdf8";
    } else {
      $("dashCostDelta").textContent = "";
    }
    const validRoiRows = (filteredRows || []).filter((r) => r.roi !== null);
    const costSubEl = $("dashCostSub");
    costSubEl.textContent =
      validRoiRows.length > 0
        ? `本页在投 ${filteredRows.length} 条 · 门槛 ≥¥${Number(config.minCost || 0)}`
        : "等待读取消耗数据";
    costSubEl.className = "kpi-sub";

    // 3. 账户可用余额（独立大盘卡，低于预警线红字提醒充值）
    const balValEl = $("dashBalanceVal");
    const balTagEl = $("dashBalanceTag");
    const balSubEl = $("dashBalanceSub");
    if (balValEl && balTagEl && balSubEl) {
      const balWarn =
        config.balanceWarnThreshold !== "" && config.balanceWarnThreshold !== null
          ? Number(config.balanceWarnThreshold)
          : 1000;
      if (accountBalance !== null && accountBalance !== undefined) {
        balValEl.textContent = formatCompactCost(accountBalance);
        balValEl.className = `kpi-value${isBalanceLow ? " low" : " ok"}`;
        balTagEl.textContent = isBalanceLow ? "请充值" : "余额充足";
        balTagEl.style.color = isBalanceLow ? "#f87171" : "#4ade80";
        balSubEl.textContent = isBalanceLow
          ? `⚠️ 低于预警线 ${formatCompactCost(balWarn)}，记得充值`
          : `预警线 ${formatCompactCost(balWarn)} · 自动盯余额`;
        balSubEl.className = `kpi-sub${isBalanceLow ? " low" : ""}`;
      } else {
        balValEl.textContent = "--";
        balValEl.className = "kpi-value";
        balTagEl.textContent = "待读取";
        balTagEl.style.color = "#94a3b8";
        balSubEl.textContent = `预警线 ${formatCompactCost(balWarn)} · 滚动到顶部自动读取`;
        balSubEl.className = "kpi-sub";
      }
    }

    // 4. 在投巡检概览
    const items = abnormalItems || [];
    const lowCnt = items.filter((i) => i.direction === "low").length;
    const highCnt = items.filter((i) => i.direction === "high").length;
    const costCnt = items.filter((i) => i.direction === "cost_warn" || i.direction === "cost_hit").length;
    const expCnt = items.filter((i) => i.direction === "expired").length;
    const riskCnt = lowCnt + costCnt;
    $("dashPlanCount").textContent = `${(filteredRows || []).length} 条在投`;
    $("dashPlanCount").className = `kpi-value${riskCnt > 0 ? " low" : highCnt > 0 ? " high" : " ok"}`;
    $("dashHealthTag").textContent = riskCnt > 0 ? `${riskCnt}项风险` : "运行健康";
    $("dashHealthTag").style.color = riskCnt > 0 ? "#f87171" : "#4ade80";
    $("dashPlanBreakdown").textContent = `跌破${lowCnt} · 预算${costCnt} · 过保${expCnt} · 高ROI ${highCnt}`;
  }

  function tryClickPageRefresh() {
    if (!config.enabled || !config.autoClickRefresh) return;
    const candidates = Array.from(document.querySelectorAll("button, [role='button'], a, span, i"));
    const refreshBtn = candidates.find((el) => {
      if (!isVisible(el)) return false;
      const txt = normalizeText(el.textContent);
      const title = normalizeText(el.getAttribute("title") || el.getAttribute("aria-label"));
      const cls = typeof el.className === "string" ? el.className : "";
      return (
        txt === "刷新" ||
        txt === "刷新数据" ||
        title === "刷新" ||
        title === "刷新数据" ||
        (title.includes("刷新") && title.length <= 10) ||
        (/icon-refresh|refresh-btn|btn-refresh/i.test(cls) && el.getBoundingClientRect().width <= 48)
      );
    });
    if (refreshBtn) {
      refreshBtn.click();
    }
  }

  // 一键按「整体消耗 / 调控消耗」由高到低排序（兼容千川乘方、全域、调控任务表）
  let sortCostRunId = 0;

  function isActiveSortArrowEl(el) {
    if (!el) return false;
    const nodes = [el, ...Array.from(el.querySelectorAll("svg, path, polygon, i, span")).slice(0, 6)];
    for (const node of nodes) {
      const cls = typeof node.className === "string" ? node.className : (node.className?.baseVal || "");
      if (/(?:^|[-_\s])(active|selected|on|checked|primary|highlight)(?:$|[-_\s])/i.test(cls) && !/(inactive|unselected|disabled)/i.test(cls)) {
        return true;
      }
      const cs = getComputedStyle(node);
      const colorStr = `${cs.color || ""} ${cs.fill || ""} ${cs.stroke || ""} ${node.getAttribute?.("fill") || ""} ${node.getAttribute?.("stroke") || ""}`;
      const matches = colorStr.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g) || [];
      for (const mStr of matches) {
        const parts = mStr.match(/[\d.]+/g);
        if (!parts || parts.length < 3) continue;
        const r = Number(parts[0]);
        const g = Number(parts[1]);
        const b = Number(parts[2]);
        const a = parts.length >= 4 ? Number(parts[3]) : 1;
        if (a <= 0.2) continue;
        // 千川/字节表格激活态为蓝色或高亮主色（明显非灰色）
        if (b - r >= 45 && b >= 140) return true;
        if (Math.max(r, g, b) - Math.min(r, g, b) >= 60 && b >= 120) return true;
      }
    }
    return false;
  }

  function detectHeaderSortDirection(th) {
    if (!th) return "none";
    const ariaSort = (th.getAttribute("aria-sort") || "").toLowerCase();
    if (ariaSort === "descending") return "desc";
    if (ariaSort === "ascending") return "asc";

    const cls = typeof th.className === "string" ? th.className : "";
    if (/(sorted-desc|sort-desc|is-desc|descending)/i.test(cls)) return "desc";
    if (/(sorted-asc|sort-asc|is-asc|ascending)/i.test(cls)) return "asc";

    const upEl = th.querySelector(
      "[class*='sorter-up'], [class*='sort-up'], [class*='arrow-up'], [class*='asc']:not([class*='desc']), .icon-arrow-up"
    );
    const downEl = th.querySelector(
      "[class*='sorter-down'], [class*='sort-down'], [class*='arrow-down'], [class*='desc'], .icon-arrow-down"
    );
    if (upEl || downEl) {
      const upOn = isActiveSortArrowEl(upEl);
      const downOn = isActiveSortArrowEl(downEl);
      if (downOn && !upOn) return "desc";
      if (upOn && !downOn) return "asc";
    }

    // 兜底：千川 Aurora/Arco 表格排序器常见两个上下叠放的 svg 或 path（上=升序、下=降序）
    const sortWrap = th.querySelector("[class*='sort'], [class*='sorter']") || th;
    let arrowCandidates = Array.from(sortWrap.querySelectorAll("svg")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.width <= 22 && r.height > 0 && r.height <= 22;
    });
    if (arrowCandidates.length === 1) {
      const shapes = Array.from(arrowCandidates[0].querySelectorAll("path, polygon")).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (shapes.length === 2) arrowCandidates = shapes;
    }
    if (arrowCandidates.length === 2) {
      arrowCandidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const topOn = isActiveSortArrowEl(arrowCandidates[0]);
      const botOn = isActiveSortArrowEl(arrowCandidates[1]);
      if (botOn && !topOn) return "desc";
      if (topOn && !botOn) return "asc";
    }
    return "none";
  }

  function getTableCostSortState() {
    const scanRes = scanCampaignTables();
    const costs = (scanRes.rows || [])
      .map((r) => r.cost)
      .filter((c) => c !== null && Number.isFinite(c));
    if (costs.length < 2) return "unknown";

    const sample = costs.slice(0, Math.min(costs.length, 20));
    const first = sample[0];
    const last = sample[sample.length - 1];
    const allMax = Math.max(...costs);
    const knownOverallCost =
      healthState.lastOverallCost !== null && healthState.lastOverallCost > 0
        ? healthState.lastOverallCost
        : autoFindOverallCostElement()?.value || 0;

    // 整页可见行全是 0.00，但账户/表格总消耗明显大于 0 → 必然是被排成升序了！
    if (allMax === 0) {
      return knownOverallCost >= 10 ? "asc" : "unknown";
    }

    let upJumps = 0;
    for (let i = 0; i < sample.length - 1; i++) {
      if (sample[i + 1] > sample[i] + 0.05) upJumps++;
    }
    if (first > 0 && first >= allMax * 0.98 && first >= last && upJumps <= 1) {
      return "desc";
    }
    if ((first === 0 && allMax > 0) || (first < allMax * 0.8 && first <= last)) {
      return "asc";
    }
    return "unsorted";
  }

  function getCombinedCostSortState(th) {
    const domDir = detectHeaderSortDirection(th);
    const dataDir = getTableCostSortState();
    // 真实行数据明确为升序（例如 0.00 排在最前面）时，以数据事实为准
    if (dataDir === "asc") return "asc";
    if (domDir === "desc") return "desc";
    if (domDir === "asc") return "asc";
    if (dataDir === "desc") return "desc";
    return "none";
  }

  function isHeaderSortedDesc(th) {
    return getCombinedCostSortState(th) === "desc";
  }

  function findCostHeaderTh() {
    const costKws = splitKeywords(config.costHeaderKeyword, "调控消耗,整体消耗,总消耗,消耗");
    const headers = Array.from(
      document.querySelectorAll("thead th, [role='columnheader'], .aurora-qc-table-header th, .ovui-table-thead th")
    ).filter((el) => isVisible(el));

    let bestTh = null;
    let bestScore = -1;
    for (const th of headers) {
      const raw = normalizeText(th.innerText || th.textContent);
      if (!raw || raw.length > 22) continue;
      const pure = raw.replace(/[\s(（)）元￥¥]/g, "").toLowerCase();
      if (COST_EXCLUDE_RE.test(pure)) continue;
      const kwIdx = costKws.findIndex((k) => pure.includes(k.toLowerCase()));
      if (kwIdx === -1) continue;
      let score = 100 - kwIdx * 15;
      if (/^(调控消耗|整体消耗|总消耗|消耗)$/.test(pure)) score += 60;
      if (th.querySelector("[class*='sort'], svg")) score += 40;
      if (score > bestScore) {
        bestScore = score;
        bestTh = th;
      }
    }
    return bestTh;
  }

  function getCostSortClickTarget(th) {
    if (!th) return null;
    const downBtn = th.querySelector(
      "[class*='sorter-down'], [class*='sort-down'], [aria-label*='降序'], [title*='降序']"
    );
    return (
      downBtn ||
      th.querySelector("[class*='sorter'], [class*='sort-trigger'], [class*='sort-icon'], button, [role='button']") ||
      th
    );
  }

  function trySortTableByCostDesc(silent = false) {
    const bestTh = findCostHeaderTh();
    if (!bestTh) {
      if (!silent) showToast("当前页未找到可排序的「消耗」列头，请手动点表头排序", 3000);
      return false;
    }

    const colName = normalizeText(bestTh.innerText || bestTh.textContent).slice(0, 10) || "消耗";
    if (getCombinedCostSortState(bestTh) === "desc") {
      if (!silent) showToast(`当前表格已按「${colName}」由高到低排序 ✓`, 2200);
      return true;
    }

    const runId = ++sortCostRunId;
    const maxClicks = 3;

    const runStep = (clicksDone) => {
      if (runId !== sortCostRunId) return;
      const th = findCostHeaderTh();
      if (!th) return;

      if (clicksDone > 0) {
        const state = getCombinedCostSortState(th);
        if (state === "desc") {
          if (config.enabled) evaluateNow();
          if (!silent) showToast(`已按「${colName}」由高到低排序 ✓`, 2400);
          return;
        }
        if (clicksDone >= maxClicks) {
          if (config.enabled) evaluateNow();
          if (!silent) showToast(`已尝试切换「${colName}」降序，如未生效可手动点一下表头箭头`, 3000);
          return;
        }
      }

      const target = getCostSortClickTarget(th);
      if (!target) return;
      target.click();

      // 等待千川接口返回并重绘表格行后，再基于表头箭头 + 真实消耗行数据二次校验
      setTimeout(() => runStep(clicksDone + 1), 950);
    };

    if (!silent) showToast(`正在将「${colName}」切为由高到低排序…`, 1800);
    runStep(0);
    return true;
  }

  // 一键切换千川分页「每页显示条数」（支持 10 / 20 / 50 / 100，默认 100，兼容投放页与调控页，支持 SPA 延迟加载重试）
  function trySetTablePageSize(targetSize = 100, silent = false, onComplete = null, retryLeft = 4) {
    const sizeNum = Number(targetSize) || 100;
    const sizeTextRe = /^(?:每页\s*)?(10|20|30|40|50|100|200)\s*条(?:\/页)?$/;
    const pagContainers = Array.from(
      document.querySelectorAll(
        "[class*='pagination'], [class*='pager'], .aurora-pagination, .ovui-pagination, .byted-pagination, .arco-pagination, .semi-page"
      )
    ).filter((el) => isVisible(el));

    let triggerEl = null;
    let currentSize = null;
    const searchRoots = pagContainers.length > 0 ? [...pagContainers, document.body] : [document.body];
    for (const rootEl of searchRoots) {
      const candidates = Array.from(
        rootEl.querySelectorAll("button, [role='combobox'], [role='button'], [class*='select'], span, div, input")
      ).filter((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.width > 240 || r.height < 18 || r.height > 56) return false;
        const t = normalizeText(el.value || el.innerText || el.textContent);
        return sizeTextRe.test(t);
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
        const picked = candidates[0];
        const m = normalizeText(picked.value || picked.innerText || picked.textContent).match(sizeTextRe);
        currentSize = m ? Number(m[1]) : null;
        triggerEl = picked.closest?.("[class*='select-view'], [class*='select'], [role='combobox'], button") || picked;
        break;
      }
    }

    if (!triggerEl) {
      if (silent && retryLeft > 0 && config.enabled) {
        setTimeout(() => trySetTablePageSize(targetSize, silent, onComplete, retryLeft - 1), 1300);
        return false;
      }
      if (!silent) showToast("当前页未找到分页条数选择器（可能已展示全部或未滚动到底部）", 3000);
      if (typeof onComplete === "function") setTimeout(() => onComplete(false), 150);
      return false;
    }

    if (currentSize === sizeNum) {
      if (!silent) showToast(`当前已是每页 ${sizeNum} 条 ✓`, 2200);
      if (typeof onComplete === "function") setTimeout(() => onComplete(false), 150);
      return true;
    }

    const dispatchRealClick = (el) => {
      try {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        el.click();
      } catch {
        el.click?.();
      }
    };

    dispatchRealClick(triggerEl);

    const optRe = new RegExp(`^(?:每页\\s*)?${sizeNum}\\s*条(?:\\/页)?$`);
    const findOptionAndClick = (attempt = 0) => {
      const opts = Array.from(
        document.querySelectorAll(
          "[role='option'], [class*='select-option'], [class*='dropdown-item'], [class*='menu-item'], [class*='popup'] li, [class*='popover'] li, [class*='popup'] div, [class*='popover'] div, li"
        )
      ).filter((el) => {
        if (!isVisible(el) || el === triggerEl || triggerEl.contains(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 36 || r.width > 260 || r.height < 18 || r.height > 54) return false;
        const t = normalizeText(el.innerText || el.textContent);
        return optRe.test(t);
      });
      if (opts.length > 0) {
        opts.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
        dispatchRealClick(opts[0]);
        if (!silent) showToast(`已将当前页切换为每页 ${sizeNum} 条 ✓`, 2600);
        setTimeout(() => {
          if (config.enabled) evaluateNow();
          if (typeof onComplete === "function") onComplete(true);
        }, 1200);
      } else if (attempt < 2) {
        if (attempt === 0) dispatchRealClick(triggerEl);
        setTimeout(() => findOptionAndClick(attempt + 1), 280);
      } else {
        document.body.click();
        if (!silent) showToast(`未找到「${sizeNum} 条/页」选项，可手动切换或在面板改选 50 条`, 3200);
        if (typeof onComplete === "function") setTimeout(() => onComplete(false), 200);
      }
    };

    setTimeout(() => findOptionAndClick(0), 260);
    return true;
  }

  // ---------- 安全 DOM 诊断（不含 Cookie / Token） ----------
  function buildDomDiagnosticReport() {
    const tables = Array.from(document.querySelectorAll("table")).map((t, i) => ({
      i,
      visible: isVisible(t),
      cls: String(t.className || "").slice(0, 80),
      parentCls: String(t.parentElement?.className || "").slice(0, 80),
      headers: extractTableHeaderLeafCells(t).map((c) => c.text).slice(0, 16),
      tbodyRows: t.querySelectorAll("tbody tr").length,
      sampleRow1: Array.from(t.querySelectorAll("tbody tr")[0]?.children || [])
        .map((c) => normalizeText(c.innerText || c.textContent).slice(0, 24))
        .slice(0, 12),
    }));
    const roleGrids = Array.from(
      document.querySelectorAll("[role='table'], [role='grid'], [class*='table-wrap'], [class*='arco-table'], [class*='semi-table'], [class*='byted-table'], [class*='ovui-table']")
    )
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        cls: String(el.className || "").slice(0, 90),
        role: el.getAttribute("role"),
        rows: el.querySelectorAll("[role='row'], tr, [class*='row']").length,
      }));
    const roiCardHints = [];
    const roiWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let rNode;
    while ((rNode = roiWalker.nextNode()) && roiCardHints.length < 6) {
      const t = normalizeText(rNode.textContent);
      if (!t || t.length > 26 || !/ROI/i.test(t) || ROI_EXCLUDE_RE.test(t)) continue;
      const p = rNode.parentElement;
      if (!p || !isVisible(p) || p.closest("table, thead, tbody, [role='table'], [role='grid']")) continue;
      const chain = [];
      let cur = p;
      let cardSample = "";
      for (let d = 0; d < 6 && cur && cur !== document.body; d++) {
        const r = cur.getBoundingClientRect();
        const cls = typeof cur.className === "string" ? cur.className.trim().slice(0, 50) : "";
        chain.push(`${cur.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 2).join(".") : ""}(${Math.round(r.width)}x${Math.round(r.height)})`);
        if (!cardSample && r.width >= 80 && r.width <= 600 && r.height >= 40 && r.height <= 260) {
          cardSample = normalizeText(cur.innerText || cur.textContent).slice(0, 80);
        }
        cur = cur.parentElement;
      }
      roiCardHints.push({ label: t, chain, cardSample });
    }

    const scanRes = scanCampaignTables();
    const autoRoi = autoFindRoiElement();
    return {
      version: "1.3.0",
      urlPath: location.origin + location.pathname,
      autoOverallRoi: autoRoi ? { label: autoRoi.label, value: autoRoi.value, selector: autoRoi.selector } : null,
      roiCardHints,
      scanMeta: scanRes.meta,
      scannedCount: scanRes.rows.length,
      sampleScanned: scanRes.rows.slice(0, 3).map(({ id, name, status, guaranteeState, roi, cost, budget }) => ({ id, name, status, guaranteeState, roi, cost, budget })),
      tablesCount: tables.length,
      tables: tables.slice(0, 8),
      roleGrids,
    };
  }

  // ---------- 启动 / 停止监听 ----------
  function startMonitoring() {
    stopMonitoring(false);
    config.enabled = true;
    saveConfig();

    const now = Date.now();
    healthState.monitorStartedAt = now;
    healthState.lastDataChangeAt = now;
    healthState.lastDataFingerprint = "";
    healthState.hadValidData = false;
    healthState.dataMissingSince = 0;
    healthState.lastAnomalyCheckAt = 0;
    healthState.activeAnomalies = [];
    healthState.lastSummaryAt = now;
    healthState.lastSummarySnapshot = null;

    let debounceTimer = null;
    observer = new MutationObserver(() => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        evaluateNow();
      }, 900);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    pollTimer = setInterval(evaluateNow, 2000);

    if ((config.mode === "table" || config.mode === "both") && config.autoClickRefresh) {
      const sec = Math.max(15, Number(config.refreshIntervalSec || 60));
      refreshTimer = setInterval(tryClickPageRefresh, sec * 1000);
    }

    syncMonitorButton();
    if (config.autoOptimizeViewOnStart !== false && (config.mode === "table" || config.mode === "both")) {
      const targetSize = Number(config.preferredPageSize || 100);
      trySetTablePageSize(targetSize, true, () => {
        if (config.enabled) trySortTableByCostDesc(true);
      });
    }
    evaluateNow();
  }

  function stopMonitoring(persist = true) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (persist) {
      config.enabled = false;
      saveConfig();
      activeAbnormalId = "";
      allAbnormalItems = [];
      clearPageHighlights();
      renderAbnormalList([], []);
      updateDisplay("idle", "--", "监控已暂停");
      updateHealthBox("ok", "页面健康：监控已暂停");
      updateSummaryNextHint();
      syncMonitorButton();
    }
  }

  // ---------- 点选页面元素模式 ----------
  function enterPickerMode() {
    if (isPicking) return;
    isPicking = true;
    showToast("请将鼠标移到页面上的 ROI 数字并点击（按 Esc 取消）", 6000);

    const onMove = (e) => {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || host.contains(target)) {
        pickerHighlight.style.display = "none";
        hoveredEl = null;
        return;
      }
      hoveredEl = target;
      const rect = target.getBoundingClientRect();
      pickerHighlight.style.display = "block";
      pickerHighlight.style.left = `${rect.left}px`;
      pickerHighlight.style.top = `${rect.top}px`;
      pickerHighlight.style.width = `${rect.width}px`;
      pickerHighlight.style.height = `${rect.height}px`;
    };

    const cleanup = () => {
      isPicking = false;
      pickerHighlight.style.display = "none";
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        cleanup();
        showToast("已取消点选");
      }
    };

    const onClick = (e) => {
      if (!isPicking) return;
      if (host.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      let target = hoveredEl || e.target;
      cleanup();

      // 若点中了千川指标卡拆分的整数或小数子 span（全域或乘方 Aurora 通用），自动提升到完整数值容器
      const metricNumBox = target?.closest?.(".oc-promotion-metric-card-number");
      const auroraValueRow = target?.closest?.(".aurora-qc-statistic-value-row");
      let pickedCardLabel = "";
      if (metricNumBox) {
        target = metricNumBox;
        pickedCardLabel = "整体支付ROI";
      } else if (auroraValueRow) {
        target = auroraValueRow;
        const cardTitleEl = auroraValueRow
          .closest?.(".aurora-qc-statistic")
          ?.querySelector?.("[data-testid='metric-card-title-region'], .aurora-qc-statistic-title");
        pickedCardLabel = normalizeText(cardTitleEl?.getAttribute?.("title") || cardTitleEl?.innerText || cardTitleEl?.textContent);
      } else {
        let cur = target;
        const curVal = readElementMetricText(cur).trim();
        if (!/^\d+(?:,\d+)*\.\d+$/.test(curVal)) {
          for (let up = 0; up < 3 && cur && cur.parentElement && cur.parentElement !== document.body; up++) {
            const p = cur.parentElement;
            if (p.querySelector("table, svg, canvas") || p.getBoundingClientRect().height > 96) break;
            const pVal = readElementMetricText(p).trim();
            if (/^\d+(?:,\d+)*\.\d+$/.test(pVal)) {
              cur = p;
              break;
            }
            cur = p;
          }
          if (/^\d+(?:,\d+)*\.\d+$/.test(readElementMetricText(cur).trim())) {
            target = cur;
          }
        }
      }

      const sel =
        target.closest?.(".card.total_prepay_and_pay_order_roi2") && metricNumBox
          ? ".card.total_prepay_and_pay_order_roi2 .oc-promotion-metric-card-number"
          : buildUniqueSelector(target);
      const rawMetricText = readElementMetricText(target);
      const val = parseMetricNumber(rawMetricText);
      const label = pickedCardLabel || `已选元素(${normalizeText(rawMetricText).slice(0, 12)})`;
      setActivePageBinding(sel, label);
      if (val === null) {
        showToast("已绑定元素，但当前文本里没看到数字，请确认是否选准了数值节点", 4500);
      } else {
        showToast(`绑定成功！当前读数：${val}`, 3500);
      }
      if (config.enabled) evaluateNow();
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  // ---------- UI 渲染 ----------
  function updateDisplay(status, valueText, subText) {
    latestDisplay = { status, text: valueText, rowsSummary: subText };
    $("currentRoiValue").textContent = valueText;
    $("currentStatusSub").textContent = subText;

    const pillDot = $("pillDot");
    const headerDot = $("headerDot");
    pillDot.className = `dot ${status}`;
    headerDot.className = `dot ${status}`;

    const prefix = config.enabled ? "Kamisama" : "Kamisama 监控";
    const statusLabel =
      status === "error"
        ? "页面异常"
        : status === "low"
          ? "跌破下限"
          : status === "high"
            ? "突破上限"
            : status === "ok"
              ? "正常"
              : "";
    $("pillText").textContent = config.enabled
      ? `${prefix}: ${valueText}${statusLabel ? ` (${statusLabel})` : ""}`
      : "Kamisama: 未启动";
  }

  function syncMonitorButton() {
    const btn = $("toggleMonitorBtn");
    if (config.enabled) {
      btn.textContent = "停止监控";
      btn.className = "btn btn-danger";
    } else {
      btn.textContent = "开始监控";
      btn.className = "btn btn-success";
    }
  }

  function renderSelectorPreview() {
    const box = $("selectorPreview");
    const binding = getActivePageBinding();
    if (binding.selector) {
      const labelText = binding.label || "自定义元素";
      box.innerHTML = `已绑定：<strong style="color:#93c5fd;">${escapeHtml(labelText)}</strong> <span class="muted" title="${escapeHtml(binding.selector)}">（悬停查看路径）</span>`;
    } else {
      box.textContent = "尚未绑定整体 ROI（可自动查找，或点左侧按钮直接点页面数字）";
    }
  }

  function refreshAbnormalView(sourceItems = allAbnormalItems) {
    allAbnormalItems = Array.isArray(sourceItems) ? sourceItems : [];
    const filter = config.abnormalFilter || "all";
    const sortMode = config.abnormalSort || "table";

    const q = normalizeText(healthState.abnormalSearchQuery || "").toLowerCase();
    let filtered = allAbnormalItems.filter((item) => {
      if (filter === "low" && item.direction !== "low") return false;
      if (filter === "high" && item.direction !== "high") return false;
      if (filter === "cost" && item.direction !== "cost_warn" && item.direction !== "cost_hit") return false;
      if (filter === "expired" && item.direction !== "expired") return false;
      if (q) {
        const hay = `${item.name || ""} #${item.rowOrder || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      if (sortMode === "extreme") {
        const rank = { low: 0, cost_hit: 1, cost_warn: 2, expired: 3, high: 4 };
        if (rank[a.direction] !== rank[b.direction]) return (rank[a.direction] ?? 9) - (rank[b.direction] ?? 9);
        if (a.direction === "cost_hit" || a.direction === "cost_warn") return (b.budgetPct || 0) - (a.budgetPct || 0);
        if (a.direction === "expired") return (a.rowOrder || 0) - (b.rowOrder || 0);
        return a.direction === "low" ? a.roi - b.roi : b.roi - a.roi;
      }
      // 默认严格按表格从上到下顺序排列，逐条巡检不乱跳
      return (a.rowOrder || 0) - (b.rowOrder || 0);
    });

    applyPageHighlights(filtered);
    renderAbnormalList(filtered, allAbnormalItems);
  }

  function syncAbnormalActiveUI() {
    const list = $("abnormalList");
    const posEl = $("abnormalStepPos");
    if (!list || !posEl) return;

    const activeIdx = latestAbnormalItems.findIndex((item) => item.id === activeAbnormalId);
    const cards = list.querySelectorAll(".abnormal-item");
    cards.forEach((card, idx) => {
      card.classList.toggle("active", idx === activeIdx);
    });

    if (latestAbnormalItems.length === 0) {
      posEl.textContent = "当前筛选 0 条";
    } else if (activeIdx >= 0) {
      const cur = latestAbnormalItems[activeIdx];
      posEl.textContent = `第 ${activeIdx + 1} / ${latestAbnormalItems.length} 条（表#${cur.rowOrder}）`;
    } else {
      posEl.textContent = `共 ${latestAbnormalItems.length} 条 · 点选或点下一条`;
    }
  }

  function renderAbnormalList(items, totalItems = items) {
    latestAbnormalItems = items || [];
    const box = $("abnormalBox");
    const list = $("abnormalList");
    const titleEl = $("abnormalBoxTitle");
    if (!box || !list) return;

    if (!config.enabled || !totalItems || totalItems.length === 0) {
      box.classList.remove("show");
      list.innerHTML = "";
      list.dataset.sig = "";
      clearActiveRowFocus();
      return;
    }

    const lowCount = totalItems.filter((i) => i.direction === "low").length;
    const highCount = totalItems.filter((i) => i.direction === "high").length;
    const costCount = totalItems.filter((i) => i.direction === "cost_warn" || i.direction === "cost_hit").length;
    const expiredCount = totalItems.filter((i) => i.direction === "expired").length;
    titleEl.textContent = `异常/重点计划明细（共 ${totalItems.length} 条）`;

    const filter = config.abnormalFilter || "all";
    $("filterAllPill").textContent = `全部 ${totalItems.length}`;
    $("filterLowPill").textContent = `跌破 ${lowCount}`;
    $("filterHighPill").textContent = `突破 ${highCount}`;
    $("filterCostPill").textContent = `预算不足 ${costCount}`;
    $("filterExpiredPill").textContent = `过保 ${expiredCount}`;
    $("filterAllPill").classList.toggle("active", filter === "all");
    $("filterLowPill").classList.toggle("active", filter === "low");
    $("filterHighPill").classList.toggle("active", filter === "high");
    $("filterCostPill").classList.toggle("active", filter === "cost");
    $("filterExpiredPill").classList.toggle("active", filter === "expired");

    const sortMode = config.abnormalSort || "table";
    $("sortOrderToggle").textContent = sortMode === "table" ? "顺序：表格↑↓" : "顺序：极值";

    // 用紧凑签名避免无变化时反复重绘导致滚动条跳回顶部
    const searchSig = normalizeText(healthState.abnormalSearchQuery || "").toLowerCase();
    const renderSig = `${filter}|${sortMode}|${searchSig}|` + latestAbnormalItems
      .map((i) => `${i.id}:${i.rowOrder}:${i.direction}:${i.guaranteeState ?? ""}:${i.roi ?? ""}:${i.cost ?? ""}:${i.budgetPct ? i.budgetPct.toFixed(1) : ""}`)
      .join("|");
    if (list.dataset.sig !== renderSig) {
      list.dataset.sig = renderSig;
      if (latestAbnormalItems.length === 0) {
        list.innerHTML = '<div class="muted" style="padding:6px 2px;">当前筛选条件下暂无计划</div>';
      } else {
        list.innerHTML = latestAbnormalItems
          .map((item, idx) => {
            const isActive = item.id === activeAbnormalId ? " active" : "";
            const isCost = item.direction === "cost_warn" || item.direction === "cost_hit";
            const isExpired = item.direction === "expired";
            let metaText = "";
            let pillText = "";
            if (isCost) {
              const remain = Math.max(0, (item.budget || 0) - (item.cost || 0));
              const pctText = Number.isFinite(item.budgetPct) ? `${item.budgetPct.toFixed(1)}%` : "";
              metaText = `消耗 ${formatCostDisplay(item.cost)} / 预算 ${formatCostDisplay(item.budget)} (${pctText} · 剩${formatCostDisplay(remain)}，请加预算)`;
              pillText = item.direction === "cost_hit" ? "🚨预算已满" : `⚡预算${Math.round(item.budgetPct || 0)}%`;
            } else if (isExpired) {
              const roiStr = item.roi !== null ? `ROI ${item.roi}` : "ROI -";
              const costStr = item.cost !== null ? ` · 消耗 ${formatCostDisplay(item.cost)}` : "";
              metaText = `已过保障期(灰保) · ${roiStr}${costStr}`;
              pillText = "⚠️已过保";
            } else {
              const isLow = item.direction === "low";
              const limitStr = isLow ? `<${item.threshold}` : `>${item.threshold}`;
              const costStr = item.cost !== null ? ` · 消耗 ${formatCostDisplay(item.cost)}` : "";
              metaText = `ROI ${item.roi} (${limitStr})${costStr}`;
              pillText = isLow ? "↓跌破" : "↑突破";
            }
            return `
              <div class="abnormal-item ${item.direction}${isActive}" data-idx="${idx}" title="点击平滑定位到表格第 ${item.rowOrder} 行">
                <div class="abnormal-main">
                  <div class="abnormal-name"><span class="row-seq">#${item.rowOrder}</span>${escapeHtml(item.name)}</div>
                  <div class="abnormal-meta">${escapeHtml(metaText)}</div>
                </div>
                <span class="tag-pill ${item.direction}">${pillText}</span>
              </div>
            `;
          })
          .join("");
      }
    }

    syncAbnormalActiveUI();
    box.classList.add("show");
  }

  function focusAbnormalItem(idx, scrollCardIntoView = false) {
    const item = latestAbnormalItems[idx];
    if (!item) return;
    const isCost = item.direction === "cost_warn" || item.direction === "cost_hit";
    const isExpired = item.direction === "expired";
    const target = (isCost ? item.costCell : isExpired ? item.statusCell : item.roiCell) || item.rowEls?.[0];
    if (!target || !document.contains(target)) {
      showToast("该计划行已离开当前视图，可能已翻页或被筛选隐藏", 2800);
      return;
    }
    activeAbnormalId = item.id;
    syncAbnormalActiveUI();

    if (scrollCardIntoView) {
      const card = $("abnormalList")?.querySelector?.(`.abnormal-item[data-idx="${idx}"]`);
      card?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }

    // 仅垂直居中定位，不强制晃动横向滚动条
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

    clearActiveRowFocus();
    for (const rEl of item.rowEls || [target]) {
      if (!rEl || !rEl.setAttribute) continue;
      rEl.setAttribute("data-qc-roi-active", "1");
      activeFocusedRowEls.add(rEl);
      rEl.removeAttribute("data-qc-roi-flash");
      void rEl.offsetWidth;
      rEl.setAttribute("data-qc-roi-flash", "1");
      setTimeout(() => rEl.removeAttribute("data-qc-roi-flash"), 2200);
    }
  }

  function stepAbnormalItem(delta) {
    if (latestAbnormalItems.length === 0) return;
    const curIdx = latestAbnormalItems.findIndex((item) => item.id === activeAbnormalId);
    let nextIdx;
    if (curIdx === -1) {
      nextIdx = delta >= 0 ? 0 : latestAbnormalItems.length - 1;
    } else {
      nextIdx = (curIdx + delta + latestAbnormalItems.length) % latestAbnormalItems.length;
    }
    focusAbnormalItem(nextIdx, true);
  }

  function syncCollapsedSections() {
    const map = config.collapsedSections && typeof config.collapsedSections === "object" ? config.collapsedSections : {};
    const isCompact = Boolean(config.compactMode);
    shadow.querySelectorAll(".section[data-sec]").forEach((sec) => {
      const id = sec.getAttribute("data-sec");
      sec.classList.toggle("collapsed", Boolean(map[id]));
      sec.classList.remove("span-full");
    });

    // 横屏零留白自适应：计算 sectionsGrid 中可见的展开卡片与折叠卡片数量，奇数个展开卡时让最后一张（或唯一一张）铺满整行
    const grid = $("sectionsGrid");
    if (grid) {
      const gridSecs = Array.from(grid.children).filter((el) => {
        if (!el.matches?.(".section[data-sec]")) return false;
        if (isCompact && el.classList.contains("config-section")) return false;
        if (!isCompact && el.classList.contains("dashboard-only")) return false;
        return true;
      });
      const expanded = gridSecs.filter((el) => !el.classList.contains("collapsed"));
      const collapsed = gridSecs.filter((el) => el.classList.contains("collapsed"));
      if (expanded.length % 2 === 1) {
        expanded[expanded.length - 1].classList.add("span-full");
      }
      if (collapsed.length % 2 === 1) {
        collapsed[collapsed.length - 1].classList.add("span-full");
      }
    }
  }

  function syncCompactMode() {
    const compact = Boolean(config.compactMode);
    $("panel").classList.toggle("compact", compact);
    $("compactModeBtn").textContent = compact ? "配置" : "盯盘";
    const dashTab = $("viewDashboardBtn");
    const cfgTab = $("viewConfigBtn");
    if (dashTab) dashTab.classList.toggle("active", compact);
    if (cfgTab) cfgTab.classList.toggle("active", !compact);
    syncCollapsedSections();
  }

  function clampHostIntoViewport() {
    if (!host.style.left || host.style.left === "auto") return;
    const panelWidth = host.offsetWidth || (config.landscapeMode ? 860 : 382);
    const curLeft = parseFloat(host.style.left) || 8;
    const curTop = parseFloat(host.style.top) || 84;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - 60);
    host.style.left = `${Math.min(maxLeft, Math.max(8, curLeft))}px`;
    host.style.top = `${Math.min(maxTop, Math.max(8, curTop))}px`;
  }

  function syncLandscapeMode() {
    const landscape = Boolean(config.landscapeMode);
    $("panel").classList.toggle("landscape", landscape);
    $("landscapeModeBtn").textContent = landscape ? "竖屏" : "横屏";
    // 切换宽度后自动确保面板不出屏幕右边界
    requestAnimationFrame(clampHostIntoViewport);
  }

  let pillWasDragged = false;

  function enablePanelDragging() {
    const header = $("panelHeader");
    const pill = $("pillBtn");
    if (!header && !pill) return;
    let dragging = false;
    let dragSource = null;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    const beginDrag = (e, source) => {
      if (e.button !== 0) return;
      if (source === "header" && e.target.closest?.("button")) return;
      dragging = true;
      dragSource = source;
      moved = false;
      const rect = host.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      host.style.right = "auto";
      host.style.bottom = "auto";
      host.style.left = `${origLeft}px`;
      host.style.top = `${origTop}px`;
      if (source === "pill" && pill) pill.style.cursor = "grabbing";
      e.preventDefault();
    };

    if (header) header.addEventListener("mousedown", (e) => beginDrag(e, "header"));
    if (pill) pill.addEventListener("mousedown", (e) => beginDrag(e, "pill"));

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) >= 4) {
        moved = true;
      }
      if (!moved) return;
      const rect = host.getBoundingClientRect();
      const boxW = rect.width || host.offsetWidth || 180;
      const boxH = rect.height || host.offsetHeight || 44;
      const maxLeft = Math.max(8, window.innerWidth - boxW - 8);
      const maxTop = Math.max(8, window.innerHeight - Math.min(boxH, 60) - 8);
      const nextLeft = Math.min(maxLeft, Math.max(8, origLeft + dx));
      const nextTop = Math.min(maxTop, Math.max(8, origTop + dy));
      host.style.left = `${nextLeft}px`;
      host.style.top = `${nextTop}px`;
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      if (dragSource === "pill") {
        if (pill) pill.style.cursor = "grab";
        if (moved) {
          pillWasDragged = true;
          setTimeout(() => {
            pillWasDragged = false;
          }, 80);
        }
      }
      dragging = false;
      dragSource = null;
      moved = false;
    });
  }

  function pushLog(level, message) {
    alertLogs.unshift({ time: formatTime(), level, message });
    if (alertLogs.length > 30) alertLogs.pop();
    const container = $("logsContainer");
    container.innerHTML = alertLogs
      .map(
        (item) =>
          `<div class="log-item ${item.level}"><strong>[${item.time}]</strong> ${escapeHtml(item.message)}</div>`
      )
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setPanelOpen(open) {
    isExpanded = open;
    $("panel").classList.toggle("open", open);
    $("pillBtn").style.display = open ? "none" : "flex";
  }

  function switchMode(mode, persist = true) {
    config.mode = mode;
    $("tabBoth").classList.toggle("active", mode === "both");
    $("tabSingle").classList.toggle("active", mode === "single");
    $("tabTable").classList.toggle("active", mode === "table");
    $("singleModeBox").style.display = mode === "both" || mode === "single" ? "flex" : "none";
    $("tableModeBox").style.display = mode === "both" || mode === "table" ? "flex" : "none";
    if (persist) {
      saveConfig();
      if (config.enabled) {
        startMonitoring();
      }
    }
  }

  // ---------- 配置持久化（监控配置与 5 大推送渠道彻底隔离 + 三层持久备份 + 多标签页实时同步） ----------
  function isExtensionAlive() {
    try {
      return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function ensureChannelHistoryShape(raw) {
    const out = {};
    for (const field of CHANNEL_STRING_FIELDS) {
      const arr = Array.isArray(raw?.[field]) ? raw[field] : [];
      out[field] = Array.from(new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))).slice(0, 6);
    }
    return out;
  }

  function mergeHistoryMaps(...maps) {
    const out = {};
    for (const field of CHANNEL_STRING_FIELDS) {
      const merged = [];
      for (const m of maps) {
        if (!m || !Array.isArray(m[field])) continue;
        for (const item of m[field]) {
          const v = String(item || "").trim();
          if (v && !merged.includes(v)) merged.push(v);
        }
      }
      out[field] = merged.slice(0, 6);
    }
    return out;
  }

  function normalizeBarkInput(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const urlMatch = s.match(/(https?:\/\/[^/\s"'`]+)\/([A-Za-z0-9_-]{8,})/i);
    if (urlMatch) return `${urlMatch[1]}/${urlMatch[2]}`;
    if (/^[A-Za-z0-9_-]{12,}$/.test(s)) return `https://api.day.app/${s}`;
    return s.replace(/\/+$/, "");
  }

  function buildChannelPayload(recordHistory = false) {
    if (config.barkUrl) {
      config.barkUrl = normalizeBarkInput(config.barkUrl);
      const barkEl = $("barkUrl");
      if (barkEl && shadow.activeElement !== barkEl && barkEl.value !== config.barkUrl) {
        barkEl.value = config.barkUrl;
      }
    }
    const history = ensureChannelHistoryShape(config.channelHistory);
    if (recordHistory) {
      for (const field of CHANNEL_STRING_FIELDS) {
        const val = String(config[field] || "").trim();
        if (val) {
          history[field] = [val, ...history[field].filter((v) => v !== val)].slice(0, 6);
        }
      }
      config.channelHistory = history;
    }
    const now = Date.now();
    lastChannelsUpdatedAt = Math.max(now, lastChannelsUpdatedAt + 1);
    return {
      wecomWebhook: String(config.wecomWebhook || "").trim(),
      wecomMobiles: String(config.wecomMobiles || "").trim(),
      pushplusToken: String(config.pushplusToken || "").trim(),
      customWebhook: String(config.customWebhook || "").trim(),
      barkUrl: String(config.barkUrl || "").trim(),
      aiProvider: String(config.aiProvider || "doubao"),
      aiApiKey: String(config.aiApiKey || "").trim(),
      aiModel: String(config.aiModel || "").trim(),
      aiEndpoint: String(config.aiEndpoint || "").trim(),
      desktopEnabled: Boolean(config.desktopEnabled),
      soundEnabled: Boolean(config.soundEnabled),
      pushOnLow: config.pushOnLow !== false,
      pushOnHigh: config.pushOnHigh !== false,
      pushOnCost: config.pushOnCost !== false,
      pushOnExpired: Boolean(config.pushOnExpired),
      channelHistory: history,
      updatedAt: lastChannelsUpdatedAt,
    };
  }

  function formatHistoryChipLabel(field, val) {
    const s = String(val || "").trim();
    if (field === "pushplusToken") {
      if (s.length <= 8) return s;
      return `${s.slice(0, 4)}****${s.slice(-4)}`;
    }
    if (field === "wecomWebhook") {
      const keyMatch = s.match(/key=([^&]+)/i);
      const tail = keyMatch ? keyMatch[1].slice(-6) : s.slice(-8);
      return `企微 ...${tail}`;
    }
    if (field === "customWebhook") {
      const prefix = s.includes("feishu") || s.includes("lark") ? "飞书" : s.includes("dingtalk") ? "钉钉" : "Webhook";
      return `${prefix} ...${s.slice(-6)}`;
    }
    if (field === "barkUrl") {
      const tail = s.replace(/\/+$/, "").split("/").pop() || s.slice(-8);
      return `Bark ...${tail.slice(-6)}`;
    }
    return s.length > 18 ? `${s.slice(0, 16)}…` : s;
  }

  function renderChannelHistoryUI() {
    const history = ensureChannelHistoryShape(config.channelHistory);
    for (const field of CHANNEL_STRING_FIELDS) {
      const datalist = $(`list_${field}`);
      const chipsBox = $(`chips_${field}`);
      const items = history[field] || [];
      if (datalist) {
        datalist.innerHTML = items.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
      }
      if (chipsBox) {
        const curVal = String(config[field] || "").trim();
        if (items.length === 0) {
          chipsBox.innerHTML = "";
        } else {
          chipsBox.innerHTML = items
            .map((v, idx) => {
              const activeCls = v === curVal ? " active" : "";
              const tip = field === "pushplusToken" ? "点击填入已记住的 PushPlus Token" : `点击填入：${v}`;
              return `<span class="history-chip${activeCls}" data-field="${field}" data-idx="${idx}" title="${escapeHtml(tip)}">${escapeHtml(formatHistoryChipLabel(field, v))}</span>`;
            })
            .join("");
        }
      }
    }
  }

  function updatePushSaveStatus(overrideText = "", isWarn = false) {
    const el = $("pushSaveStatus");
    if (!el) return;
    if (overrideText) {
      el.textContent = overrideText;
      el.className = `save-status${isWarn ? " warn" : ""}`;
      return;
    }
    const configured = [];
    if (config.desktopEnabled) configured.push("桌面弹窗");
    if (String(config.wecomWebhook || "").trim()) configured.push("企微");
    if (String(config.pushplusToken || "").trim()) configured.push("PushPlus");
    if (String(config.customWebhook || "").trim()) configured.push("飞书/钉钉");
    if (String(config.barkUrl || "").trim()) configured.push("Bark");

    const onLow = config.pushOnLow !== false;
    const onHigh = config.pushOnHigh !== false;
    const onCost = config.pushOnCost !== false;
    const onExpired = Boolean(config.pushOnExpired);
    const dirParts = [];
    if (onLow) dirParts.push("跌破");
    if (onHigh) dirParts.push("突破");
    if (onCost) dirParts.push("预算");
    if (onExpired) dirParts.push("过保");
    const dirText = dirParts.length > 0 ? `${dirParts.join("+")}提醒` : "仅页内标亮不提醒";
    if (configured.length === 0) {
      el.textContent = `暂未启用推送渠道（策略：${dirText}，填写后自动记住）`;
      el.className = "save-status warn";
    } else {
      el.textContent = `已持久化记住 ${configured.length} 个渠道：${configured.join(" · ")}（${dirText}）✓`;
      el.className = "save-status";
    }
  }

  function saveChannels(recordHistory = false, showNotice = false) {
    const payload = buildChannelPayload(recordHistory);

    // 第 1 层：同步写入当前域名 localStorage 备份（即使刚点过扩展刷新导致 context 失效也绝不丢数据）
    try {
      window.localStorage.setItem(CHANNELS_BACKUP_KEY, JSON.stringify(payload));
    } catch {
      // 忽略隐私模式或配额限制
    }

    // 第 2 & 3 层：写入 chrome.storage.local 与 chrome.storage.sync（跨页面/跨刷新永久保留）
    if (isExtensionAlive()) {
      try {
        chrome.storage.local.set({ [CHANNELS_STORAGE_KEY]: payload });
      } catch {
        // 忽略瞬时异常
      }
      try {
        if (chrome.storage.sync) {
          chrome.storage.sync.set({ [CHANNELS_STORAGE_KEY]: payload });
        }
      } catch {
        // 忽略 sync 禁用或配额异常
      }
      renderChannelHistoryUI();
      updatePushSaveStatus();
      if (showNotice) {
        showToast("5 大推送渠道配置已永久保存（刷新页面/重启浏览器不丢失）", 3200);
      }
    } else {
      renderChannelHistoryUI();
      updatePushSaveStatus("已暂存本地备份，刷新当前网页后自动同步到插件", true);
      if (showNotice) {
        showToast("检测到插件刚刷新：配置已暂存本地，刷新本页后会自动恢复并生效", 4500);
      }
    }
  }

  function saveConfig() {
    if (!isConfigHydrated) return;
    // 仅持久化监控与 UI 配置，不覆盖独立的 CHANNELS_STORAGE_KEY，杜绝多标签页互相冲掉推送 Token 与 AI Key
    const nonChannelConfig = { ...config, configUpdatedAt: Date.now() };
    for (const f of [...CHANNEL_STRING_FIELDS, ...AI_STRING_FIELDS, ...CHANNEL_BOOL_FIELDS, "pushDirection", "channelHistory"]) {
      delete nonChannelConfig[f];
    }
    try {
      window.localStorage.setItem(CONFIG_BACKUP_KEY, JSON.stringify(nonChannelConfig));
    } catch {
      // 忽略本地备份异常
    }
    if (!isExtensionAlive()) return;
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: nonChannelConfig });
    } catch {
      // 忽略扩展上下文失效
    }
  }

  function syncAiProviderPlaceholders() {
    const p = config.aiProvider || "doubao";
    const preset = AI_PROVIDER_DEFAULTS[p] || AI_PROVIDER_DEFAULTS.custom;
    const epEl = $("aiEndpoint");
    const mdEl = $("aiModel");
    if (epEl) {
      epEl.placeholder = preset.endpoint || "https://你的兼容接口地址/v1/chat/completions";
    }
    if (mdEl) {
      mdEl.placeholder = preset.model ? `如 ${preset.model}` : "填写模型名称";
    }
  }

  function applyChannelsToInputs(skipFocused = false) {
    // 防串台自愈：若选了 DeepSeek/智谱/通义 等内置厂商，但接口地址残留为其他内置厂商地址（如旧默认豆包地址），自动纠偏
    const curProvider = config.aiProvider || "doubao";
    const curPreset = AI_PROVIDER_DEFAULTS[curProvider];
    if (curPreset && curProvider !== "custom") {
      const otherPresetUrls = Object.entries(AI_PROVIDER_DEFAULTS)
        .filter(([k, v]) => k !== curProvider && v.endpoint)
        .map(([, v]) => v.endpoint);
      const curEp = String(config.aiEndpoint || "").trim();
      if (!curEp || otherPresetUrls.includes(curEp)) {
        config.aiEndpoint = curPreset.endpoint;
      }
    }
    const activeEl = shadow.activeElement;
    for (const field of [...CHANNEL_STRING_FIELDS, ...AI_STRING_FIELDS]) {
      const input = $(field);
      if (!input) continue;
      if (skipFocused && activeEl === input) continue;
      input.value = config[field] || "";
    }
    syncAiProviderPlaceholders();
    $("desktopEnabled").checked = Boolean(config.desktopEnabled);
    $("soundEnabled").checked = Boolean(config.soundEnabled);
    $("pushOnLow").checked = config.pushOnLow !== false;
    $("pushOnHigh").checked = config.pushOnHigh !== false;
    $("pushOnCost").checked = config.pushOnCost !== false;
    $("pushOnExpired").checked = Boolean(config.pushOnExpired);
    renderChannelHistoryUI();
    updatePushSaveStatus();
    syncAiEngineBadge();
  }

  function applyConfigToInputs() {
    $("roiHeaderKeyword").value = config.roiHeaderKeyword;
    $("costHeaderKeyword").value = config.costHeaderKeyword;
    $("nameHeaderKeyword").value = config.nameHeaderKeyword;
    $("minCost").value = config.minCost;
    $("lowerLimit").value = config.lowerLimit;
    $("upperLimit").value = config.upperLimit;
    $("costAlertEnabled").checked = config.costAlertEnabled !== false;
    $("balanceAlertEnabled").checked = config.balanceAlertEnabled !== false;
    $("markExpiredGuarantee").checked = config.markExpiredGuarantee !== false;
    $("budgetWarnPercent").value = config.budgetWarnPercent ?? "80";
    $("balanceWarnThreshold").value = config.balanceWarnThreshold ?? "1000";
    $("overallCostLimit").value = config.overallCostLimit ?? "";
    $("singleCostLimit").value = config.singleCostLimit ?? "";
    $("lowCooldownMin").value = config.lowCooldownMin ?? 30;
    $("highCooldownMin").value = config.highCooldownMin ?? 30;
    $("costCooldownMin").value = config.costCooldownMin ?? 3;
    $("mergeBatchAlerts").checked = config.mergeBatchAlerts !== false;
    $("summaryReportEnabled").checked = config.summaryReportEnabled !== false;
    $("summaryIntervalMin").value = config.summaryIntervalMin ?? 30;
    $("refreshIntervalSec").value = config.refreshIntervalSec;
    $("preferredPageSize").value = String(config.preferredPageSize || "100");
    $("autoOptimizeViewOnStart").checked = config.autoOptimizeViewOnStart !== false;
    const pageSizeBtn = $("applyPageSizeBtn");
    if (pageSizeBtn) pageSizeBtn.textContent = `📄 切每页${config.preferredPageSize || "100"}条`;
    $("staleMinutes").value = config.staleMinutes;
    $("onlyDelivering").checked = Boolean(config.onlyDelivering);
    $("onlyRegulating").checked = Boolean(config.onlyRegulating);
    $("highlightAbnormalRows").checked = config.highlightAbnormalRows !== false;
    $("autoClickRefresh").checked = Boolean(config.autoClickRefresh);
    $("anomalyAlertEnabled").checked = Boolean(config.anomalyAlertEnabled);
    applyChannelsToInputs(false);
    renderSelectorPreview();
    syncCompactMode();
    syncLandscapeMode();
    syncCollapsedSections();
    switchMode(config.mode, false);
    updateSummaryNextHint();
    syncMonitorButton();
  }

  function setViewMode(isDashboard) {
    config.compactMode = Boolean(isDashboard);
    saveConfig();
    syncCompactMode();
  }

  function bindEvents() {
    enablePanelDragging();
    window.addEventListener("resize", clampHostIntoViewport);
    $("pillBtn").addEventListener("click", () => {
      if (pillWasDragged) return;
      setPanelOpen(true);
    });
    $("collapseBtn").addEventListener("click", () => setPanelOpen(false));

    // 所有大区块均支持独立点击标题栏折叠 / 展开（自动持久化记忆）
    shadow.querySelectorAll(".collapsible-head[data-sec-toggle]").forEach((head) => {
      head.addEventListener("click", (e) => {
        if (e.target.closest?.("button, input, select, a, .help-link")) return;
        const secId = head.getAttribute("data-sec-toggle");
        if (!secId) return;
        if (!config.collapsedSections || typeof config.collapsedSections !== "object") {
          config.collapsedSections = { ...DEFAULT_CONFIG.collapsedSections };
        }
        config.collapsedSections[secId] = !config.collapsedSections[secId];
        syncCollapsedSections();
        saveConfig();
      });
    });
    $("landscapeModeBtn").addEventListener("click", () => {
      config.landscapeMode = !config.landscapeMode;
      saveConfig();
      syncLandscapeMode();
    });
    $("compactModeBtn").addEventListener("click", () => {
      setViewMode(!config.compactMode);
    });
    $("viewDashboardBtn")?.addEventListener("click", () => setViewMode(true));
    $("viewConfigBtn")?.addEventListener("click", () => setViewMode(false));
    $("finishConfigBtn")?.addEventListener("click", () => {
      setViewMode(true);
      showToast("已切换到日常盯盘简洁视图", 1800);
    });

    $("abnormalFilterGroup").addEventListener("click", (e) => {
      const pill = e.target.closest?.(".mini-pill[data-filter]");
      if (!pill) return;
      config.abnormalFilter = pill.dataset.filter || "all";
      saveConfig();
      refreshAbnormalView();
    });

    $("sortOrderToggle").addEventListener("click", () => {
      config.abnormalSort = config.abnormalSort === "extreme" ? "table" : "extreme";
      saveConfig();
      refreshAbnormalView();
    });

    $("prevAbnormalBtn").addEventListener("click", () => stepAbnormalItem(-1));
    $("nextAbnormalBtn").addEventListener("click", () => stepAbnormalItem(1));

    $("tabBoth").addEventListener("click", () => switchMode("both", true));
    $("tabSingle").addEventListener("click", () => switchMode("single", true));
    $("tabTable").addEventListener("click", () => switchMode("table", true));

    $("toggleMonitorBtn").addEventListener("click", () => {
      if (config.enabled) {
        stopMonitoring(true);
      } else {
        const activeBinding = getActivePageBinding();
        const existingEl = activeBinding.selector ? document.querySelector(activeBinding.selector) : null;
        if ((config.mode === "single" || config.mode === "both") && !existingEl) {
          const found = autoFindRoiElement();
          if (found) {
            setActivePageBinding(found.selector, found.label);
            showToast(`已自动识别「${found.label}」(${found.value}) 并开始监控`, 3500);
          } else if (config.mode === "single") {
            showToast("请先点选页面上的 ROI 数字，或切到“整体+多计划”模式", 4000);
            return;
          } else {
            showToast("已启动计划列表监控；如需同时盯整体 ROI，请点一下“点选页面整体 ROI”", 4500);
          }
        }
        startMonitoring();
      }
    });

    $("pickElementBtn").addEventListener("click", enterPickerMode);

    $("autoFindRoiBtn").addEventListener("click", () => {
      const found = autoFindRoiElement();
      if (found) {
        setActivePageBinding(found.selector, found.label);
        showToast(`自动识别成功：${found.label} = ${found.value}`, 3500);
        if (config.enabled) evaluateNow();
      } else {
        showToast("未自动找到 ROI 数字，请点击左侧“点选页面整体 ROI”手动点一下", 4000);
      }
    });

    $("copyDiagBtn").addEventListener("click", async () => {
      const report = buildDomDiagnosticReport();
      const jsonText = JSON.stringify(report, null, 2);
      try {
        await navigator.clipboard.writeText(jsonText);
        showToast(`诊断 JSON 已复制（当前扫描到 ${report.scannedCount} 条计划）`, 4000);
      } catch {
        console.log("[QC-ROI-DIAG]", jsonText);
        showToast("剪贴板无权限，已输出到 F12 Console 的 [QC-ROI-DIAG]", 4500);
      }
    });

    $("savePushBtn").addEventListener("click", () => {
      for (const field of CHANNEL_STRING_FIELDS) {
        config[field] = ($(field)?.value || "").trim();
      }
      saveChannels(true, true);
    });

    // 5 大推送渠道「教程?」全部展开/收起 & 单渠道「怎么获取?」点击展开
    const guideIds = ["guide_desktop", "guide_wecom", "guide_pushplus", "guide_custom", "guide_bark"];
    $("toggleAllGuideBtn").addEventListener("click", () => {
      const anyClosed = guideIds.some((id) => !$(id)?.classList.contains("show"));
      guideIds.forEach((id) => $(id)?.classList.toggle("show", anyClosed));
      $("toggleAllGuideBtn").textContent = anyClosed ? "收起教程" : "教程?";
    });
    shadow.querySelectorAll(".help-link[data-guide]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = link.getAttribute("data-guide");
        if (targetId && $(targetId)) {
          $(targetId).classList.toggle("show");
        }
      });
    });

    $("togglePushplusVisBtn").addEventListener("click", () => {
      const inp = $("pushplusToken");
      const btn = $("togglePushplusVisBtn");
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.textContent = show ? "隐藏" : "显示";
    });

    $("testPushBtn").addEventListener("click", () => {
      for (const field of CHANNEL_STRING_FIELDS) {
        config[field] = ($(field)?.value || "").trim();
      }
      saveChannels(true, false);
      playBeep("high");
      dispatchToBackground(
        {
          title: "✅ 千川 ROI 监控测试推送",
          summary: "推送通道连接正常！突破上下限或页面异常时你将在这里实时收到告警。",
          detailLines: [
            `测试时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
            `当前设置区间：[${config.lowerLimit || "-∞"}, ${config.upperLimit || "+∞"}]`,
          ],
          level: "high",
        },
        true
      );
    });

    $("clearLogsBtn").addEventListener("click", () => {
      alertLogs = [];
      clearPersistedCooldowns();
      $("logsContainer").innerHTML = '<div class="muted">暂无告警记录（跨页持久化冷却已重置）</div>';
    });

    const authorQrImg = $("authorQrImg");
    if (authorQrImg) {
      try {
        authorQrImg.src = isExtensionAlive() && chrome.runtime?.getURL
          ? chrome.runtime.getURL("icons/wechat-qr.jpg")
          : "icons/wechat-qr.jpg";
      } catch {
        authorQrImg.src = "icons/wechat-qr.jpg";
      }
    }

    async function copyAuthorWechat() {
      const wx = "OliverRockwell";
      try {
        await navigator.clipboard.writeText(wx);
        showToast(`已复制微信号：${wx}（有什么需求也可以找我聊）`, 3500);
      } catch {
        showToast(`作者微信号：${wx}（请手动复制）`, 4000);
      }
    }

    function setWechatQrModalOpen(open) {
      const modal = $("wechatQrModal");
      if (!modal) return;
      modal.classList.toggle("open", open);
      modal.setAttribute("aria-hidden", open ? "false" : "true");
    }

    $("contactAuthorBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!config.collapsedSections || typeof config.collapsedSections !== "object") {
        config.collapsedSections = { ...DEFAULT_CONFIG.collapsedSections };
      }
      if (config.collapsedSections.sec_author) {
        config.collapsedSections.sec_author = false;
        syncCollapsedSections();
        saveConfig();
      }
      const panelEl = $("panel");
      const footerEl = $("feedbackFooter");
      requestAnimationFrame(() => {
        if (panelEl) {
          panelEl.scrollTo({ top: panelEl.scrollHeight, behavior: "smooth" });
        }
        if (footerEl) {
          footerEl.scrollIntoView({ behavior: "smooth", block: "end" });
          footerEl.classList.remove("feedback-flash");
          void footerEl.offsetWidth;
          footerEl.classList.add("feedback-flash");
          clearTimeout(footerEl._flashTimer);
          footerEl._flashTimer = setTimeout(() => footerEl.classList.remove("feedback-flash"), 1600);
        }
      });
    });
    $("copyWechatBtn")?.addEventListener("click", copyAuthorWechat);
    $("modalCopyWechatBtn")?.addEventListener("click", copyAuthorWechat);
    $("footerWechatId")?.addEventListener("click", (e) => {
      e.stopPropagation();
      setWechatQrModalOpen(true);
    });
    $("closeWechatQrBtn")?.addEventListener("click", () => setWechatQrModalOpen(false));
    $("wechatQrModal")?.addEventListener("click", (e) => {
      if (e.target === $("wechatQrModal")) {
        setWechatQrModalOpen(false);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("wechatQrModal")?.classList.contains("open")) {
        setWechatQrModalOpen(false);
      }
    });

    $("sendSummaryNowBtn").addEventListener("click", () => {
      buildAndSendSummaryReport({ isManual: true, shouldPush: true });
    });

    $("refreshSummaryPanelBtn").addEventListener("click", () => {
      buildAndSendSummaryReport({ isManual: true, shouldPush: false });
    });

    $("sendSummaryCardBtn").addEventListener("click", () => {
      buildAndSendSummaryReport({ isManual: true, shouldPush: true });
    });

    $("copySummaryBtn").addEventListener("click", async () => {
      const txt = healthState.latestSummaryText || $("summaryReportContent")?.textContent || "";
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        showToast("已复制当前投流总结报告", 2400);
      } catch {
        showToast("复制失败，请手动选中总结框内文字复制", 3000);
      }
    });

    $("toggleAiKeyVisBtn").addEventListener("click", () => {
      const inp = $("aiApiKey");
      const btn = $("toggleAiKeyVisBtn");
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.textContent = show ? "隐藏" : "显示";
    });

    $("aiProvider").addEventListener("change", (e) => {
      const p = e.target.value || "doubao";
      config.aiProvider = p;
      const preset = AI_PROVIDER_DEFAULTS[p];
      if (preset && p !== "custom") {
        config.aiEndpoint = preset.endpoint;
        config.aiModel = preset.model;
        $("aiEndpoint").value = preset.endpoint;
        $("aiModel").value = preset.model;
      }
      syncAiProviderPlaceholders();
      saveChannels(false, false);
      syncAiEngineBadge();
    });

    ["aiApiKey", "aiModel", "aiEndpoint"].forEach((key) => {
      const el = $(key);
      if (!el) return;
      const onUpdate = () => {
        config[key] = el.value.trim();
        saveChannels(false, false);
        syncAiEngineBadge();
      };
      el.addEventListener("input", onUpdate);
      el.addEventListener("change", onUpdate);
      el.addEventListener("blur", onUpdate);
    });

    // 普通监控参数字段
    const monitorTextFields = [
      "roiHeaderKeyword",
      "costHeaderKeyword",
      "nameHeaderKeyword",
      "minCost",
      "lowerLimit",
      "upperLimit",
      "budgetWarnPercent",
      "balanceWarnThreshold",
      "overallCostLimit",
      "singleCostLimit",
      "lowCooldownMin",
      "highCooldownMin",
      "costCooldownMin",
      "summaryIntervalMin",
      "refreshIntervalSec",
      "staleMinutes",
    ];
    monitorTextFields.forEach((key) => {
      const el = $(key);
      if (!el) return;
      el.addEventListener("input", (e) => {
        config[key] = e.target.value;
        saveConfig();
        if (key === "summaryIntervalMin") updateSummaryNextHint();
        if (config.enabled) evaluateNow();
      });
    });

    $("balanceAlertEnabled")?.addEventListener("change", (e) => {
      config.balanceAlertEnabled = e.target.checked;
      saveConfig();
      if (config.enabled) evaluateNow();
    });

    $("preferredPageSize")?.addEventListener("change", (e) => {
      config.preferredPageSize = e.target.value || "100";
      const pageSizeBtn = $("applyPageSizeBtn");
      if (pageSizeBtn) pageSizeBtn.textContent = `📄 切每页${config.preferredPageSize}条`;
      saveConfig();
      trySetTablePageSize(Number(config.preferredPageSize), false);
    });

    $("autoOptimizeViewOnStart")?.addEventListener("change", (e) => {
      config.autoOptimizeViewOnStart = e.target.checked;
      saveConfig();
    });

    $("sortCostDescBtn")?.addEventListener("click", () => {
      trySortTableByCostDesc(false);
    });

    $("applyPageSizeBtn")?.addEventListener("click", () => {
      const target = Number(config.preferredPageSize || 100);
      trySetTablePageSize(target, false);
    });

    $("abnormalSearchInput")?.addEventListener("input", (e) => {
      healthState.abnormalSearchQuery = e.target.value || "";
      refreshAbnormalView(allAbnormalItems);
    });

    let latestUpdateInfo = null;

    function setUpdateButtonLit(hasUpdate, versionStr) {
      const btn = $("checkUpdateBtn");
      if (!btn) return;
      btn.classList.toggle("has-update", Boolean(hasUpdate));
      btn.textContent = hasUpdate ? "有新版" : "更新";
      btn.title = hasUpdate
        ? `发现新版本 v${versionStr}，点击查看或忽略`
        : "检查官网 kamisama.si 是否有新版本可更新";
    }

    async function runUpdateCheck(isSilent) {
      const btn = $("checkUpdateBtn");
      const banner = $("updateBanner");
      const textEl = $("updateBannerText");
      const linkEl = $("updateDownloadLink");
      const ignoreBtn = $("ignoreUpdateBtn");
      if (!isExtensionAlive()) {
        if (!isSilent) showToast("插件已刷新，请先按 F5 刷新当前页面后再检查更新", 3200);
        return;
      }
      if (!isSilent && btn) btn.textContent = "检查中...";
      const res = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: "CHECK_EXTENSION_UPDATE" }, (r) =>
            resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "检查失败" })
          );
        } catch (err) {
          resolve({ ok: false, error: String(err) });
        }
      });
      if (!res || !res.ok) {
        if (!isSilent) {
          setUpdateButtonLit(false, "");
          if (banner && textEl && linkEl) {
            textEl.textContent = "暂时连不上官网，可点右侧直接访问 kamisama.si 获取最新版";
            linkEl.href = "https://www.kamisama.si";
            linkEl.textContent = "打开官网";
            if (ignoreBtn) ignoreBtn.style.display = "none";
            banner.classList.add("show");
          }
        }
        return;
      }
      latestUpdateInfo = res;
      const isIgnored = Boolean(config.ignoredUpdateVersion && config.ignoredUpdateVersion === res.latestVersion);
      if (res.hasUpdate) {
        setUpdateButtonLit(!isIgnored, res.latestVersion);
        if (!isSilent && banner && textEl && linkEl) {
          const notePart = res.notes ? `（${res.notes.slice(0, 36)}）` : "";
          textEl.textContent = `🎉 发现新版本 v${res.latestVersion}（当前 v${res.currentVersion}）${notePart}：覆盖原目录并重载即可，全部配置自动保留`;
          linkEl.href = res.downloadUrl || res.pageUrl;
          linkEl.textContent = `下载 v${res.latestVersion}`;
          if (ignoreBtn) ignoreBtn.style.display = "inline-block";
          banner.classList.add("show");
        }
      } else {
        setUpdateButtonLit(false, "");
        if (!isSilent) {
          showToast(`当前已是最新版 v${res.currentVersion} ✓`, 3000);
          if (banner && textEl && linkEl) {
            textEl.textContent = `当前已是最新版 v${res.currentVersion} ✓（官网最新 v${res.latestVersion}）`;
            linkEl.href = res.pageUrl || "https://www.kamisama.si";
            linkEl.textContent = "去官网看看";
            if (ignoreBtn) ignoreBtn.style.display = "none";
            banner.classList.add("show");
          }
        }
      }
    }

    $("closeUpdateBannerBtn")?.addEventListener("click", () => {
      $("updateBanner")?.classList.remove("show");
    });

    $("ignoreUpdateBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (latestUpdateInfo?.latestVersion) {
        config.ignoredUpdateVersion = latestUpdateInfo.latestVersion;
        saveConfig();
        setUpdateButtonLit(false, "");
        $("updateBanner")?.classList.remove("show");
        showToast(`已忽略 v${latestUpdateInfo.latestVersion} 更新提醒（后续有更新版本再提醒）`, 3200);
      }
    });

    $("checkUpdateBtn")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await runUpdateCheck(false);
    });

    // 启动后 2.5 秒静默检查一次新版本，有新版自动点亮顶部「有新版」提示（已忽略版本不亮）
    setTimeout(() => runUpdateCheck(true), 2500);

    // 5 大推送渠道文本字段：监听 input / change / blur，实时写入三层持久化存储并记住历史记录
    CHANNEL_STRING_FIELDS.forEach((key) => {
      const inputEl = $(key);
      const handleChannelUpdate = (recordHistory) => {
        config[key] = inputEl.value.trim();
        saveChannels(recordHistory, false);
      };
      inputEl.addEventListener("input", () => handleChannelUpdate(false));
      inputEl.addEventListener("change", () => handleChannelUpdate(true));
      inputEl.addEventListener("blur", () => handleChannelUpdate(true));

      const chipsBox = $(`chips_${key}`);
      if (chipsBox) {
        chipsBox.addEventListener("click", (e) => {
          const chip = e.target.closest?.(".history-chip");
          if (!chip) return;
          const idx = Number(chip.dataset.idx);
          const list = config.channelHistory?.[key] || [];
          const picked = list[idx];
          if (!picked) return;
          config[key] = picked;
          inputEl.value = picked;
          saveChannels(true, false);
          showToast("已切换到已记住的推送配置并保存", 2000);
        });
      }
    });

    $("abnormalList").addEventListener("click", (e) => {
      const card = e.target.closest?.(".abnormal-item");
      if (!card) return;
      const idx = Number(card.dataset.idx);
      if (Number.isInteger(idx)) {
        focusAbnormalItem(idx);
      }
    });

    const monitorCheckFields = [
      "onlyDelivering",
      "onlyRegulating",
      "highlightAbnormalRows",
      "costAlertEnabled",
      "markExpiredGuarantee",
      "mergeBatchAlerts",
      "summaryReportEnabled",
      "autoClickRefresh",
      "anomalyAlertEnabled",
    ];
    monitorCheckFields.forEach((key) => {
      const el = $(key);
      if (!el) return;
      el.addEventListener("change", (e) => {
        config[key] = e.target.checked;
        saveConfig();
        if (key === "summaryReportEnabled") updateSummaryNextHint();
        if (key === "autoClickRefresh" && config.enabled) {
          startMonitoring();
        } else if (config.enabled) {
          evaluateNow();
        }
      });
    });

    CHANNEL_BOOL_FIELDS.forEach((key) => {
      $(key).addEventListener("change", (e) => {
        config[key] = e.target.checked;
        saveChannels(false, false);
        if ((key === "pushOnLow" || key === "pushOnHigh" || key === "pushOnCost" || key === "pushOnExpired") && config.enabled) {
          evaluateNow();
        }
      });
    });
  }

  // 多标签页实时同步：在任意千川标签页修改推送渠道或触发告警冷却，其他标签页立即更新，绝不互相覆盖或双倍推送
  if (isExtensionAlive() && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" && areaName !== "sync") return;
      const cdChange = changes[COOLDOWN_STORAGE_KEY];
      if (cdChange && cdChange.newValue && areaName === "local") {
        const incCd = cdChange.newValue;
        const incCdTs = Number(incCd.updatedAt || 0);
        if (incCdTs > lastCooldownSyncTs) {
          lastCooldownSyncTs = incCdTs;
          if (!incCd.entries || Object.keys(incCd.entries).length === 0) {
            cooldownMap.clear();
          } else {
            applyCooldownPayload(incCd);
          }
          try {
            window.localStorage.setItem(COOLDOWN_BACKUP_KEY, JSON.stringify(incCd));
          } catch {
            // ignore
          }
        }
      }
      const chChange = changes[CHANNELS_STORAGE_KEY];
      if (!chChange || !chChange.newValue) return;
      const incoming = chChange.newValue;
      const incomingTs = Number(incoming.updatedAt || 0);
      if (incomingTs <= lastChannelsUpdatedAt) return;
      lastChannelsUpdatedAt = incomingTs;
      for (const f of [...CHANNEL_STRING_FIELDS, ...AI_STRING_FIELDS]) {
        if (typeof incoming[f] === "string") config[f] = incoming[f];
      }
      for (const f of CHANNEL_BOOL_FIELDS) {
        if (typeof incoming[f] === "boolean") config[f] = incoming[f];
      }
      config.channelHistory = mergeHistoryMaps(incoming.channelHistory, config.channelHistory);
      try {
        window.localStorage.setItem(CHANNELS_BACKUP_KEY, JSON.stringify(incoming));
      } catch {
        // ignore
      }
      applyChannelsToInputs(true);
    });
  }

  // 响应点击浏览器扩展图标切换面板
  if (isExtensionAlive() && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "TOGGLE_PANEL") {
        setPanelOpen(!isExpanded);
      } else if (msg?.type === "OPEN_PANEL") {
        setPanelOpen(true);
      }
    });
  }

  // 读取三层持久化存储并合并（chrome.storage.local + chrome.storage.sync + localStorage 灾备 + 旧版配置平滑迁移）
  async function hydrateConfigAndStart() {
    let localRes = {};
    let syncRes = {};
    let backupChannels = null;

    if (isExtensionAlive()) {
      localRes = await new Promise((resolve) => {
        try {
          chrome.storage.local.get([STORAGE_KEY, CHANNELS_STORAGE_KEY], (r) => resolve(r || {}));
        } catch {
          resolve({});
        }
      });
      syncRes = await new Promise((resolve) => {
        try {
          if (chrome.storage.sync) {
            chrome.storage.sync.get([CHANNELS_STORAGE_KEY], (r) => resolve(r || {}));
          } else {
            resolve({});
          }
        } catch {
          resolve({});
        }
      });
    }

    try {
      const rawBackup = window.localStorage.getItem(CHANNELS_BACKUP_KEY);
      if (rawBackup) backupChannels = JSON.parse(rawBackup);
    } catch {
      backupChannels = null;
    }

    let backupConfig = null;
    try {
      const rawCfgBackup = window.localStorage.getItem(CONFIG_BACKUP_KEY);
      if (rawCfgBackup) backupConfig = JSON.parse(rawCfgBackup);
    } catch {
      backupConfig = null;
    }

    const legacyCfg = localRes?.[STORAGE_KEY] || backupConfig || null;
    if (legacyCfg) {
      config = {
        ...config,
        ...(backupConfig && typeof backupConfig === "object" ? backupConfig : {}),
        ...(localRes?.[STORAGE_KEY] && typeof localRes[STORAGE_KEY] === "object" ? localRes[STORAGE_KEY] : {}),
        collapsedSections: {
          ...DEFAULT_CONFIG.collapsedSections,
          ...(backupConfig?.collapsedSections && typeof backupConfig.collapsedSections === "object"
            ? backupConfig.collapsedSections
            : {}),
          ...(localRes?.[STORAGE_KEY]?.collapsedSections && typeof localRes[STORAGE_KEY].collapsedSections === "object"
            ? localRes[STORAGE_KEY].collapsedSections
            : {}),
        },
      };
    }

    // 汇总 4 个来源的推送渠道，按 updatedAt 最新优先；若是旧版首次迁移（updatedAt=0）则用非空值补齐
    const legacyChannels = legacyCfg
      ? {
          wecomWebhook: legacyCfg.wecomWebhook || "",
          wecomMobiles: legacyCfg.wecomMobiles || "",
          pushplusToken: legacyCfg.pushplusToken || "",
          customWebhook: legacyCfg.customWebhook || "",
          barkUrl: legacyCfg.barkUrl || "",
          desktopEnabled: legacyCfg.desktopEnabled ?? true,
          soundEnabled: legacyCfg.soundEnabled ?? true,
          updatedAt: 0,
        }
      : null;

    const channelSources = [localRes?.[CHANNELS_STORAGE_KEY], syncRes?.[CHANNELS_STORAGE_KEY], backupChannels, legacyChannels]
      .filter((s) => s && typeof s === "object")
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    if (channelSources.length > 0) {
      const primary = channelSources[0];
      lastChannelsUpdatedAt = Number(primary.updatedAt || 0);
      for (const f of [...CHANNEL_STRING_FIELDS, ...AI_STRING_FIELDS]) {
        let val = typeof primary[f] === "string" ? primary[f].trim() : "";
        // 如果最新源尚未初始化（updatedAt===0）且为空，则从其他备份里找非空值兜底
        if (!val && lastChannelsUpdatedAt === 0) {
          for (const alt of channelSources.slice(1)) {
            if (typeof alt[f] === "string" && alt[f].trim()) {
              val = alt[f].trim();
              break;
            }
          }
        }
        if (val || CHANNEL_STRING_FIELDS.includes(f) || f === "aiApiKey") {
          config[f] = val;
        }
      }
      for (const f of CHANNEL_BOOL_FIELDS) {
        if (typeof primary[f] === "boolean") {
          config[f] = primary[f];
        }
      }
      // 兼容旧版未单独保存 pushOnLow / pushOnHigh / pushOnCost / pushOnExpired 时设置默认值
      if (typeof primary.pushOnLow !== "boolean") config.pushOnLow = true;
      if (typeof primary.pushOnHigh !== "boolean") config.pushOnHigh = true;
      if (typeof primary.pushOnCost !== "boolean") config.pushOnCost = true;
      if (typeof primary.pushOnExpired !== "boolean") config.pushOnExpired = false;
      config.channelHistory = mergeHistoryMaps(
        ...channelSources.map((s) => s.channelHistory),
        ...channelSources.map((s) => {
          const singleMap = {};
          for (const f of CHANNEL_STRING_FIELDS) {
            if (typeof s[f] === "string" && s[f].trim()) singleMap[f] = [s[f].trim()];
          }
          return singleMap;
        })
      );

      // 若任一存储层落后（如刚从 localStorage 恢复或首次从旧版迁移），自动回填同步到全部三层
      const localTs = Number(localRes?.[CHANNELS_STORAGE_KEY]?.updatedAt || 0);
      const syncTs = Number(syncRes?.[CHANNELS_STORAGE_KEY]?.updatedAt || 0);
      if (lastChannelsUpdatedAt === 0 || localTs < lastChannelsUpdatedAt || syncTs < lastChannelsUpdatedAt) {
        saveChannels(true, false);
      }
    }

    isConfigHydrated = true;

    // 自动升级旧默认列关键词（覆盖乘方/调控任务表）
    let migrated = false;
    if (
      config.roiHeaderKeyword === PREV_DEFAULT_ROI_KEYWORD ||
      config.roiHeaderKeyword === "综合营销ROI,整体支付ROI,直接支付ROI,支付ROI,ROI"
    ) {
      config.roiHeaderKeyword = DEFAULT_CONFIG.roiHeaderKeyword;
      migrated = true;
    }
    if (config.costHeaderKeyword === "整体消耗,消耗") {
      config.costHeaderKeyword = DEFAULT_CONFIG.costHeaderKeyword;
      migrated = true;
    }
    if (PREV_DEFAULT_NAME_KEYWORDS.includes(config.nameHeaderKeyword)) {
      config.nameHeaderKeyword = DEFAULT_CONFIG.nameHeaderKeyword;
      migrated = true;
    }
    // 首次升级到含「仅调控中」版本时，将「仅投放中」与「仅调控中」同步设为默认勾选
    if (!legacyCfg || typeof legacyCfg.onlyRegulating !== "boolean") {
      config.onlyDelivering = true;
      config.onlyRegulating = true;
      migrated = true;
    }
    // 首次升级到 v1.3.1：默认展开「4. AI 投流大脑」、默认折叠底部「联系作者」
    if (!legacyCfg || !legacyCfg.migratedV131) {
      config.collapsedSections = {
        ...DEFAULT_CONFIG.collapsedSections,
        ...(config.collapsedSections && typeof config.collapsedSections === "object" ? config.collapsedSections : {}),
        sec_ai: false,
        sec_author: true,
      };
      config.migratedV131 = true;
      migrated = true;
    }
    // 首次升级到 v1.3.2：默认进入「日常盯盘」简洁版，并初始化分级推送冷却策略
    if (!legacyCfg || !legacyCfg.migratedV132) {
      config.compactMode = true;
      if (config.lowCooldownMin === undefined || config.lowCooldownMin === null || config.lowCooldownMin === "") {
        config.lowCooldownMin = 30;
      }
      if (config.highCooldownMin === undefined || config.highCooldownMin === null || config.highCooldownMin === "") {
        config.highCooldownMin = 30;
      }
      if (config.costCooldownMin === undefined || config.costCooldownMin === null || config.costCooldownMin === "") {
        config.costCooldownMin = 3;
      }
      if (typeof config.mergeBatchAlerts !== "boolean") config.mergeBatchAlerts = true;
      config.migratedV132 = true;
      migrated = true;
    }
    // 首次升级到 v1.3.3：默认横屏、默认最低消耗门槛 20 元、开启千川可用余额提醒
    if (!legacyCfg || !legacyCfg.migratedV133) {
      config.landscapeMode = true;
      if (Number(config.minCost) === 100 || config.minCost === undefined || config.minCost === null || config.minCost === "") {
        config.minCost = 20;
      }
      if (typeof config.balanceAlertEnabled !== "boolean") config.balanceAlertEnabled = true;
      if (config.balanceWarnThreshold === undefined || config.balanceWarnThreshold === null || config.balanceWarnThreshold === "") {
        config.balanceWarnThreshold = "1000";
      }
      config.migratedV133 = true;
      migrated = true;
    }
    if (migrated) saveConfig();

    // 必须在启动监控前恢复跨刷新持久化冷却表，确保 F5 刷新绝不重推
    await hydrateCooldownMap();

    applyConfigToInputs();
    if (config.enabled) {
      startMonitoring();
    }
    if (location.href.endsWith("demo.html")) {
      setPanelOpen(true);
    }
  }

  // 初始化
  bindEvents();
  hydrateConfigAndStart();
})();
