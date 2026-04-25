/**
 * 确认对话框与 Toast 提示
 */

/**
 * 显示确认对话框
 * @param {string} message 消息内容
 * @param {object} options { confirmLabel, cancelLabel, primary }
 * @returns {Promise<boolean>} true=确认, false=取消
 */
export function showDialog(message, options = {}) {
    const overlay = document.getElementById('dialog-overlay');
    const messageEl = document.getElementById('dialog-message');
    const buttonsEl = document.getElementById('dialog-buttons');

    const confirmLabel = options.confirmLabel || '确认';
    const cancelLabel = options.cancelLabel || '取消';

    messageEl.textContent = message;
    overlay.classList.remove('hidden');

    return new Promise((resolve) => {
        buttonsEl.innerHTML = '';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = cancelLabel;
        cancelBtn.onclick = () => {
            overlay.classList.add('hidden');
            resolve(false);
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-primary';
        confirmBtn.textContent = confirmLabel;
        confirmBtn.onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };

        buttonsEl.appendChild(cancelBtn);
        buttonsEl.appendChild(confirmBtn);
    });
}

/**
 * 显示 Toast 提示
 * @param {string} message
 * @param {string} type 'info' | 'warning' | 'error'
 * @param {number} duration ms
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}