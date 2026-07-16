// 从yoyapai.com获取最新的v2rayN节点,并保存到文件
// ---------- 引入依赖 ----------
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const urlModule = require('url');

// ---------- 配置 ----------
const TARGET_FILE = 'E:\\myFile\\GitHub\\v2rayN-project\\v2rayN.txt';
const LIST_PAGE = 'https://yoyapai.com/category/mianfeijiedian';
const LINK_SELECTOR = '.entry-title a, .post-title a, article h2 a, article h3 a, .wp-block-post-title a';
// 超时设置
const TIMEOUT = 30000;

// ---------- 工具函数 ----------

// 判断字符串是否为 URL
function isValidUrl(str) {
    try {
        const parsed = new URL(str);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// 从文本中提取第一个 URL（如果文本包含多个，只取第一个）
function extractUrl(text) {
    const urlRegex = /https?:\/\/[^\s"<>]+/g;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
}

// 下载 URL 内容（支持 http / https，自动跟随重定向）
function downloadUrl(targetUrl) {
    return new Promise((resolve, reject) => {
        const parsed = urlModule.parse(targetUrl);
        const protocol = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        const req = protocol.get(options, (res) => {
            // 处理重定向
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    console.error(`[INFO] 重定向到: ${redirectUrl}`);
                    return downloadUrl(redirectUrl).then(resolve).catch(reject);
                }
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(TIMEOUT, () => {
            req.destroy();
            reject(new Error('下载超时'));
        });
    });
}

// 写入文件（覆盖）
function writeFile(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.error(`[SUCCESS] 文件已写入: ${filePath}`);
}

// ---------- 主流程 ----------

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setDefaultTimeout(TIMEOUT);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. 访问列表页
        console.error('[INFO] 正在访问列表页...');
        await page.goto(LIST_PAGE, { waitUntil: 'networkidle2' });

        // 2. 等待第一个链接出现
        await page.waitForSelector(LINK_SELECTOR, { timeout: 15000 });
        console.error('[INFO] 找到第一个列表项');

        // 3. 获取第一个链接的 href
        const firstHref = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? el.href : null;
        }, LINK_SELECTOR);

        if (!firstHref) {
            throw new Error('未获取到第一个链接的 URL');
        }
        console.error(`[INFO] 第一个链接地址: ${firstHref}`);

        // 4. 跳转到详情页
        await page.goto(firstHref, { waitUntil: 'networkidle2' });

        // 5. 等待 #codeblock-1 出现
        await page.waitForSelector('#codeblock-1', { timeout: 15000 });
        console.error('[INFO] 成功加载详情页并找到 codeblock-1');

        // 6. 获取 #codeblock-1 的文本内容
        const rawText = await page.$eval('#codeblock-1', el => el.textContent || el.innerText || '');
        console.error('[INFO] 获取到的原始内容:', rawText.substring(0, 100) + '...');

        // 7. 处理内容：判断是否为 URL
        let finalContent = '';
        let urlToDownload = null;

        // 尝试提取 URL
        const extractedUrl = extractUrl(rawText);
        if (extractedUrl && isValidUrl(extractedUrl)) {
            urlToDownload = extractedUrl;
            console.error(`[INFO] 检测到订阅链接: ${urlToDownload}`);
        } else if (isValidUrl(rawText.trim())) {
            urlToDownload = rawText.trim();
            console.error(`[INFO] 检测到纯订阅链接: ${urlToDownload}`);
        }

        if (urlToDownload) {
            // 下载订阅内容
            console.error('[INFO] 开始下载订阅文件...');
            finalContent = await downloadUrl(urlToDownload);
            console.error(`[INFO] 下载完成，共 ${finalContent.length} 字节`);
        } else {
            // 不是 URL，直接使用原文本（可能是节点配置）
            console.error('[INFO] 未检测到订阅链接，将直接保存原文本');
            finalContent = rawText;
        }

        // 8. 写入目标文件
        writeFile(TARGET_FILE, finalContent);
        console.error('[SUCCESS] 操作全部完成！');

        await browser.close();
        process.exit(0);

    } catch (error) {
        console.error('[ERROR] 执行失败:', error.message);
        if (browser) await browser.close();
        process.exit(1);
    }
})();