// AI 服务模块 — 调用 DeepSeek API
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-84faf36e296141b79c0e87db1cd44b4c';
const DEEPSEEK_MODEL = 'deepseek-chat';

async function callDeepSeek(messages, temperature = 0.7, maxTokens = 4096) {
  const body = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// 构建设置+产品上下文
function buildContext(data) {
  const ctx = [`网站名称: ${data.settings?.companyName || 'Agent 技术交流'}`];
  ctx.push(`联系方式: ${data.settings?.contactName || ''} ${data.settings?.contactPhone || ''}`);
  ctx.push(`地址: ${data.settings?.address || ''}`);

  if (data.products?.length) {
    ctx.push('\n=== 产品列表 ===');
    data.products.forEach((p, i) => {
      ctx.push(`${i + 1}. ${p.name} | 分类: ${p.category || '未分类'} | 价格: ${p.price || '面议'} | 描述: ${p.description || '暂无'}`);
    });
  }

  if (data.cases?.length) {
    ctx.push('\n=== 工程案例 ===');
    data.cases.forEach((c, i) => {
      ctx.push(`${i + 1}. ${c.title} - ${c.category || ''}`);
    });
  }

  return ctx.join('\n');
}

// AI 客服回复 — 直连 DeepSeek，无中间人设
async function chat(message, history) {
  const messages = [
    ...(history || []).slice(-10),
    { role: 'user', content: message },
  ];
  return callDeepSeek(messages, 0.7, 4096);
}

// AI 智能搜索
async function searchProducts(query, data) {
  if (!data.products?.length) return [];

  const productList = data.products.map((p, i) =>
    `${i}. ${p.name} | ${p.description || ''} | ${p.category || ''}`
  ).join('\n');

  const sysPrompt = `你是一个建材产品搜索助手。根据用户的问题，从产品列表中找出最相关的产品编号。
只返回匹配的产品编号数组（JSON格式），不要其他文字。
例如匹配第0个和第2个产品时返回: [0, 2]
如果没有匹配的返回: []`;

  const msg = `产品列表:\n${productList}\n\n用户问题: ${query}\n\n匹配的产品编号是:`;

  const result = await callDeepSeek([
    { role: 'system', content: sysPrompt },
    { role: 'user', content: msg },
  ], 0.3, 512);

  try {
    const indices = JSON.parse(result.trim());
    if (Array.isArray(indices)) {
      return indices.filter(i => i >= 0 && i < data.products.length);
    }
  } catch {}
  return [];
}

// AI 项目方案推荐
async function designRecommendation(params, data) {
  const context = buildContext(data);
  const sysPrompt = `你是一个 AI Agent 项目架构师。根据客户的需求，提供专业的技术方案推荐。

平台信息：
${context}

回复格式（使用markdown）：
## 推荐方案

### 技术架构
列出推荐的技术栈、框架和工具

### 实现步骤
分阶段的项目实施建议

### 温馨提示
提醒客户联系团队获取更详细的信息和技术支持`;

  const msg = `客户需求：
- 项目类型: ${params.roomType || '未指定'}
- 团队规模: ${params.area || '未指定'}
- 技术栈偏好: ${params.style || '未指定'}
- 时间周期: ${params.budget || '未指定'}
- 需求描述: ${params.notes || '无'}

请给出专业的技术方案推荐：`;

  return callDeepSeek([
    { role: 'system', content: sysPrompt },
    { role: 'user', content: msg },
  ], 0.8, 4096);
}

// 清理 HTML 实体
function cleanHtmlEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#176;/g, '°')
    .replace(/&ensp;/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#0183;/g, '·');
}

// 将自然语言转为搜索关键词
function toSearchQuery(text) {
  // 天气类查询特殊处理
  if (/天气|气温|温度|下雨|刮风|雾霾|台风|湿度/g.test(text)) {
    let loc = text.replace(/[？?？!！。，、：；""''【】《》（）()～·…—–]/g, ' ')
      .replace(/今天|明天|后天|昨天|前天/g, ' ')
      .replace(/天气|气温|温度|下雨|刮风|雾霾|台风|湿度|怎么样|如何|怎么|什么|为什么|多少|度/g, ' ')
      .replace(/吗|呢|吧|啊|哈|呀|哦|嗯|啦|哟|呗|嘛|的|了|着|过/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const location = loc.split(/\s+/)[0] || '今日';
    const d = new Date();
    return `${location}天气 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 天气预报`;
  }

  // 常规查询
  let q = text
    .replace(/[？?？!！。，、：；""''【】《》（）()～·…—–]/g, ' ')
    .replace(/怎么样|怎么办|如何|怎么|什么|为什么|哪些|哪个|哪家|有没有|能不能|会不会|是不是|可否|何时|何处|谁|多少/g, ' ')
    .replace(/吗|呢|吧|啊|哈|呀|哦|嗯|啦|哟|呗|嘛/g, ' ')
    .replace(/的|了|着|过/g, ' ')
    .replace(/今天|明天|后天|昨天|前天|最近|最新/g, ' ')
    .replace(/请问|你好|嗨|嘿|hi|hello/g, ' ')
    .replace(/关于|对于|来说|的话|有关|相关/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (q.length < 3) q = text.replace(/[？?！!。，、：；""''【】《》（）()]/g, ' ').trim();
  return q;
}

// AI 联网搜索 — 抓取 Bing 搜索结果
async function webSearch(rawQuery) {
  const query = toSearchQuery(rawQuery);
  console.log(`🌐 Web search: "${rawQuery}" → "${query}"`);
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const itemRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const title = match[1].match(/<h2[^>]*>.*?<a[^>]*>(.*?)<\/a>/i)?.[1]?.replace(/<[^>]*>/g, '') || '';
      const snippet = match[1].match(/<p[^>]*>(.*?)<\/p>/i)?.[1]?.replace(/<[^>]*>/g, '') || '';
      if (title && snippet) {
        results.push({ title, snippet: cleanHtmlEntities(snippet.replace(/\s+/g, ' ').trim()) });
        if (results.length >= 6) break;
      }
    }
    return results;
  } catch (e) {
    console.error('🌐 Web search error:', e.message);
    return [];
  }
}

// AI 联网聊天 — 搜索后回复，保持直连 DeepSeek 体验
async function chatWithWeb(message, history) {
  const searchResults = await webSearch(message);

  let webContext = '';
  if (searchResults.length > 0) {
    webContext = '以下是搜索到的相关信息：\n' +
      searchResults.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join('\n\n');
  }

  const sysMsg = searchResults.length > 0
    ? `你是一个可以联网的AI助手。用户的问题可能涉及最新信息，以下是搜索结果供参考（不是必须使用，请自行判断）：\n\n${webContext}`
    : '你是一个可以联网的AI助手。';

  const messages = [
    { role: 'system', content: sysMsg },
    ...(history || []).slice(-10),
    { role: 'user', content: message },
  ];

  return callDeepSeek(messages, 0.7, 4096);
}

// AI 产品描述生成
async function generateDescription(name, category, existingProducts) {
  const examples = existingProducts?.slice(0, 5).map(p =>
    `产品: ${p.name}\n描述: ${p.description}`
  ).join('\n---\n') || '暂无示例';

  const sysPrompt = `你是一个电商文案撰写专家。根据产品名称和分类，生成专业、有吸引力的产品描述。
要求：
- 中文，50-100字
- 突出产品特点和优势
- 适合建材装饰材料行业
- 语气专业且真诚
- 不要编造虚假的技术参数`;

  const msg = `产品名称: ${name}
产品分类: ${category || '装饰材料'}

参考示例:
${examples}

请生成产品描述：`;

  return callDeepSeek([
    { role: 'system', content: sysPrompt },
    { role: 'user', content: msg },
  ], 0.7, 512);
}

module.exports = { chat, chatWithWeb, searchProducts, designRecommendation, generateDescription };
