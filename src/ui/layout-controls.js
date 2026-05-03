import * as chatStore from '../chat/chat-store.js';

const layoutState = {
    primaryVisible: true,
    panelVisible: false,
};

function setButtonState(button, active) {
    if (!button) return;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
}

function updateLayoutButtons() {
    setButtonState(document.getElementById('layout-primary-toggle'), layoutState.primaryVisible);
    setButtonState(document.getElementById('layout-panel-toggle'), layoutState.panelVisible);
    setButtonState(document.getElementById('layout-secondary-toggle'), chatStore.isPanelVisible());
}

export function togglePrimarySidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    layoutState.primaryVisible = !layoutState.primaryVisible;
    sidebar.classList.toggle('layout-hidden', !layoutState.primaryVisible);
    updateLayoutButtons();
}

export function toggleBottomPanel() {
    const panel = document.getElementById('bottom-panel');
    if (!panel) return;

    layoutState.panelVisible = !layoutState.panelVisible;
    panel.classList.toggle('layout-hidden', !layoutState.panelVisible);
    document.body.classList.toggle('panel-visible', layoutState.panelVisible);
    updateLayoutButtons();
}

export function toggleSecondarySidebar() {
    chatStore.togglePanel();
    updateLayoutButtons();
}

/**
 * 侧边栏拖拽调整宽度
 */
function setupSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    const sidebar = document.getElementById('sidebar');

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = e.clientX - startX; // 向右拖拽 = 宽度增大
        const newWidth = Math.max(140, Math.min(500, startWidth + delta));
        sidebar.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

export function setupLayoutControls() {
    const primaryButton = document.getElementById('layout-primary-toggle');
    const panelButton = document.getElementById('layout-panel-toggle');
    const secondaryButton = document.getElementById('layout-secondary-toggle');

    primaryButton?.addEventListener('click', togglePrimarySidebar);
    panelButton?.addEventListener('click', toggleBottomPanel);
    secondaryButton?.addEventListener('click', toggleSecondarySidebar);

    setupSidebarResize();

    chatStore.on('onPanelVisibilityChanged', updateLayoutButtons);
    updateLayoutButtons();
}

export function getLayoutState() {
    return {
        primaryVisible: layoutState.primaryVisible,
        panelVisible: layoutState.panelVisible,
        secondaryVisible: chatStore.isPanelVisible(),
    };
}
