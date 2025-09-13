const net = require("net");
const http = require("http");
const { Buffer } = require("buffer");

// 基础配置
const UUID = process.env.UUID || "76811774-3027-4d00-a278-d0b11aedfc28";
const XPATH = process.env.XPATH || UUID.slice(0, 8);
const SUB_PATH = process.env.SUB_PATH || "sub";
const DOMAIN = process.env.DOMAIN || "";
const NAME = process.env.NAME || "LeapcellNode";
const PORT = process.env.PORT || 3000;

// 工具函数
function parse_uuid(uuid) {
  uuid = uuid.replace(/-/g, "");
  const r = [];
  for (let i = 0; i < 16; i++) {
    r.push(parseInt(uuid.substr(i * 2, 2), 16));
  }
  return r;
}
function validate_uuid(left, right) {
  for (let i = 0; i < 16; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}
function generatePadding(min, max) {
  const length = min + Math.floor(Math.random() * (max - min));
  return Buffer.from(Array(length).fill("X").join("")).toString("base64");
}

// 解析 VLESS 头
async function read_vless_header(reader, cfg_uuid_str) {
  let header = Buffer.alloc(0);
  let readed = 0;
  const need = 1 + 16 + 1;

  while (readed < need) {
    const { value, done } = await reader.read();
    if (done) throw new Error("header too short");
    header = Buffer.concat([header, value]);
    readed = header.length;
  }

  const version = header[0];
  const uuid = header.slice(1, 17);
  const cfg_uuid = Buffer.from(parse_uuid(cfg_uuid_str));
  if (!validate_uuid(uuid, cfg_uuid)) {
    throw new Error("invalid uuid");
  }

  const optLen = header[17];
  const cmd = header[18 + optLen];
  const portIndex = 18 + optLen + 1;
  const port = header.readUInt16BE(portIndex);
  const atype = header[portIndex + 2];

  let host = "";
  let offset = portIndex + 3;
  if (atype === 1) {
    // IPv4
    host = Array.from(header.slice(offset, offset + 4)).join(".");
    offset += 4;
  } else if (atype === 2) {
    // 域名
    const len = header[offset];
    host = header.slice(offset + 1, offset + 1 + len).toString();
    offset += 1 + len;
  } else if (atype === 3) {
    // IPv6
    const data = header.slice(offset, offset + 16);
    host = data.toString("hex").match(/.{1,4}/g).join(":");
    offset += 16;
  }

  return {
    version,
    targetHost: host,
    targetPort: port,
    data: header.slice(offset),
    resp: Buffer.from([version, 0]),
  };
}

// HTTP 服务
const server = http.createServer(async (req, res) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
    "X-Padding": generatePadding(50, 200),
  };

  // 首页
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello, Leapcell VLESS Node\n");
    return;
  }

  // 输出订阅
  if (req.url === `/${SUB_PATH}`) {
    const nodeName = NAME;
    const vlessURL = `vless://${UUID}@${DOMAIN || "example.com"}:${PORT}?encryption=none&security=none&type=xhttp&path=/${XPATH}#${nodeName}`;
    const base64Content = Buffer.from(vlessURL).toString("base64");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(base64Content + "\n");
    return;
  }

  // VLESS 流量处理
  const match = req.url.match(new RegExp(`/${XPATH}/([^/]+)`));
  if (match && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.write(Buffer.from([0, 0])); // VLESS 响应头

    let remote = null;
    let buffer = Buffer.alloc(0);

    req.socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // 第一次解析 VLESS header
      if (!remote) {
        try {
          const fakeReader = {
            read: async () => {
              if (buffer.length === 0) return { value: null, done: true };
              const b = buffer;
              buffer = Buffer.alloc(0);
              return { value: b, done: false };
            },
          };
          read_vless_header(fakeReader, UUID).then((info) => {
            console.log(`➡️ 连接目标: ${info.targetHost}:${info.targetPort}`);
            remote = net.createConnection(
              { host: info.targetHost, port: info.targetPort },
              () => {
                // 发剩余数据
                if (info.data.length > 0) {
                  remote.write(info.data);
                }
                // 建立转发
                req.socket.pipe(remote).pipe(res);
              }
            );
            remote.on("error", () => res.end());
          });
        } catch (e) {
          console.error("VLESS header parse failed:", e.message);
          req.socket.destroy();
        }
      }
    });

    req.socket.on("end", () => res.end());
    return;
  }

  res.writeHead(404);
  res.end();
});

// 启动
server.listen(PORT, () => {
  console.log(`✅ VLESS server running on port ${PORT}`);
});
