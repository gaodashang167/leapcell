const os = require('os');
const http = require('http');
const fs = require('fs');
const axios = require('axios');
const net = require('net');
const { exec } = require('child_process');
const { WebSocket, createWebSocketStream } = require('ws');

const UUID = process.env.UUID || '73614eda-1d6d-4ace-9ecd-a626667b321d';
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'rqnezha1.wuge.nyc.mn:80';
const NEZHA_KEY = process.env.NEZHA_KEY || 'XehG4tV7a95d8okpPr6n5C7KIRV58Fgb';
const DOMAIN = process.env.DOMAIN || 'leapcell1.svip888.us.kg';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const WSPATH = process.env.WSPATH || UUID.slice(0, 8);
const SUB_PATH = process.env.SUB_PATH || 'sub';
const NAME = process.env.NAME || 'Vls';
const PORT = process.env.PORT || 3000;

let ISP = '';
(async () => {
  try {
    const res = await axios.get('https://speed.cloudflare.com/meta');
    const data = res.data;
    ISP = `${data.country}-${data.asOrganization}`.replace(/ /g, '_');
  } catch (e) {
    ISP = 'Unknown';
  }
})();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello, World\n');
  } else if (req.url === `/${SUB_PATH}`) {
    const vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F${WSPATH}#${NAME}-${ISP}`;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(Buffer.from(vlessURL).toString('base64') + '\n');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
  }
});

const wss = new WebSocket.Server({ server: httpServer });
const uuid = UUID.replace(/-/g, '');
wss.on('connection', ws => {
  ws.once('message', msg => {
    const [VERSION] = msg;
    const id = msg.slice(1, 17);
    if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
    let i = msg.slice(17, 18).readUInt8() + 19;
    const port = msg.slice(i, i += 2).readUInt16BE(0);
    const ATYP = msg.slice(i, i += 1).readUInt8();
    const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
      (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
      (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));
    ws.send(new Uint8Array([VERSION, 0]));
    const duplex = createWebSocketStream(ws);
    net.connect({ host, port }, function() {
      this.write(msg.slice(i));
      duplex.on('error', () => {}).pipe(this).on('error', () => {}).pipe(duplex);
    }).on('error', () => {});
  }).on('error', () => {});
});

// ========== 哪吒自动下载 & 运行 ==========
const TMP_DIR = '/tmp';
const NPM_PATH = `${TMP_DIR}/npm`;
const CONFIG_PATH = `${TMP_DIR}/config.yaml`;

const getDownloadUrl = () => {
  const arch = os.arch();
  return arch.startsWith('arm') ? 'https://official-nezha-v1-arm64-url' : 'https://official-nezha-v1-amd64-url';
};

const downloadFile = async () => {
  if (!NEZHA_SERVER || !NEZHA_KEY) return;
  const url = getDownloadUrl();
  const writer = fs.createWriteStream(NPM_PATH);
  const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 30000 });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      fs.chmodSync(NPM_PATH, 0o755);
      resolve();
    });
    writer.on('error', reject);
  });
};

const runNezha = async () => {
  if (!NEZHA_SERVER || !NEZHA_KEY) return;

  // 写 config.yaml 到 /tmp
  const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
  const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
  const NZ_TLS = tlsPorts.includes(port) ? 'true' : 'false';

  const configYaml = `client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${NEZHA_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${NZ_TLS}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

  fs.writeFileSync(CONFIG_PATH, configYaml);

  await downloadFile();

  exec(`${NPM_PATH} -c ${CONFIG_PATH} >/dev/null 2>&1 &`, (err) => {
    if (err) console.error('Nezha start error:', err);
    else console.log('Nezha started successfully');
  });
};

// 自动访问任务
const addAccessTask = async () => {
  if (!AUTO_ACCESS || !DOMAIN) return;
  try {
    await axios.post("https://oooo.serv00.net/add-url", { url: `https://${DOMAIN}/${SUB_PATH}` }, { headers: { 'Content-Type': 'application/json' } });
    console.log('Automatic access task added');
  } catch (e) {}
};

// 启动 HTTP & WebSocket
httpServer.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);
  await runNezha();
  setTimeout(addAccessTask, 5000);
});
