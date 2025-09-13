const os = require('os');
const fs = require('fs');
const net = require('net');
const dns = require('dns');
const http = require('http');
const { Buffer } = require('buffer');

// 环境变量
const UUID = process.env.UUID || '76811774-3027-4d00-a278-d0b11aedfc28';
const XPATH = process.env.XPATH || UUID.slice(0, 8);
const SUB_PATH = process.env.SUB_PATH || 'sub';
const DOMAIN = process.env.DOMAIN || '';
const NAME = process.env.NAME || '';
const PORT = process.env.PORT || 3000;

// 核心配置（内存友好）
const SETTINGS = {
    ['UUID']: UUID,
    ['LOG_LEVEL']: 'none',
    ['XPATH']: `%2F${XPATH}`,
    ['MAX_BUFFERED_POSTS']: 20,
    ['MAX_POST_SIZE']: 1000000,
    ['SESSION_TIMEOUT']: 15000,
    ['CHUNK_SIZE']: 32 * 1024,
};

// 简单日志函数
function log(...args) {
    if (SETTINGS.LOG_LEVEL !== 'none') {
        console.log('[LOG]', ...args);
    }
}

// 获取服务器 IP（简化版）
async function getServerIP() {
    if (DOMAIN) return DOMAIN;
    try {
        const res = await fetch('https://api.ipify.org');
        return await res.text();
    } catch {
        return '127.0.0.1';
    }
}

// 生成随机 padding
function generatePadding(min, max) {
    const length = min + Math.floor(Math.random() * (max - min));
    return Buffer.from(Array(length).fill('X').join('')).toString('base64');
}

let IP = '127.0.0.1';

getServerIP().then(ip => {
    IP = ip;
    log('Server IP:', IP);
});

// 创建 http 服务
const server = http.createServer((req, res) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        'X-Padding': generatePadding(50, 200),
    };

    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello, Leapcell!\n');
        return;
    }

    if (req.url === `/${SUB_PATH}`) {
        const nodeName = NAME ? `${NAME}` : 'Leapcell-Node';
        const vlessURL = `vless://${UUID}@${IP}:443?encryption=none&security=tls&sni=${IP}&fp=chrome&type=xhttp&host=${IP}&path=${SETTINGS.XPATH}#${nodeName}`;
        const base64Content = Buffer.from(vlessURL).toString('base64');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(base64Content + '\n');
        return;
    }

    res.writeHead(404);
    res.end();
});

// 启动服务
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
