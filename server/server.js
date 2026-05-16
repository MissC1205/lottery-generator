const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const aiService = require('./ai-service');

const app = express();
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin888';

// ===== 中间件 =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ===== 请求日志 =====
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
    });
    next();
});

// ===== 简单认证中间件 =====
// 使用会话token (简化版，用query参数传递)
const USED_TOKENS = new Set();

// 生成token (每天一个)
function getDailyToken() {
    const date = new Date().toISOString().slice(0, 10);
    return crypto.createHash('md5').update(date + ADMIN_PASSWORD).digest('hex').slice(0, 12);
}

// 验证管理员
function requireAdmin(req, res, next) {
    // 管理后台页面 - 带token参数
    const token = req.query.token || req.headers['x-admin-token'];
    if (token === getDailyToken()) {
        return next();
    }
    // 如果是API请求，返回401
    if (req.path.startsWith('/api/admin/') || req.headers['x-requested-with'] === 'admin') {
        return res.status(401).json({ error: '请先登录管理后台', needLogin: true });
    }
    next();
}

// ===== 登录API =====
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = getDailyToken();
        // 记录token已使用
        USED_TOKENS.add(token);
        res.json({ success: true, token, expireAt: new Date().toISOString().slice(0, 10) + ' 23:59:59' });
    } else {
        res.status(401).json({ error: '密码错误' });
    }
});

// ===== 文件上传配置 =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // 安全文件名：时间戳+随机数，防止路径遍历
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedImages = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const allowedVideos = ['.mp4', '.avi', '.mov', '.webm'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedImages.includes(ext) || allowedVideos.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件格式，仅支持: jpg/png/gif/webp/mp4/avi/mov/webm'));
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ===== 数据存储（文件JSON）=====
const DATA_FILE = path.join(__dirname, 'data.json');

function ensureDataStructure(data) {
    if (!data.settings) data.settings = {
        companyName: 'Agent 技术交流',
        contactName: '李川',
        contactPhone: '13319481565',
        address: '龙南市',
        logo: '/uploads/logo.jpg'
    };
    // 向后兼容：旧字段 contact→contactName, phone→contactPhone
    if (data.settings.contact && !data.settings.contactName) {
        data.settings.contactName = data.settings.contact;
    }
    if (data.settings.phone && !data.settings.contactPhone) {
        data.settings.contactPhone = data.settings.phone;
    }
    if (!data.sliders) data.sliders = [];
    if (!data.products) data.products = [];
    if (!data.videos) data.videos = [];
    if (!data.cases) data.cases = [];
    if (!data.messages) data.messages = [];
    return data;
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);
            return ensureDataStructure(data);
        }
    } catch (e) {
        console.error('加载数据失败:', e);
    }
    return ensureDataStructure({});
}

// 带写入锁的数据保存
let saveLock = false;
function saveData(data) {
    // 简单的同步写入，避免并发问题
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('保存数据失败:', e);
        throw e;
    }
}

// ===== 输入清理 =====
function sanitize(str) {
    if (!str) return '';
    return String(str)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
}

// ===== 消息速率限制 (内存) =====
const ipLimiter = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 60000; // 1分钟
    const maxRequests = 3; // 最多3条

    if (!ipLimiter.has(ip)) {
        ipLimiter.set(ip, []);
    }

    const timestamps = ipLimiter.get(ip).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
        return false;
    }

    timestamps.push(now);
    ipLimiter.set(ip, timestamps);
    return true;
}

// ===== API路由 =====

// 网站配置API (公开)
app.get('/api/settings', (req, res) => {
    const data = loadData();
    res.json(data.settings);
});

// 管理员配置API (需认证)
app.put('/api/settings', requireAdmin, (req, res) => {
    const data = loadData();
    const allowedFields = ['companyName', 'contactName', 'contactPhone', 'address', 'aboutTitle', 'aboutDesc1', 'aboutDesc2'];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            data.settings[field] = sanitize(req.body[field]);
        }
    });
    saveData(data);
    res.json({ success: true, settings: data.settings });
});

// Logo上传
app.post('/api/upload-logo', requireAdmin, upload.single('logo'), (req, res) => {
    const data = loadData();
    if (req.file) {
        data.settings.logo = `/uploads/${req.file.filename}`;
        saveData(data);
    }
    res.json({ success: true, logo: data.settings.logo });
});

// 轮播图API (GET公开)
app.get('/api/sliders', (req, res) => {
    const data = loadData();
    res.json(data.sliders);
});

app.post('/api/sliders', requireAdmin, upload.single('image'), (req, res) => {
    const data = loadData();
    const slider = {
        id: Date.now(),
        title: sanitize(req.body.title) || '新轮播图',
        subtitle: sanitize(req.body.subtitle) || '',
        link: sanitize(req.body.link) || '#',
        image: req.file ? `/uploads/${req.file.filename}` : '',
        active: data.sliders.length === 0
    };
    data.sliders.push(slider);
    saveData(data);
    res.json({ success: true, slider });
});

app.put('/api/sliders/:id', requireAdmin, upload.single('image'), (req, res) => {
    const data = loadData();
    const idx = data.sliders.findIndex(s => s.id == req.params.id);
    if (idx === -1) return res.status(404).json({ error: '不存在' });

    data.sliders[idx] = {
        ...data.sliders[idx],
        title: sanitize(req.body.title) || data.sliders[idx].title,
        subtitle: sanitize(req.body.subtitle) || data.sliders[idx].subtitle,
        link: sanitize(req.body.link) || data.sliders[idx].link,
        image: req.file ? `/uploads/${req.file.filename}` : data.sliders[idx].image
    };
    if (req.body.active !== undefined) {
        data.sliders[idx].active = req.body.active === 'true' || req.body.active === true;
    }
    saveData(data);
    res.json({ success: true, slider: data.sliders[idx] });
});

app.delete('/api/sliders/:id', requireAdmin, (req, res) => {
    const data = loadData();
    const idx = data.sliders.findIndex(s => s.id == req.params.id);
    if (idx !== -1) {
        if (data.sliders[idx].image) {
            const imgPath = path.join(__dirname, '../public', data.sliders[idx].image);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
        data.sliders.splice(idx, 1);
        saveData(data);
    }
    res.json({ success: true });
});

// 产品API (GET公开)
app.get('/api/products', (req, res) => {
    const data = loadData();
    res.json(data.products);
});

app.post('/api/products', requireAdmin, upload.single('image'), (req, res) => {
    const data = loadData();
    const product = {
        id: Date.now(),
        name: sanitize(req.body.name) || '新产品',
        description: sanitize(req.body.description) || '',
        price: sanitize(req.body.price) || '',
        category: sanitize(req.body.category) || '',
        image: req.file ? `/uploads/${req.file.filename}` : ''
    };
    data.products.push(product);
    saveData(data);
    res.json({ success: true, product });
});

app.put('/api/products/:id', requireAdmin, upload.single('image'), (req, res) => {
    const data = loadData();
    const idx = data.products.findIndex(p => p.id == req.params.id);
    if (idx === -1) return res.status(404).json({ error: '产品不存在' });

    data.products[idx] = {
        ...data.products[idx],
        name: sanitize(req.body.name) || data.products[idx].name,
        description: sanitize(req.body.description) || data.products[idx].description,
        price: sanitize(req.body.price) || data.products[idx].price,
        category: sanitize(req.body.category) || data.products[idx].category,
        image: req.file ? `/uploads/${req.file.filename}` : data.products[idx].image
    };
    saveData(data);
    res.json({ success: true, product: data.products[idx] });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
    const data = loadData();
    const idx = data.products.findIndex(p => p.id == req.params.id);
    if (idx !== -1) {
        if (data.products[idx].image) {
            const imgPath = path.join(__dirname, '../public', data.products[idx].image);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
        data.products.splice(idx, 1);
        saveData(data);
    }
    res.json({ success: true });
});

// 视频API (GET公开)
app.get('/api/videos', (req, res) => {
    const data = loadData();
    res.json(data.videos);
});

app.post('/api/videos', requireAdmin, upload.single('video'), (req, res) => {
    const data = loadData();
    const video = {
        id: Date.now(),
        title: sanitize(req.body.title) || '新视频',
        description: sanitize(req.body.description) || '',
        video: req.file ? `/uploads/${req.file.filename}` : '',
        thumbnail: ''
    };
    data.videos.push(video);
    saveData(data);
    res.json({ success: true, video });
});

app.delete('/api/videos/:id', requireAdmin, (req, res) => {
    const data = loadData();
    const idx = data.videos.findIndex(v => v.id == req.params.id);
    if (idx !== -1) {
        if (data.videos[idx].video) {
            const videoPath = path.join(__dirname, '../public', data.videos[idx].video);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        }
        data.videos.splice(idx, 1);
        saveData(data);
    }
    res.json({ success: true });
});

// 案例API (GET公开)
app.get('/api/cases', (req, res) => {
    const data = loadData();
    res.json(data.cases);
});

app.post('/api/cases', requireAdmin, upload.single('image'), (req, res) => {
    const data = loadData();
    const caseItem = {
        id: Date.now(),
        title: sanitize(req.body.title) || '新案例',
        description: sanitize(req.body.description) || '',
        image: req.file ? `/uploads/${req.file.filename}` : '',
        category: sanitize(req.body.category) || '工程案例'
    };
    data.cases.push(caseItem);
    saveData(data);
    res.json({ success: true, cases: caseItem });
});

app.put('/api/cases/:id', requireAdmin, upload.single('image'), (req, res) => {
    const data = loadData();
    const idx = data.cases.findIndex(c => c.id == req.params.id);
    if (idx === -1) return res.status(404).json({ error: '案例不存在' });

    data.cases[idx] = {
        ...data.cases[idx],
        title: sanitize(req.body.title) || data.cases[idx].title,
        description: sanitize(req.body.description) || data.cases[idx].description,
        category: sanitize(req.body.category) || data.cases[idx].category,
        image: req.file ? `/uploads/${req.file.filename}` : data.cases[idx].image
    };
    saveData(data);
    res.json({ success: true, cases: data.cases[idx] });
});

app.delete('/api/cases/:id', requireAdmin, (req, res) => {
    const data = loadData();
    const idx = data.cases.findIndex(c => c.id == req.params.id);
    if (idx !== -1) {
        if (data.cases[idx].image) {
            const imgPath = path.join(__dirname, '../public', data.cases[idx].image);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
        data.cases.splice(idx, 1);
        saveData(data);
    }
    res.json({ success: true });
});

// ===== AI 功能路由 =====

// AI 客服聊天 (支持联网搜索) — 直连 DeepSeek
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, history, useWeb } = req.body;
        if (!message) return res.status(400).json({ error: '请输入消息' });

        const reply = useWeb
            ? await aiService.chatWithWeb(message, history)
            : await aiService.chat(message, history);
        res.json({ reply, webSearch: !!useWeb });
    } catch (e) {
        console.error('AI Chat error:', e.message);
        res.status(500).json({ error: 'AI 服务暂时不可用，请稍后再试' });
    }
});

// AI 智能搜索
app.post('/api/ai/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: '请输入搜索内容' });

        const data = loadData();
        const indices = await aiService.searchProducts(query, data);
        const products = indices.map(i => data.products[i]).filter(Boolean);
        res.json({ products, indices });
    } catch (e) {
        console.error('AI Search error:', e.message);
        res.json({ products: [], indices: [] });
    }
});

// AI 装修方案推荐
app.post('/api/ai/design', async (req, res) => {
    try {
        const params = req.body;
        const data = loadData();
        const recommendation = await aiService.designRecommendation(params, data);
        res.json({ recommendation });
    } catch (e) {
        console.error('AI Design error:', e.message);
        res.status(500).json({ error: '方案生成失败，请稍后再试' });
    }
});

// AI 产品描述生成 (需要管理员权限)
app.post('/api/ai/generate-description', requireAdmin, async (req, res) => {
    try {
        const { name, category } = req.body;
        if (!name) return res.status(400).json({ error: '请提供产品名称' });

        const data = loadData();
        const description = await aiService.generateDescription(name, category, data.products);
        res.json({ description });
    } catch (e) {
        console.error('AI Generate error:', e.message);
        res.status(500).json({ error: '生成失败，请稍后再试' });
    }
});

// 留言API
app.get('/api/messages', requireAdmin, (req, res) => {
    const data = loadData();
    res.json(data.messages);
});

app.post('/api/messages', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;

    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: '提交过于频繁，请稍后再试' });
    }

    const data = loadData();
    const message = {
        id: Date.now(),
        name: sanitize(req.body.name) || '匿名',
        phone: sanitize(req.body.phone) || '',
        message: sanitize(req.body.message) || '',
        createdAt: new Date().toISOString(),
        read: false
    };
    data.messages.push(message);
    saveData(data);
    res.json({ success: true, message });
});

app.put('/api/messages/:id/read', requireAdmin, (req, res) => {
    const data = loadData();
    const msg = data.messages.find(m => m.id == req.params.id);
    if (msg) {
        msg.read = true;
        saveData(data);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: '留言不存在' });
    }
});

app.delete('/api/messages/:id', requireAdmin, (req, res) => {
    const data = loadData();
    const idx = data.messages.findIndex(m => m.id == req.params.id);
    if (idx !== -1) {
        data.messages.splice(idx, 1);
        saveData(data);
    }
    res.json({ success: true });
});

// ===== 管理后台页面 =====
app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});
app.get('/admin/sliders', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-sliders.html'));
});
app.get('/admin/products', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-products.html'));
});
app.get('/admin/videos', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-videos.html'));
});
app.get('/admin/cases', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-cases.html'));
});
app.get('/admin/messages', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-messages.html'));
});
app.get('/admin/settings', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-settings.html'));
});

// ===== 登录页面 (不需认证) =====
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-login.html'));
});

// ===== 企业宣传页面 =====
app.get('/promotion', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/promotion.html'));
});

// ===== 全局错误处理 =====
app.use((err, req, res, next) => {
    console.error('服务器错误:', err.message);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件大小不能超过100MB' });
        }
        return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || '服务器内部错误' });
});

// ===== 启动 =====
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 企业网站已启动: http://0.0.0.0:${PORT}`);
    console.log(`✅ 管理后台: http://your-ip:${PORT}/admin/login`);
    console.log(`✅ 今日管理Token: ${getDailyToken()}`);
});
