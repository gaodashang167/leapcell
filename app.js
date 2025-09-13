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

const UUID = process.env.UUID || '9c7acc53-03cb-4fb6-b99b-c79af196c786'; //填你的UUID
const uuid = UUID.replace(/-/g, ''); // 无须理会
const DOMAIN = process.env.DOMAIN || 'leapcell1.svip888.us.kg';  //项目域名或已反代的域名，不带前缀，建议填已反代的域名
const NAME = process.env.NAME || 'SG-Webfreecloud-ws'; //节点备注名称
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'rqnezha1.wuge.nyc.mn:80'; // 哪吒v1填写形式: nz.abc.com:8008
const NEZHA_PORT = process.env.NEZHA_PORT || ''; // 使用哪吒v1请留空
const NEZHA_KEY = process.env.NEZHA_KEY || 'XehG4tV7a95d8okpPr6n5C7KIRV58Fgb'; // 哪吒v1的NZ_CLIENT_SECRET
  
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      // 检测哪吒是否开启TLS
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      // 生成哪吒config.yaml
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
      
      fs.writeFileSync(path.join(__dirname, 'config.yaml'), configYaml);
      }
} 
// ========== 工具函数定义 ==========
// 获取系统架构
function getSystemArchitecture() {
    const arch = os.arch();
    return ['arm', 'arm64', 'aarch64'].includes(arch) ? 'arm' : 'amd';
}

// 获取对应架构的下载URL
function getDownloadUrls() {
    const architecture = getSystemArchitecture();
    return architecture === 'arm' ? {
        npm: "https://arm64.ssss.nyc.mn/v1",
    } : {
        npm: "https://amd64.ssss.nyc.mn/v1",
    };
}

// 检查进程是否运行
async function isProcessRunning(processName) {
    try {
        // 使用更精确的进程检查方式
        const cmd = `ps -eo pid,cmd | grep -E "[n]pm -c config.yaml" || true`;
        const { stdout } = await exec(cmd);
        return stdout.trim().length > 0;
    } catch (err) {
        console.error('检查进程出错:', err);
        return false;
    }
}

// 添加进程启动锁防止重复启动
let isStartingProcess = false;

// 下载文件（增强版）
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

// 确保文件存在
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

// ========== 服务函数定义 ==========

async function runNezha() {
    if (!NEZHA_KEY) {
        console.log('哪吒监控配置不完整，跳过启动');
        return false;
    }

    const urls = getDownloadUrls();
    if (!await ensureFile('npm', urls.npm)) return false;

    try {
        // 先检查是否已有进程在运行
        if (await isProcessRunning('npm')) {
            console.log('哪吒监控已在运行，跳过启动');
            return true;
        }

        console.log('启动哪吒监控...');
        // 使用明确的进程启动方式
        const { stdout, stderr } = await exec(`./npm -c config.yaml > npm.log 2>&1 &`);
        
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
        
        // 哪吒监控检查
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
    }, 5 * 60 * 1000); // 延长到5分钟检查一次
}

// ========== 主程序 ==========
// 创建 HTTP 服务器
app.get("/", (req, res) => {
  res.send("hello world");
});

app.get("/sub", (req, res) => {
  const vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F#${NAME}`;
  
  const base64Content = Buffer.from(vlessURL).toString('base64');

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(base64Content + '\n');
});

//获取系统进程表
app.get("/status", async (req, res) => {
  try {
    const { stdout } = await exec("ps -ef", { timeout: 5000 });
    res.type("html").send("<pre>命令行执行结果：\n" + stdout + "</pre>");
  } catch (err) {
    res.type("html").send("<pre>命令行执行错误：\n" + err + "</pre>");
  }
});

    // 终止所有进程端点
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

// 统一使用res.status().send()格式 处理其他路由
app.use((req, res) => {
  res.status(404).type('text/plain').end('Not Found\n');
});

// 启动 HTTP 服务器（不指定端口，由平台自动分配）
const server = app.listen(process.env.PORT || 0, () => {
  console.log(`Server is listening`);
});

// 创建 WebSocket 服务器，复用 HTTP 的 server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.once('message', (msg) => {
    const [VERSION] = msg;
    const id = msg.slice(1, 17);

    // 检查 UUID 是否匹配
    if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) {
      return;
    }

    let i = msg.slice(17, 18).readUInt8() + 19;
    const port = msg.slice(i, (i += 2)).readUInt16BE(0);
    const ATYP = msg.slice(i, (i += 1)).readUInt8();

    // 解析目标主机（IPv4 / 域名 / IPv6）
    const host =
      ATYP == 1
        ? msg.slice(i, (i += 4)).join('.') // IPv4
        : ATYP == 2
        ? new TextDecoder().decode(msg.slice(i + 1, (i += 1 + msg.slice(i, i + 1).readUInt8()))) // 域名
        : ATYP == 3
        ? msg.slice(i, (i += 16)).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), [])
            .map((b) => b.readUInt16BE(0).toString(16))
            .join(':') // IPv6
        : '';

    // 返回成功响应（VERSION + 0x00）
    ws.send(new Uint8Array([VERSION, 0]));

    // 创建 WebSocket 双工流
    const duplex = createWebSocketStream(ws);

    // 连接目标服务器（host:port）
    net.connect({ host, port }, function () {
      this.write(msg.slice(i)); // 发送剩余数据
      duplex
        .on('error', () => {}) // 忽略错误
        .pipe(this)
        .on('error', () => {}) // 忽略错误
        .pipe(duplex);
    }).on('error', () => {}); // 忽略连接错误
  }).on('error', () => {}); // 忽略 WebSocket 错误
});

// 主启动函数
async function startServer() {
    console.log('=== 服务启动开始 ===');

    // 初始启动服务
    await runNezha();

    // 启动监控
    monitorAndRun();

    console.log('=== 服务启动完成 ===');
    console.log('提示: 程序将持续监控服务状态，自动修复问题');
}

// 全局错误处理
process.on('unhandledRejection', (err) => {
    console.error('未处理的Promise拒绝:', err);
});

process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
});
// 进程清理机制 在程序退出时清理
process.on('SIGINT', async () => {
    console.log('收到终止信号，清理进程...');
    try {
        await exec('pkill -f "npm -c config.yaml"');
    } catch (err) {
        console.error('清理进程出错:', err);
    }
    process.exit(0);
});

// 启动服务（延迟2秒确保服务器完全启动）
setTimeout(() => {
    startServer().catch(err => {
        console.error('启动失败:', err);
        process.exit(1);
    });
}, 2000);
