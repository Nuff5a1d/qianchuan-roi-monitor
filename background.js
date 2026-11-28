// 后台 Service Worker：负责跨域消息推送（企微/PushPlus/钉钉/飞书/Bark）、桌面通知以及任意网页一键注入面板

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch (err) {
    // 当前页面未自动注入时（例如其他自研后台或本地测试页），动态注入 content.js 并展开面板
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: "OPEN_PANEL" }).catch(() => {});
      }, 150);
    } catch (injectErr) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "ROI 监控无法在当前页启动",
        message: "Chrome 系统页/应用商店不支持注入，请在千川或普通网页上点击图标。",
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "DISPATCH_ALERT") {
    handleDispatchAlert(message.payload)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true; // 保持异步通道
  }
  if (message?.type === "GENERATE_AI_SUMMARY") {
    handleGenerateAiSummary(message.payload)
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === "CHECK_EXTENSION_UPDATE") {
    handleCheckExtensionUpdate()
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

function compareSemver(a, b) {
  const pa = String(a || "0").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function handleCheckExtensionUpdate() {
  const currentVersion = chrome.runtime.getManifest()?.version || "1.3.3";
  const pageUrl = "https://www.kamisama.si";
  const ts = Date.now();
  let latestVersion = "";
  let downloadUrl = "";
  let notes = "";

  // 1) 优先读取官网轻量版本清单 https://www.kamisama.si/version.json
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(`${pageUrl}/version.json?t=${ts}`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data && data.version) {
        latestVersion = String(data.version).replace(/^v/i, "").trim();
        downloadUrl = String(data.downloadUrl || "").trim();
        notes = String(data.notes || "").trim();
      }
    }
  } catch {
    // 若官网暂未放置 version.json，自动回退检查主页源码
  }

  // 2) 回退检测主页 HTML 中的安装包版本号
  if (!latestVersion) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(`${pageUrl}/?t=${ts}`, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (resp.ok) {
        const html = await resp.text();
        const zipMatch = html.match(/Kamisama-Qianchuan-v(\d+\.\d+\.\d+)\.zip/i);
        if (zipMatch) {
          latestVersion = zipMatch[1];
          downloadUrl = `${pageUrl}/downloads/Kamisama-Qianchuan-v${latestVersion}.zip`;
        }
      }
    } catch {
      // 网络不可达时返回当前版本与主页入口
    }
  }

  const hasUpdate = Boolean(latestVersion && compareSemver(latestVersion, currentVersion) > 0);
  return {
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    hasUpdate,
    downloadUrl: downloadUrl || pageUrl,
    pageUrl,
    notes,
    remoteChecked: Boolean(latestVersion),
  };
}

async function handleDispatchAlert(payload) {
  const { title, summary, detailLines, level } = payload;
  let channels = { ...(payload.channels || {}) };
  // 兜底：若页面侧有未同步或空字段，自动从 chrome.storage.local 持久化渠道补齐
  try {
    const stored = await chrome.storage.local.get(["qc_roi_monitor_channels_v1"]);
    const saved = stored?.qc_roi_monitor_channels_v1;
    if (saved) {
      if (channels.desktop === undefined) channels.desktop = Boolean(saved.desktopEnabled);
      if (!channels.wecomWebhook && saved.wecomWebhook) channels.wecomWebhook = saved.wecomWebhook;
      if (!channels.wecomMobiles && saved.wecomMobiles) channels.wecomMobiles = saved.wecomMobiles;
      if (!channels.pushplusToken && saved.pushplusToken) channels.pushplusToken = saved.pushplusToken;
      if (!channels.customWebhook && saved.customWebhook) channels.customWebhook = saved.customWebhook;
      if (!channels.barkUrl && saved.barkUrl) channels.barkUrl = saved.barkUrl;
    }
  } catch {
    // 忽略读取异常，继续使用传入配置
  }
  const results = [];
  const plainText = [title, summary, ...(detailLines || [])].filter(Boolean).join("\n");
  const markdownText = [
    `### ${title}`,
    `> ${summary}`,
    ...(detailLines || []).map((line) => `- ${line}`),
  ].join("\n");

  // 1. Chrome 桌面系统通知
  if (channels?.desktop) {
    try {
      await new Promise((resolve, reject) => {
        chrome.notifications.create(
          {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: title,
            message: [summary, ...(detailLines || []).slice(0, 2)].filter(Boolean).join("\n"),
            priority: 2,
          },
          (id) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(id);
          }
        );
      });
      results.push({ channel: "桌面通知", ok: true });
    } catch (e) {
      results.push({ channel: "桌面通知", ok: false, error: e.message });
    }
  }

  // 2. 企业微信群机器人 Webhook
  if (channels?.wecomWebhook?.trim()) {
    const url = channels.wecomWebhook.trim();
    const mentions = (channels.wecomMobiles || "")
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const isWarnLevel = level === "low" || level === "error" || level === "warn";
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: {
            content: isWarnLevel
              ? markdownText.replace(title, `<font color="warning">${title}</font>`)
              : markdownText.replace(title, `<font color="info">${title}</font>`),
          },
        }),
      });
      const data = await safeJson(resp);
      if (!resp.ok || (data && data.errcode !== 0)) {
        throw new Error(data?.errmsg || `HTTP ${resp.status}`);
      }
      // 企微 markdown 不支持直接 @手机号，如有指定 @ 人，补发一条极简 text 提醒
      if (mentions.length > 0) {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msgtype: "text",
            text: {
              content: `${title}：${summary}`,
              mentioned_mobile_list: mentions,
            },
          }),
        }).catch(() => {});
      }
      results.push({ channel: "企业微信", ok: true });
    } catch (e) {
      results.push({ channel: "企业微信", ok: false, error: e.message });
    }
  }

  // 3. PushPlus（个人微信服务号推送）
  if (channels?.pushplusToken?.trim()) {
    try {
      const resp = await fetch("https://www.pushplus.plus/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: channels.pushplusToken.trim(),
          title,
          content: markdownText,
          template: "markdown",
        }),
      });
      const data = await safeJson(resp);
      if (!resp.ok || (data && data.code !== 200)) {
        throw new Error(data?.msg || `HTTP ${resp.status}`);
      }
      results.push({ channel: "PushPlus微信", ok: true });
    } catch (e) {
      results.push({ channel: "PushPlus微信", ok: false, error: e.message });
    }
  }

  // 4. 钉钉 / 飞书群机器人 Webhook（自动识别 URL）
  if (channels?.customWebhook?.trim()) {
    const url = channels.customWebhook.trim();
    try {
      let body;
      if (url.includes("feishu.cn") || url.includes("larksuite.com")) {
        body = {
          msg_type: "text",
          content: { text: plainText },
        };
      } else {
        // 默认按钉钉机器人格式（同时兼容多数通用 webhook）
        body = {
          msgtype: "markdown",
          markdown: { title, text: markdownText },
        };
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(resp);
      const errCode = data?.errcode ?? data?.code ?? data?.StatusCode ?? 0;
      if (!resp.ok || errCode !== 0) {
        throw new Error(data?.errmsg || data?.msg || `HTTP ${resp.status}`);
      }
      results.push({ channel: "飞书/钉钉", ok: true });
    } catch (e) {
      results.push({ channel: "飞书/钉钉", ok: false, error: e.message });
    }
  }

  // 5. Bark（iPhone 强推送，自动兼容整段 curl 示例 / 带 /title/body 的链接 / 纯 Key）
  if (channels?.barkUrl?.trim()) {
    try {
      const base = normalizeBarkUrl(channels.barkUrl);
      const endpoint = `${base}/${encodeURIComponent(title)}/${encodeURIComponent(
        [summary, ...(detailLines || []).slice(0, 2)].join(" | ")
      )}?group=ROI监控&sound=alarm`;
      const resp = await fetch(endpoint, { method: "GET" });
      const data = await safeJson(resp);
      if (!resp.ok || (data && data.code && data.code !== 200)) {
        throw new Error(data?.message || `HTTP ${resp.status}`);
      }
      results.push({ channel: "Bark", ok: true });
    } catch (e) {
      results.push({ channel: "Bark", ok: false, error: e.message });
    }
  }

  return results;
}

function normalizeBarkUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const urlMatch = s.match(/(https?:\/\/[^/\s"'`]+)\/([A-Za-z0-9_-]{8,})/i);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`;
  }
  if (/^[A-Za-z0-9_-]{12,}$/.test(s)) {
    return `https://api.day.app/${s}`;
  }
  return s.replace(/\/+$/, "");
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

// ---------- AI 投流大脑：支持豆包(火山方舟) / 智谱 GLM-4-Flash / DeepSeek / 通义千问 / 硅基流动 / 自定义 OpenAI 兼容接口 ----------
const AI_PROVIDER_PRESETS = {
  doubao: {
    name: "豆包(火山方舟)",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    defaultModel: "doubao-1-5-pro-32k-250115",
  },
  zhipu: {
    name: "智谱清言(GLM-4-Flash)",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-flash",
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
  },
  qwen: {
    name: "通义千问",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus",
  },
  siliconflow: {
    name: "硅基流动",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
  },
  custom: {
    name: "自定义兼容接口",
    endpoint: "",
    defaultModel: "",
  },
};

async function handleGenerateAiSummary(payload) {
  const { aiConfig = {}, metricsData = {} } = payload || {};
  const providerKey = aiConfig.provider || "doubao";
  const preset = AI_PROVIDER_PRESETS[providerKey] || AI_PROVIDER_PRESETS.custom;
  const apiKey = String(aiConfig.apiKey || "").trim();
  const rawEndpoint = String(aiConfig.endpoint || "").trim();
  // 防串台自愈：选了 DeepSeek/智谱/通义 等内置厂商，但接口地址仍是其他厂商的默认地址（如旧默认豆包地址）时，自动纠偏为当前厂商官方地址
  const otherPresetEndpoints = Object.entries(AI_PROVIDER_PRESETS)
    .filter(([k, v]) => k !== providerKey && v.endpoint)
    .map(([, v]) => v.endpoint);
  const endpoint =
    providerKey !== "custom" && (!rawEndpoint || otherPresetEndpoints.includes(rawEndpoint))
      ? preset.endpoint
      : rawEndpoint || preset.endpoint || "";
  const model = String(aiConfig.model || preset.defaultModel || "").trim();

  if (!apiKey) throw new Error("未填写 AI API Key");
  if (!endpoint) throw new Error("未配置 AI 接口地址");
  if (!model) throw new Error("未填写模型名称 / 豆包推理接入点 ID");

  const systemPrompt = [
    "你是顶级巨量千川实战操盘总监（服务老板与一线投手，风格：极简、犀利、一眼看懂）。",
    "根据 JSON 中的大盘指标、30分钟流速、账户余额、头部集中度、隐形失血计划与异常清单，输出一份极其干净的中文诊断简报。",
    "",
    "【排版铁律 — 违反即不合格】",
    "1. 严禁长段落！绝不允许两句话挤在同一行，每条结论必须单独占一行，单行尽量控制在 28 字以内。",
    "2. 禁止使用 Markdown 语法（不要出现 **、##、``` 等符号），只用纯文本 + 符号「•」「｜」「→」。",
    "3. 去掉一切废话和客套，每个建议必须带具体计划名、关键数字和动作幅度（如 降价5%~10% / 加预算20% / 补素材）。",
    "4. 严格按以下 4 个区块输出，区块之间空 1 行：",
    "",
    "📊 大盘体检",
    "• 定性：<加速起量 / 高位走稳 / 暗中失血 + 一句话核心原因>",
    "• 流速：<总ROI、近30分增量变化、可用余额/可撑时长>",
    "• 隐患：<集中度风险或隐形失血提示，无则写“大盘结构健康”>",
    "",
    "🔥 放量候选",
    "• <计划名>｜ROI <值> · 耗<值> → <具体放量动作>",
    "（1~3条，无则写“• 暂无显著放量计划，建议补新素材测款”）",
    "",
    "🚨 异常处置",
    "• 🔴 <计划名>｜ROI <值> → <降出价/暂停止损>",
    "• ⚡ <计划名>｜已烧<值>% → <补预算防断流>",
    "• ⚠️ <隐形失血或灰保计划> → <具体盯防动作>",
    "（仅列实际存在的异常，每条1行，无异常写“• 当前无异常风险”）",
    "",
    "🎯 立刻执行",
    "1. P0：<最紧急的止损或补预算指令>",
    "2. P1：<放量或调优指令>",
    "3. P2：<素材/承接或盯盘指令（可选）>",
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22000);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(metricsData) },
        ],
      }),
      signal: controller.signal,
    });
    const data = await safeJson(resp);
    if (!resp.ok) {
      const errMsg = data?.error?.message || data?.message || `HTTP ${resp.status}`;
      throw new Error(errMsg);
    }
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI 返回内容为空");
    }
    return {
      text: content,
      providerName: preset.name,
      model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
