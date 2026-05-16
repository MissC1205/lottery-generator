// 前端工具函数
// Toast 提示
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer') || (() => {
        const d = document.createElement('div');
        d.className = 'toast-container';
        d.id = 'toastContainer';
        document.body.appendChild(d);
        return d;
    })();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 获取admin token
function getAdminToken() {
    return localStorage.getItem('admin_token') || new URLSearchParams(window.location.search).get('token') || '';
}

// 检查认证状态
function checkAuth() {
    const token = getAdminToken();
    if (!token && window.location.pathname.startsWith('/admin/')) {
        window.location.href = '/admin/login';
        return false;
    }
    return true;
}
