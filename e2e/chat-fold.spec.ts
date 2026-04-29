import { test, expect } from '@playwright/test';

test.describe('Chat fold/navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // 打开 AI 对话面板
        await page.locator('div.menu-item[data-menu="view"]').click();
        await page.locator('[data-action="ai-chat"]').click();
    });

    test('toolbar hidden when no messages', async ({ page }) => {
        const toolbar = page.locator('#chat-nav-toolbar');
        await expect(toolbar).toHaveClass(/hidden-toolbar/);
    });

    test('fold toggle collapses all messages', async ({ page }) => {
        // 发送消息
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();

        // 等待消息渲染（后端可能失败，但本地用户消息已添加）
        await expect(page.locator('.chat-msg')).toHaveCount(2, { timeout: 5000 });

        // 点击折叠按钮
        await page.locator('#chat-fold-toggle-btn').click();

        // 断言：所有消息变成折叠状态
        const folded = page.locator('.chat-msg.folded');
        await expect(folded).toHaveCount(2);

        // 断言：按钮变为 ⊕（展开状态）
        await expect(page.locator('#chat-fold-toggle-btn')).toHaveText('⊕');
    });

    test('expand toggle restores all messages', async ({ page }) => {
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        // 先折叠
        await page.locator('#chat-fold-toggle-btn').click();
        await expect(page.locator('.chat-msg.folded')).toHaveCount(2);

        // 再展开
        await page.locator('#chat-fold-toggle-btn').click();
        await expect(page.locator('.chat-msg.folded')).toHaveCount(0);
        await expect(page.locator('#chat-fold-toggle-btn')).toHaveText('≡');
    });

    test('fold target select controls which role folds', async ({ page }) => {
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        // 选择只折叠助手消息
        await page.locator('#chat-fold-target-select').selectOption('assistant');
        await page.locator('#chat-fold-toggle-btn').click();

        // 断言：助手消息折叠，用户消息不折叠
        const assistantFolded = page.locator('.chat-msg-assistant.folded');
        const userFolded = page.locator('.chat-msg-user.folded');
        await expect(assistantFolded).toHaveCount(1);
        await expect(userFolded).toHaveCount(0);
    });

    test('fold height select changes collapsed height', async ({ page }) => {
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        // 选择 80px 折叠高度后折叠
        await page.locator('#chat-fold-height-select').selectOption('80');
        await page.locator('#chat-fold-toggle-btn').click();

        // 断言：折叠消息的 maxHeight 为 80px
        const foldedMsg = page.locator('.chat-msg.folded').first();
        await expect(foldedMsg).toHaveCSS('max-height', '80px');
    });

    test('single message fold via toggle button', async ({ page }) => {
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        // 通过 JS 点击折叠按钮（hover 时才显示，Playwright 需要强制可见）
        const userMsg = page.locator('.chat-msg-user');
        await userMsg.evaluate(el => el.querySelector('.msg-fold-toggle-btn').click());

        // 断言：用户消息折叠，助手消息不折叠
        await expect(page.locator('.chat-msg-user.folded')).toHaveCount(1);
        await expect(page.locator('.chat-msg-assistant.folded')).toHaveCount(0);
    });

    test('navigation shows round count format', async ({ page }) => {
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        // 断言：位置显示为 /2（2轮对话）
        await expect(page.locator('#chat-nav-position')).toHaveText('/2');
        // 断言：goto 输入框值为 1（当前第1轮）
        await expect(page.locator('#chat-nav-goto-input')).toHaveValue('1');
    });

    test('prev/next navigation scrolls to user messages', async ({ page }) => {
        // 发送两条消息制造 2 轮对话
        await page.locator('#chat-input').fill('first');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg-user')).toHaveCount(1);

        await page.locator('#chat-input').fill('second');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg-user')).toHaveCount(2);

        // 当前在第2轮，点击上一轮
        await page.locator('#chat-nav-prev').click();
        await expect(page.locator('#chat-nav-goto-input')).toHaveValue('1');

        // 点击下一轮回到第2轮
        await page.locator('#chat-nav-next').click();
        await expect(page.locator('#chat-nav-goto-input')).toHaveValue('2');
    });

    test('goto input navigates to specified round', async ({ page }) => {
        // 发送三条消息制造 3 轮对话
        for (const text of ['first', 'second', 'third']) {
            await page.locator('#chat-input').fill(text);
            await page.locator('#chat-send-btn').click();
            // 等待后端响应完成（无论成功或失败）
            await page.waitForTimeout(500);
        }
        await expect(page.locator('#chat-msg-user')).toHaveCount(3);

        // 输入跳转编号 2
        const gotoInput = page.locator('#chat-nav-goto-input');
        await gotoInput.fill('2');
        await gotoInput.press('Enter');

        // 断言：第二个用户消息获得导航高亮
        const secondMsg = page.locator('#chat-msg-user').nth(1);
        await expect(secondMsg).toHaveClass(/msg-nav-highlight/);
    });

    test('slash commands /fold and /expand', async ({ page }) => {
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        // 使用 /fold all 命令
        await page.locator('#chat-input').fill('/fold all');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg.folded')).toHaveCount(2);

        // 使用 /expand all 命令
        await page.locator('#chat-input').fill('/expand all');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg.folded')).toHaveCount(0);
    });

    test('slash commands /prev /next /goto', async ({ page }) => {
        // 发送三条消息
        for (const text of ['first', 'second', 'third']) {
            await page.locator('#chat-input').fill(text);
            await page.locator('#chat-send-btn').click();
            await page.waitForTimeout(500);
        }
        await expect(page.locator('#chat-msg-user')).toHaveCount(3);

        // /prev 导航到上一轮
        await page.locator('#chat-input').fill('/prev');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('#chat-nav-goto-input')).toHaveValue('2');

        // /goto 1 跳转到第1轮
        await page.locator('#chat-input').fill('/goto 1');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('#chat-nav-goto-input')).toHaveValue('1');

        // /next 导航到下一轮
        await page.locator('#chat-input').fill('/next');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('#chat-nav-goto-input')).toHaveValue('2');
    });

    test('fold toggle button state changes correctly', async ({ page }) => {
        // 初始状态：≡ 按钮，目标选择可用
        await expect(page.locator('#chat-fold-toggle-btn')).toHaveText('≡');
        await expect(page.locator('#chat-fold-target-select')).toBeEnabled();

        // 发送消息后折叠
        await page.locator('#chat-input').fill('hello');
        await page.locator('#chat-send-btn').click();
        await expect(page.locator('.chat-msg')).toHaveCount(2);

        await page.locator('#chat-fold-toggle-btn').click();

        // 折叠后：⊕ 按钮，目标选择禁用
        await expect(page.locator('#chat-fold-toggle-btn')).toHaveText('⊕');
        await expect(page.locator('#chat-fold-target-select')).toBeDisabled();
    });
});