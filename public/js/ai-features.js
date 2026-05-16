// AI 功能模块 — 聊天/搜索/装修推荐

(function () {
  'use strict';

  let chatHistory = [];
  let isChatOpen = false;

  // ========== AI 心形聊天按钮 ==========
  function createChatWidget() {
    // 心形按钮（渐变定义直接内嵌在 SVG 中，确保可靠渲染）
    const btn = document.createElement('div');
    btn.className = 'ai-heart-btn';
    btn.id = 'aiHeartBtn';
    btn.innerHTML = `
      <div class="ai-heart-glow"></div>
      <div class="ai-heart-svg-wrap">
        <svg class="ai-heart-svg" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FF4757"/>
              <stop offset="50%" stop-color="#FF6B81"/>
              <stop offset="100%" stop-color="#FFA502"/>
            </linearGradient>
          </defs>
          <path d="M50 88 C20 65 0 45 0 25 Q0 5 25 5 Q50 5 50 30 Q50 5 75 5 Q100 5 100 25 C100 45 80 65 50 88Z" fill="#FF4757"/>
        </svg>
        <div class="ai-heart-text">欢迎咨询</div>
      </div>
      <div class="ai-heart-petals" id="aiHeartPetals">
        <div class="ai-petal" style="--i:0"></div>
        <div class="ai-petal" style="--i:1"></div>
        <div class="ai-petal" style="--i:2"></div>
        <div class="ai-petal" style="--i:3"></div>
        <div class="ai-petal" style="--i:4"></div>
        <div class="ai-petal" style="--i:5"></div>
        <div class="ai-petal" style="--i:6"></div>
        <div class="ai-petal" style="--i:7"></div>
      </div>
    `;

    // 聊天面板 — 玻璃拟态
    const panel = document.createElement('div');
    panel.className = 'ai-chat-panel';
    panel.id = 'aiChatPanel';
    panel.innerHTML = `
      <div class="ai-chat-bg-orbs">
        <div class="ai-orb"></div>
        <div class="ai-orb"></div>
        <div class="ai-orb"></div>
      </div>
      <div class="ai-chat-header">
        <div class="ai-chat-header-info">
          <img src="/uploads/avatar_cs.png" alt="客服" class="ai-chat-header-avatar" onerror="this.style.display='none'">
          <div>
            <div class="ai-chat-title">DeepSeek AI 助手</div>
            <div class="ai-chat-status">在线 · 秒回</div>
          </div>
        </div>
        <button class="ai-chat-close" id="aiChatClose" aria-label="关闭">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="ai-chat-messages" id="aiChatMessages">
        <div class="ai-msg ai-msg-bot">
          <div class="ai-msg-content">嗨～ 我是 AI 助手！想了解框架教程、实战案例还是 Agent 技术？尽管问我～</div>
        </div>
      </div>
      <div class="ai-chat-input-wrap">
        <div class="ai-chat-suggestions" id="aiSuggestions">
          <span class="ai-suggestion">有哪些教程？</span>
          <span class="ai-suggestion">推荐学习路径</span>
          <span class="ai-suggestion">LangChain教程</span>
          <span class="ai-suggestion">多Agent案例</span>
        </div>
        <div class="ai-chat-toolbar" id="aiChatToolbar">
          <span class="ai-web-toggle" id="aiWebToggle" title="开启后 AI 会搜索互联网获取最新信息">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span>联网搜索</span>
          </span>
        </div>
        <div class="ai-chat-input-row">
          <input type="text" class="ai-chat-input" id="aiChatInput" placeholder="输入您的问题..." maxlength="500">
          <button class="ai-chat-send" id="aiChatSend" aria-label="发送">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // 事件绑定
    btn.addEventListener('click', () => toggleChat(true));
    document.getElementById('aiChatClose').addEventListener('click', () => toggleChat(false));
    document.getElementById('aiChatSend').addEventListener('click', sendChatMessage);
    document.getElementById('aiChatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });

    // 快捷提问
    document.getElementById('aiSuggestions').addEventListener('click', (e) => {
      if (e.target.classList.contains('ai-suggestion')) {
        document.getElementById('aiChatInput').value = e.target.textContent;
        sendChatMessage();
      }
    });

    // 联网搜索切换
    document.getElementById('aiWebToggle').addEventListener('click', function () {
      this.classList.toggle('active');
    });
  }

  function toggleChat(open) {
    isChatOpen = open;
    const btn = document.getElementById('aiHeartBtn');
    const panel = document.getElementById('aiChatPanel');

    if (open) {
      btn.classList.add('active');
      panel.classList.add('open');
      document.getElementById('aiChatInput').focus();
    } else {
      btn.classList.remove('active');
      panel.classList.remove('open');
    }
  }

  function addMessage(text, role) {
    const container = document.getElementById('aiChatMessages');
    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${role}`;
    msg.innerHTML = `<div class="ai-msg-content">${text}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  async function sendChatMessage() {
    const input = document.getElementById('aiChatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessage(escapeHtml(text), 'user');

    const sendBtn = document.getElementById('aiChatSend');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<div class="ai-loading"></div>';

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory, useWeb: document.getElementById('aiWebToggle').classList.contains('active') }),
      });
      const data = await res.json();
      if (data.reply) {
        addMessage(marked(data.reply), 'bot');
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: data.reply });
        if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
      } else {
        addMessage('😅 暂时没响应，稍后再试试？', 'bot');
      }
    } catch {
      addMessage('😅 网络开小差了，稍后再试试？', 'bot');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    }
  }

  // ========== AI 智能搜索 ==========
  function createAISearch() {
    const productSection = document.querySelector('.products');
    if (!productSection) return;

    const title = productSection.querySelector('.section-title');
    const searchDiv = document.createElement('div');
    searchDiv.className = 'ai-search-wrap fade-in';
    searchDiv.innerHTML = `
      <div class="ai-search-box">
        <svg class="ai-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" class="ai-search-input" id="aiSearchInput" placeholder="AI 智能搜索教程，试试说「LangChain」「多Agent」「RAG」..." maxlength="200">
        <button class="ai-search-btn" id="aiSearchBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          智能搜索
        </button>
      </div>
      <div class="ai-search-status" id="aiSearchStatus"></div>
    `;

    title.parentNode.insertBefore(searchDiv, title.nextSibling);

    const input = document.getElementById('aiSearchInput');
    const btn = document.getElementById('aiSearchBtn');
    const status = document.getElementById('aiSearchStatus');

    async function doSearch() {
      const query = input.value.trim();
      if (!query) return;

      status.textContent = '🔍 AI 正在理解您的问题...';
      status.className = 'ai-search-status loading';
      btn.disabled = true;

      try {
        const res = await fetch('/api/ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();

        // 重置所有产品卡片高亮
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('ai-highlight', 'ai-dim'));
        document.querySelectorAll('.product-card').forEach(c => c.classList.add('ai-dim'));

        if (data.products?.length > 0) {
          const cards = document.querySelectorAll('.product-card');
          data.indices.forEach(i => {
            if (cards[i]) {
              cards[i].classList.remove('ai-dim');
              cards[i].classList.add('ai-highlight');
              cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
          status.textContent = `✨ 找到 ${data.products.length} 个相关产品`;
          status.className = 'ai-search-status success';
        } else {
          document.querySelectorAll('.product-card').forEach(c => c.classList.remove('ai-dim', 'ai-highlight'));
          status.textContent = '😅 没找到匹配的产品，换个说法试试？';
          status.className = 'ai-search-status empty';
        }
      } catch {
        status.textContent = '😅 搜索出错了，稍后再试';
        status.className = 'ai-search-status error';
      } finally {
        btn.disabled = false;
      }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    // 清除搜索状态时恢复
    input.addEventListener('input', function () {
      if (!this.value.trim()) {
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('ai-dim', 'ai-highlight'));
        status.textContent = '';
        status.className = 'ai-search-status';
      }
    });
  }

  // ========== AI 项目规划助手 ==========
  function createDesignTool() {
    const services = document.querySelector('.services');
    if (!services) return;

    const designSection = document.createElement('section');
    designSection.className = 'ai-design';
    designSection.innerHTML = `
      <div class="container">
        <div class="section-title fade-in">
          <h2>🤖 AI Agent 项目咨询</h2>
          <p>描述您的需求，AI 为您推荐最佳技术方案</p>
        </div>
        <div class="ai-design-wrap fade-in">
          <div class="ai-design-form">
            <div class="ai-design-row">
              <div class="ai-design-field">
                <label>项目类型</label>
                <select id="aiRoomType">
                  <option value="智能客服" selected>智能客服</option>
                  <option value="知识库问答">知识库问答（RAG）</option>
                  <option value="多Agent协作">多Agent协作</option>
                  <option value="自动化工作流">自动化工作流</option>
                  <option value="数据分析Agent">数据分析Agent</option>
                  <option value="自定义应用">自定义应用</option>
                </select>
              </div>
              <div class="ai-design-field">
                <label>团队规模</label>
                <input type="text" id="aiArea" placeholder="如: 3人" value="1-2人">
              </div>
            </div>
            <div class="ai-design-row">
              <div class="ai-design-field">
                <label>技术栈偏好</label>
                <select id="aiStyle">
                  <option value="LangChain">LangChain</option>
                  <option value="AutoGen">AutoGen</option>
                  <option value="CrewAI">CrewAI</option>
                  <option value="LangGraph">LangGraph</option>
                  <option value="OpenAI Agents">OpenAI Agents SDK</option>
                  <option value="未确定" selected>未确定（推荐）</option>
                </select>
              </div>
              <div class="ai-design-field">
                <label>时间周期</label>
                <select id="aiBudget">
                  <option value="1-2周 (快速原型)">1-2周（快速原型）</option>
                  <option value="1-3个月 (正式项目)" selected>1-3个月（正式项目）</option>
                  <option value="3-6个月 (复杂系统)">3-6个月（复杂系统）</option>
                </select>
              </div>
            </div>
            <div class="ai-design-field">
              <label>需求描述 <span class="ai-design-optional">(选填)</span></label>
              <input type="text" id="aiNotes" placeholder="如: 需要处理客户退款流程、对接企业微信...">
            </div>
            <button class="btn-primary ai-design-btn" id="aiDesignBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              AI 生成方案
            </button>
          </div>
          <div class="ai-design-result" id="aiDesignResult">
            <div class="ai-design-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#B2BEC3" stroke-width="1">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <p>填写需求后点击生成方案</p>
            </div>
          </div>
        </div>
      </div>
    `;

    services.parentNode.insertBefore(designSection, services.nextSibling);

    document.getElementById('aiDesignBtn').addEventListener('click', generateDesign);
  }

  async function generateDesign() {
    const btn = document.getElementById('aiDesignBtn');
    const resultDiv = document.getElementById('aiDesignResult');
    const params = {
      roomType: document.getElementById('aiRoomType').value,
      area: document.getElementById('aiArea').value,
      style: document.getElementById('aiStyle').value,
      budget: document.getElementById('aiBudget').value,
      notes: document.getElementById('aiNotes').value,
    };

    btn.disabled = true;
    btn.innerHTML = '<div class="ai-loading" style="margin:0 auto"></div> 生成中...';
    resultDiv.innerHTML = `
      <div class="ai-design-loading">
        <div class="spinner"></div>
        <p>AI 正在为您定制方案...</p>
      </div>
    `;

    try {
      const res = await fetch('/api/ai/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.recommendation) {
        resultDiv.innerHTML = `<div class="ai-design-answer">${marked(data.recommendation)}</div>`;
      } else {
        resultDiv.innerHTML = '<div class="ai-design-placeholder"><p>😅 生成失败，请稍后再试</p></div>';
      }
    } catch {
      resultDiv.innerHTML = '<div class="ai-design-placeholder"><p>😅 网络开小差了，请稍后再试</p></div>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> AI 生成方案`;
    }
  }

  // ========== 工具函数 ==========
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function marked(text) {
    if (!text) return '';
    // 简化版 markdown 渲染
    return text
      .replace(/###\s?(.*)/g, '<h4>$1</h4>')
      .replace(/##\s?(.*)/g, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n/g, '<br>')
      .replace(/(\d+)\. /g, '<br>$1. ');
  }

  // ========== 初始化 ==========
  function init() {
    createChatWidget();
    createAISearch();
    createDesignTool();
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
