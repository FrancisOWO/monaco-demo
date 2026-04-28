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

export function setupLayoutControls() {
    const primaryButton = document.getElementById('layout-primary-toggle');
    const panelButton = document.getElementById('layout-panel-toggle');
    const secondaryButton = document.getElementById('layout-secondary-toggle');

    primaryButton?.addEventListener('click', togglePrimarySidebar);
    panelButton?.addEventListener('click', toggleBottomPanel);
    secondaryButton?.addEventListener('click', toggleSecondarySidebar);

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
